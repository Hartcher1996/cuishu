import { ref, computed, watch, type Ref } from 'vue'
import Reader from '../components/Reader.vue'
import { ListEdgeVoices, Synthesize, SaveTtsSettings, LoadTtsSettings, SaveProgress } from '../../wailsjs/go/main/App'

// 可朗读段落
export interface Para { text: string; anchor?: string }
// 书籍元数据
export interface Book { title: string; suffix: string; category: string; path: string }
// edge-tts 嗓音
interface EdgeVoice { name: string; shortName: string; gender: string; locale: string; localName: string }
export type TtsEngine = 'web' | 'edge'

/**
 * TTS 朗读组合式函数
 * 将所有朗读相关的状态与逻辑从 App.vue 抽出，App.vue 仅负责书库管理与模板组装。
 *
 * 依赖通过 ref 参数传入，便于与 App.vue 的书库状态共享同一份响应式引用。
 */
export function useTts(
  paragraphs: Ref<Para[]>,
  currentIdx: Ref<number>,
  currentBook: Ref<Book | null>,
  readerRef: Ref<InstanceType<typeof Reader> | null>,
  audioEl: Ref<HTMLAudioElement | null>,
  volume: Ref<number>,
) {
  // === 朗读状态 ===
  const isPlaying = ref(false)
  const rate = ref(1.0)
  const voiceURI = ref('')
  const voices = ref<SpeechSynthesisVoice[]>([])
  const statusText = ref('就绪')

  // TTS 引擎：web = Windows 系统语音，edge = edge-tts 在线语音
  const ttsEngine = ref<TtsEngine>('edge')
  const edgeVoices = ref<EdgeVoice[]>([])

  let synth: SpeechSynthesis | null = null

  // edge-tts 预合成缓存：idx → blob URL
  // LRU 上限 30 段，防止长书越攒越多导致内存膨胀
  const audioCache = new Map<number, string>()
  const AUDIO_CACHE_MAX = 30
  const pendingSet = new Set<number>() // 正在合成的 idx
  // 替代轮询的等待者：合成完成后通知所有等待该 idx 的 Promise
  const cacheWaiters = new Map<number, (() => void)[]>()
  let speakCancelled = false

  // LRU 写：移到最末，超上限时撤销最早的 blob URL
  function audioCacheSet(idx: number, url: string) {
    audioCache.delete(idx)
    audioCache.set(idx, url)
    while (audioCache.size > AUDIO_CACHE_MAX) {
      const oldest = audioCache.keys().next().value
      if (oldest === undefined) break
      const oldUrl = audioCache.get(oldest)
      if (oldUrl) URL.revokeObjectURL(oldUrl)
      audioCache.delete(oldest)
    }
  }

  // LRU 读：命中后移到最末（标记最近使用）
  function audioCacheGet(idx: number): string | undefined {
    const url = audioCache.get(idx)
    if (url) {
      audioCache.delete(idx)
      audioCache.set(idx, url)
    }
    return url
  }

  function notifyCacheReady(idx: number) {
    const waiters = cacheWaiters.get(idx)
    if (waiters) {
      cacheWaiters.delete(idx)
      waiters.forEach(fn => fn())
    }
  }

  function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T & { cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | null = null
    const wrapped = ((...args: any[]) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => fn(...args), ms)
    }) as T & { cancel: () => void }
    wrapped.cancel = () => {
      if (timer) { clearTimeout(timer); timer = null }
    }
    return wrapped
  }

  // 进度保存节流：朗读推进时每段都触发 SaveProgress 会频繁 IO，debounce 500ms 合并
  const debouncedSaveProgress = debounce((bookPath: string, idx: number) => {
    SaveProgress(bookPath, idx)
  }, 500)

  // 立即刷写未保存的进度（停止/卸载时调用）
  function flushProgress() {
    debouncedSaveProgress.cancel()
    if (currentBook.value) {
      SaveProgress(currentBook.value.path, currentIdx.value)
    }
  }

  // TTS 设置持久化（读写 exe 同级 tts-settings.json）
  let savedEdgeVoice = ''
  let savedWebVoice = ''
  async function loadTtsSettings() {
    try {
      const s = await LoadTtsSettings()
      if (s.rate && s.rate > 0) rate.value = s.rate
      if (s.engine === 'web' || s.engine === 'edge') ttsEngine.value = s.engine
      savedEdgeVoice = s.edgeVoice || ''
      savedWebVoice = s.webVoice || ''
    } catch {}
  }
  function saveTtsSettings() {
    try {
      SaveTtsSettings(
        rate.value,
        ttsEngine.value,
        ttsEngine.value === 'edge' ? voiceURI.value : savedEdgeVoice,
        ttsEngine.value === 'web' ? voiceURI.value : savedWebVoice,
      )
    } catch {}
  }

  // 加载 edge-tts 嗓音列表
  async function loadEdgeVoices() {
    try {
      const list = await ListEdgeVoices() as EdgeVoice[]
      edgeVoices.value = list
      if (list.length > 0) {
        // 优先恢复保存的嗓音，否则默认晓晓
        const saved = savedEdgeVoice && list.find(v => v.shortName === savedEdgeVoice)
        const xiaoxiao = list.find(v => v.shortName.includes('Xiaoxiao'))
        const defaultVoice = saved ? saved.shortName : (xiaoxiao ? xiaoxiao.shortName : list[0].shortName)
        if (ttsEngine.value === 'edge' || !voiceURI.value) {
          voiceURI.value = defaultVoice
        }
      }
    } catch (e) {
      console.error('加载 edge-tts 嗓音失败', e)
      statusText.value = 'Edge 语音加载失败，可切换系统语音'
    }
  }

  // 加载系统语音列表（同时负责初始化 speechSynthesis 与 onvoiceschanged 监听）
  function loadVoices() {
    if (!('speechSynthesis' in window)) return
    if (!synth) {
      synth = window.speechSynthesis
      synth.onvoiceschanged = loadVoices
    }
    const all = synth.getVoices()
    // 优先中文嗓音
    const zh = all.filter(v => v.lang.startsWith('zh'))
    voices.value = zh.length > 0 ? zh : all
    if (voices.value.length > 0) {
      // 优先恢复保存的嗓音
      const saved = savedWebVoice && voices.value.find(v => v.voiceURI === savedWebVoice)
      if (ttsEngine.value === 'web' || !voiceURI.value) {
        voiceURI.value = saved ? saved.voiceURI : voices.value[0].voiceURI
      }
    }
  }

  // 嗓音友好名映射：英文名 → 中文名·性别
  const voiceMap: Record<string, [string, string]> = {
    xiaoxiao: ['晓晓', '女'], huihui: ['慧慧', '女'], yaoyao: ['瑶瑶', '女'],
    xiaoyi: ['晓伊', '女'], xiaochen: ['晓辰', '女'], xiaohan: ['晓涵', '女'],
    xiaomeng: ['晓梦', '女'], xiaomo: ['晓墨', '女'], xiaoqiu: ['晓秋', '女'],
    xiaorui: ['晓睿', '女'], xiaoshuang: ['晓双', '女'], xiaowen: ['晓文', '女'],
    xiaoxuan: ['晓萱', '女'], xiaoyan: ['晓颜', '女'], xiaozhen: ['晓甄', '女'],
    yunyang: ['云扬', '男'], yunxi: ['云希', '男'], yunfeng: ['云枫', '男'],
    yunjian: ['云健', '男'], yunhao: ['云皓', '男'], kangkang: ['康康', '男'],
  }
  function friendlyVoiceName(v: SpeechSynthesisVoice): string {
    const lower = v.name.toLowerCase()
    for (const key in voiceMap) {
      if (lower.includes(key)) {
        const [zh, gender] = voiceMap[key]
        return `${zh} · ${gender}`
      }
    }
    return v.name
  }
  // edge-tts 英文名 → 中文名映射
  const edgeNameMap: Record<string, string> = {
    Xiaoxiao: '晓晓', Yunxi: '云希', Yunyang: '云扬', Yunjian: '云健',
    Xiaoyi: '晓伊', Yunfeng: '云枫', Yunhao: '云皓',
    Huihui: '慧慧', Kangkang: '康康', Yaoyao: '瑶瑶',
    Xiaohan: '晓涵', Xiaomeng: '晓梦', Xiaomo: '晓墨', Xiaoqiu: '晓秋',
    Xiaorui: '晓睿', Xiaoshuang: '晓双', Xiaowen: '晓文',
    Xiaoxuan: '晓萱', Xiaoyan: '晓颜', Xiaozhen: '晓甄',
    Xiaochen: '晓辰',
    HiuGaai: '曉佳', HiuMaan: '曉曼', WanLung: '雲龍',
    HsiaoChen: '曉臻', HsiaoYu: '曉雨', YunChien: '雲健',
    YunJhe: '雲哲',
  }
  function edgeVoiceLabel(v: EdgeVoice): string {
    const gender = v.gender === 'Female' ? '女' : v.gender === 'Male' ? '男' : ''
    // 从 ShortName 提取英文名：zh-CN-XiaoxiaoNeural → Xiaoxiao
    const m = v.shortName.match(/-([A-Za-z]+)Neural$/)
    let name = m ? m[1] : v.shortName
    for (const key in edgeNameMap) {
      if (name.toLowerCase().includes(key.toLowerCase())) {
        name = edgeNameMap[key]
        break
      }
    }
    return `${name}${gender ? ' · ' + gender : ''}`
  }

  const voiceOptions = computed(() => {
    if (ttsEngine.value === 'edge') {
      return edgeVoices.value.map(v => ({ uri: v.shortName, label: edgeVoiceLabel(v) }))
    }
    return voices.value.map(v => ({ uri: v.voiceURI, label: friendlyVoiceName(v) }))
  })

  // rate 数值转 edge-tts 百分比字符串
  function rateToEdgeStr(r: number): string {
    const pct = Math.round((r - 1) * 100)
    return (pct >= 0 ? '+' : '') + pct + '%'
  }

  // === 朗读核心 ===
  function speakFrom(idx: number) {
    if (idx < 0 || idx >= paragraphs.value.length) {
      stopSpeak()
      return
    }
    currentIdx.value = idx
    isPlaying.value = true
    speakCancelled = false
    readerRef.value?.highlight(idx)

    if (ttsEngine.value === 'web') {
      speakWeb(idx)
    } else {
      // 清空旧缓存，预合成当前段及后续段（语速越快预取越多）
      clearAudioCache()
      const prefetchCount = Math.min(8, Math.max(4, Math.round(6 * rate.value)))
      prefetchEdge(idx, prefetchCount)
      playEdge(idx)
    }
  }

  // 系统语音朗读
  function speakWeb(idx: number) {
    if (!synth) return
    synth.cancel()
    const para = paragraphs.value[idx]
    const u = new SpeechSynthesisUtterance(para.text)
    u.lang = 'zh-CN'
    u.rate = rate.value
    u.volume = volume.value / 100
    const v = voices.value.find(v => v.voiceURI === voiceURI.value)
    if (v) u.voice = v
    u.onend = onParagraphEnd
    u.onerror = () => {
      isPlaying.value = false
      statusText.value = '朗读出错'
    }
    statusText.value = `正在朗读：第 ${idx + 1} / ${paragraphs.value.length} 段`
    synth.speak(u)
  }

  // 合成单段并返回 blob URL
  async function synthesizeEdge(idx: number): Promise<string> {
    const para = paragraphs.value[idx]
    const result = await Synthesize(para.text, voiceURI.value, rateToEdgeStr(rate.value))
    let bytes: Uint8Array
    if (typeof result === 'string') {
      const bin = atob(result)
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } else {
      bytes = new Uint8Array(result as number[])
    }
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/mpeg' })
    return URL.createObjectURL(blob)
  }

  // 预合成从 fromIdx 开始的 count 段（并发执行）
  async function prefetchEdge(fromIdx: number, count: number) {
    const tasks: Promise<void>[] = []
    for (let i = 0; i < count; i++) {
      const idx = fromIdx + i
      if (idx >= paragraphs.value.length) break
      if (audioCache.has(idx) || pendingSet.has(idx)) continue
      pendingSet.add(idx)
      tasks.push((async () => {
        try {
          const url = await synthesizeEdge(idx)
          if (!speakCancelled) {
            audioCacheSet(idx, url)
            notifyCacheReady(idx)
          } else {
            URL.revokeObjectURL(url)
          }
        } catch (e) {
          console.error('预合成失败', idx, e)
          // 失败也通知等待者，避免它们永久挂起
          notifyCacheReady(idx)
        } finally {
          pendingSet.delete(idx)
        }
      })())
    }
    await Promise.all(tasks)
  }

  // edge-tts 播放指定段（优先用缓存）
  async function playEdge(idx: number) {
    if (speakCancelled || !isPlaying.value) return
    const cached = audioCacheGet(idx)
    if (cached) {
      doPlayEdge(idx, cached)
      // 继续预合成后面的（语速越快补越多）
      const refill = Math.min(6, Math.max(3, Math.round(4 * rate.value)))
      prefetchEdge(idx + 1, refill)
      return
    }
    // 缓存未命中，等待合成
    statusText.value = `合成中：第 ${idx + 1} / ${paragraphs.value.length} 段`
    if (pendingSet.has(idx)) {
      // 已在合成中，事件驱动等待
      await waitForCache(idx)
      if (speakCancelled) return
      const url = audioCacheGet(idx)
      if (url) doPlayEdge(idx, url)
      else {
        // 合成失败
        isPlaying.value = false
        statusText.value = 'Edge 合成失败，请检查网络'
      }
    } else {
      try {
        const url = await synthesizeEdge(idx)
        if (speakCancelled) { URL.revokeObjectURL(url); return }
        audioCacheSet(idx, url)
        notifyCacheReady(idx)
        doPlayEdge(idx, url)
      } catch (e) {
        console.error(e)
        isPlaying.value = false
        statusText.value = 'Edge 合成失败，请检查网络'
      }
    }
  }

  // 等待某段合成完成（事件驱动，无轮询）
  function waitForCache(idx: number): Promise<void> {
    return new Promise(resolve => {
      if (audioCache.has(idx) || speakCancelled) return resolve()
      const arr = cacheWaiters.get(idx) || []
      arr.push(resolve)
      cacheWaiters.set(idx, arr)
    })
  }

  // 实际播放
  function doPlayEdge(idx: number, url: string) {
    if (!audioEl.value || speakCancelled) return
    audioEl.value.src = url
    audioEl.value.volume = volume.value / 100
    audioEl.value.onended = onParagraphEnd
    audioEl.value.onerror = () => {
      isPlaying.value = false
      statusText.value = '播放出错'
    }
    audioEl.value.play().catch(() => {})
    statusText.value = `正在朗读：第 ${idx + 1} / ${paragraphs.value.length} 段`
  }

  // 单段朗读结束回调
  function onParagraphEnd() {
    if (isPlaying.value && currentIdx.value < paragraphs.value.length - 1) {
      currentIdx.value++
      // 朗读推进时节流保存，避免每段都同步写文件
      if (currentBook.value) debouncedSaveProgress(currentBook.value.path, currentIdx.value)
      readerRef.value?.highlight(currentIdx.value)
      if (ttsEngine.value === 'edge') {
        playEdge(currentIdx.value)
      } else {
        speakWeb(currentIdx.value)
      }
    } else {
      isPlaying.value = false
      statusText.value = '朗读完毕'
    }
  }

  // 清空音频缓存
  function clearAudioCache() {
    audioCache.forEach(url => URL.revokeObjectURL(url))
    audioCache.clear()
    pendingSet.clear()
    // 通知所有等待者，避免永久挂起（waitForCache 内部会检查 speakCancelled）
    cacheWaiters.forEach(waiters => waiters.forEach(fn => fn()))
    cacheWaiters.clear()
  }

  function togglePlay() {
    if (isPlaying.value) {
      pauseAll()
      isPlaying.value = false
      statusText.value = '已暂停'
    } else {
      speakFrom(currentIdx.value)
    }
  }

  function pauseAll() {
    synth?.cancel()
    if (audioEl.value) {
      audioEl.value.pause()
      audioEl.value.currentTime = 0
    }
  }

  function stopSpeak() {
    speakCancelled = true
    debouncedRestartSpeak.cancel()
    flushProgress()
    pauseAll()
    clearAudioCache()
    isPlaying.value = false
    statusText.value = '已停止'
  }

  function nextPara() {
    if (currentIdx.value < paragraphs.value.length - 1) {
      speakFrom(currentIdx.value + 1)
    }
  }

  function prevPara() {
    if (currentIdx.value > 0) {
      speakFrom(currentIdx.value - 1)
    }
  }

  function seekTo(idx: number) {
    currentIdx.value = idx
    if (currentBook.value) SaveProgress(currentBook.value.path, idx)
    readerRef.value?.highlight(idx)
    statusText.value = `跳到第 ${idx + 1} 段`
  }

  // 调速/换嗓音后重启朗读：防抖，避免拖动滑块时频繁打断
  const debouncedRestartSpeak = debounce((idx: number) => {
    if (isPlaying.value && currentBook.value) {
      stopSpeak()
      speakFrom(idx)
    }
  }, 300)

  function onRateChange(v: number) {
    rate.value = v
    saveTtsSettings()
    // 正在朗读时，从当前段重新开始（应用新语速，防抖避免频繁打断）
    debouncedRestartSpeak(currentIdx.value)
  }

  function onVoiceChange(v: string) {
    voiceURI.value = v
    if (ttsEngine.value === 'edge') savedEdgeVoice = v
    else savedWebVoice = v
    saveTtsSettings()
    // 正在朗读时，从当前段重新开始（应用新嗓音，防抖避免频繁打断）
    debouncedRestartSpeak(currentIdx.value)
  }

  function onEngineChange(e: 'web' | 'edge') {
    if (e === ttsEngine.value) return
    stopSpeak()
    ttsEngine.value = e
    // 切换到对应引擎保存的嗓音，没有则用默认
    if (e === 'edge' && edgeVoices.value.length > 0) {
      const saved = savedEdgeVoice && edgeVoices.value.find(v => v.shortName === savedEdgeVoice)
      if (saved) {
        voiceURI.value = saved.shortName
      } else {
        const xiaoxiao = edgeVoices.value.find(v => v.shortName.includes('Xiaoxiao'))
        voiceURI.value = xiaoxiao ? xiaoxiao.shortName : edgeVoices.value[0].shortName
      }
    } else if (e === 'web' && voices.value.length > 0) {
      const saved = savedWebVoice && voices.value.find(v => v.voiceURI === savedWebVoice)
      voiceURI.value = saved ? saved.voiceURI : voices.value[0].voiceURI
    }
    saveTtsSettings()
    statusText.value = e === 'edge' ? 'Edge 在线语音' : 'Windows 系统语音'
  }

  // 音量变化：edge 引擎实时生效（audioEl.volume）；web 引擎下一段生效
  watch(volume, (v) => {
    if (ttsEngine.value === 'edge' && audioEl.value) {
      audioEl.value.volume = v / 100
    }
  })

  return {
    // 状态
    isPlaying, rate, voiceURI, voices, statusText, ttsEngine, edgeVoices, voiceOptions,
    // 朗读控制
    speakFrom, stopSpeak, togglePlay, nextPara, prevPara, seekTo,
    // 设置变更
    onRateChange, onVoiceChange, onEngineChange,
    // 生命周期辅助
    flushProgress, clearAudioCache,
    // 初始化（供 App.vue onMounted 调用）
    loadTtsSettings, loadVoices, loadEdgeVoices,
  }
}
