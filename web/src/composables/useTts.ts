import { ref, type Ref } from 'vue'
import Reader from '../components/Reader.vue'
import { saveProgress, savePrefs } from '../services/storage'
import { friendlyVoiceName } from '../shared/voiceName'

export interface Para { text: string; anchor?: string }
export interface Book { title: string; suffix: string; category: string; path: string }

const MAX_CHUNK = 150   // 每个 utterance 最大字符数（15 秒肯定读完；大了会被 Chrome 静默吞）
const MAX_RETRIES = 3   // 同一段/chunk 最多重试次数
const GUARD_TIMEOUT = 20000   // 20 秒无 boundary 心跳且无 onend 才判定为吞

/** 按 MAX_CHUNK 拆分成自然句块，尽量不跨句号 */
function splitText(text: string, max: number = MAX_CHUNK): string[] {
  if (text.length <= max) return [text]
  const chunks: string[] = []
  // 先按句号/问号/叹号切，再把长句拆
  const sentences = text.match(/[^。！？!?\n]+[。！？!?]?/g) || [text]
  let buf = ''
  for (const s of sentences) {
    if ((buf + s).length <= max) {
      buf += s
    } else {
      if (buf) chunks.push(buf)
      // 单句超长 → 硬切
      if (s.length > max) {
        for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max))
        buf = ''
      } else {
        buf = s
      }
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}

/**
 * TTS 朗读组合式函数（Web 版：浏览器原生 SpeechSynthesis）
 *
 * 设计要点：
 * - generation 代次：cancel 时 bump，旧 utterance 回调全部丢弃
 * - guardGen 独立跟踪 progress guard（不和 utterance gen 混，防死循环）
 * - MAX_RETRIES 上限：同一段被 guard 重试超限则跳过继续下一段
 * - 文本截断：utterance > MAX_CHUNK 时拆成多句块逐个 speak
 * - 自维护 _speaking 布尔标记（synth.speaking 在 cancel 后短暂保持 true，不可靠）
 */
export function useTts(
  paragraphs: Ref<Para[]>,
  currentIdx: Ref<number>,
  currentBook: Ref<Book | null>,
  readerRef: Ref<InstanceType<typeof Reader> | null>,
  audioEl: Ref<HTMLAudioElement | null>,
  volume: Ref<number>,
  rate: Ref<number>,
  voiceURI: Ref<string>,
) {
  const isPlaying = ref(false)
  const voices = ref<SpeechSynthesisVoice[]>([])
  const statusText = ref('就绪')

  let synth: SpeechSynthesis | null = null
  let _generation = 0
  let _guardGen = 0
  let _targetIdx = -1
  let _retries = new Map<number, number>()   // idx → 已重试次数
  let _progressTimer: ReturnType<typeof setTimeout> | null = null
  let _speaking = false                       // 自维护 speaking 状态
  let _pendingChunks: string[] = []           // 当前段的剩余句块
  let _pendingIdx = -1                        // 这些句块属于哪一段
  let _lastBoundary = 0                       // 最后一次 boundary 心跳时间戳（ms）

  function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T & { cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | null = null
    const wrapped = ((...args: any[]) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => fn(...args), ms)
    }) as T & { cancel: () => void }
    wrapped.cancel = () => { if (timer) { clearTimeout(timer); timer = null } }
    return wrapped
  }

  const debouncedSaveProgress = debounce((bookPath: string, idx: number) => {
    saveProgress(bookPath, idx)
  }, 500)
  function flushProgress() {
    debouncedSaveProgress.cancel()
    if (currentBook.value) saveProgress(currentBook.value.path, currentIdx.value)
  }

  function startProgressGuard() {
    if (_progressTimer) clearTimeout(_progressTimer)
    _guardGen++
    const myGuard = _guardGen
    _progressTimer = setTimeout(() => {
      if (myGuard !== _guardGen || !_speaking) return
      // 有 boundary 心跳 → 说明 utterance 正常朗读中，刷新 guard 继续观察
      if (Date.now() - _lastBoundary < 10000) {
        startProgressGuard()
        return
      }
      // 真吞了：连续 10 秒无心跳
      const idx = _targetIdx
      const cnt = (_retries.get(idx) || 0) + 1
      _retries.set(idx, cnt)
      if (cnt > MAX_RETRIES) {
        console.warn(`[useTts] idx ${idx} 重试 ${MAX_RETRIES} 次仍无回调，跳过 → idx ${idx + 1}`)
        _speaking = false
        if (idx + 1 < paragraphs.value.length) {
          currentIdx.value = idx + 1
          _targetIdx = idx + 1
          readerRef.value?.highlight(idx + 1)
          queueMicrotask(() => trySpeak(idx + 1))
        } else {
          isPlaying.value = false
          statusText.value = '朗读完毕（已跳过异常段落）'
        }
        return
      }
      console.warn(`[useTts] progress guard — 无 boundary 心跳，重试 idx ${idx}（第 ${cnt} 次）`)
      _generation++
      synth?.cancel()
      _pendingChunks = []
      queueMicrotask(() => trySpeak(idx))
    }, GUARD_TIMEOUT)
  }
  function clearProgressGuard() {
    if (_progressTimer) { clearTimeout(_progressTimer); _progressTimer = null }
  }

  function loadVoices() {
    if (!('speechSynthesis' in window)) return
    if (!synth) {
      synth = window.speechSynthesis
      synth.onvoiceschanged = loadVoices
    }
    const all = synth.getVoices()
    const zh = all.filter(v => v.lang.startsWith('zh'))
    voices.value = zh.length > 0 ? zh : all
    if (voices.value.length > 0) {
      const saved = voiceURI.value && voices.value.find(v => v.voiceURI === voiceURI.value)
      voiceURI.value = saved ? saved.voiceURI : voices.value[0].voiceURI
    }
  }

  function pickVoice(preferURI: string): SpeechSynthesisVoice | null {
    if (voices.value.length === 0) return null
    if (preferURI) {
      const exact = voices.value.find(v => v.voiceURI === preferURI)
      if (exact) return exact
    }
    const zh = voices.value.find(v => v.lang.startsWith('zh'))
    return zh || voices.value[0] || null
  }

  // === 朗读核心 ===

  function speakFrom(idx: number) {
    if (idx < 0 || idx >= paragraphs.value.length) { stopSpeak(); return }
    _generation++
    isPlaying.value = true
    _speaking = false
    _targetIdx = idx
    _retries.delete(idx)
    currentIdx.value = idx
    readerRef.value?.highlight(idx)
    clearProgressGuard()
    _pendingChunks = []
    synth?.cancel()
    queueMicrotask(() => trySpeak(idx))
  }

  /** speak 一个段落（自动拆分长句为多 chunk） */
  function trySpeak(idx: number) {
    if (!synth || !isPlaying.value) return
    if (idx >= paragraphs.value.length) {
      isPlaying.value = false
      clearProgressGuard()
      _speaking = false
      statusText.value = '朗读完毕'
      return
    }

    clearProgressGuard()
    _targetIdx = idx
    currentIdx.value = idx
    readerRef.value?.highlight(idx)

    // 拆句：如果不是上一段残留的句块，就重新拆
    if (_pendingIdx !== idx || _pendingChunks.length === 0) {
      _pendingChunks = splitText(paragraphs.value[idx].text)
      _pendingIdx = idx
    }
    speakNextChunk(idx)
  }

  /** speak 当前段的下一个 chunk */
  function speakNextChunk(idx: number) {
    if (!synth || !isPlaying.value) return
    if (_pendingIdx !== idx) return

    if (_pendingChunks.length === 0) {
      // 当前段全部 chunk 读完 → 续读下一段
      if (currentBook.value) debouncedSaveProgress(currentBook.value.path, idx)
      if (idx + 1 < paragraphs.value.length) {
        currentIdx.value = idx + 1
        readerRef.value?.highlight(idx + 1)
        trySpeak(idx + 1)
      } else {
        isPlaying.value = false
        _speaking = false
        clearProgressGuard()
        statusText.value = '朗读完毕'
      }
      return
    }

    const gen = _generation
    const text = _pendingChunks.shift()!
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    u.rate = rate.value
    u.volume = volume.value / 100
    const v = pickVoice(voiceURI.value)
    if (v) u.voice = v

    _speaking = true
    _lastBoundary = Date.now()   // 重置心跳（utterance 刚 speak，还没 boundary 也正常）

    // boundary 心跳：Chrome 中文约每 1-2 秒触发一次 word/sentence boundary
    // 只要有 boundary 就说明 utterance 活着，刷新 guard 不重试
    u.onboundary = () => { _lastBoundary = Date.now() }

    const onDone = () => {
      clearProgressGuard()
      _speaking = false
      if (gen !== _generation) return
      if (!isPlaying.value) return
      // 同一段的下一个 chunk
      speakNextChunk(idx)
    }

    u.onend = () => {
      onDone()
    }
    u.onerror = (ev) => {
      clearProgressGuard()
      _speaking = false
      if (gen !== _generation) return
      const err = (ev as any).error || ''
      const skip = ['interrupted', 'canceled', 'synthesis-unavailable', 'audio-busy', 'not-allowed']
      if (skip.includes(err)) {
        if (!isPlaying.value) return
        speakNextChunk(idx)
      } else {
        console.error('[useTts] utterance fatal error:', err)
        isPlaying.value = false
        _speaking = false
        statusText.value = '朗读出错'
      }
    }

    statusText.value = `正在朗读：第 ${idx + 1} / ${paragraphs.value.length} 段`
    try {
      synth.speak(u)
      startProgressGuard()
    } catch (e) {
      console.error('[useTts] speak() threw', e)
      isPlaying.value = false
      _speaking = false
      clearProgressGuard()
      statusText.value = '朗读失败'
    }
  }

  function togglePlay() {
    if (isPlaying.value) {
      synth?.pause()
      isPlaying.value = false
      _speaking = false
      clearProgressGuard()
      statusText.value = '已暂停'
    } else {
      if (synth && synth.paused) {
        synth.resume()
        isPlaying.value = true
        _speaking = true
        startProgressGuard()
        statusText.value = '继续朗读'
      } else {
        speakFrom(currentIdx.value)
      }
    }
  }

  function stopSpeak() {
    debouncedRestartSpeak.cancel()
    flushProgress()
    clearProgressGuard()
    _generation++
    _speaking = false
    _pendingChunks = []
    _pendingIdx = -1
    _retries.clear()
    _targetIdx = -1
    synth?.cancel()
    if (audioEl.value) { audioEl.value.pause(); audioEl.value.currentTime = 0 }
    isPlaying.value = false
    statusText.value = '已停止'
  }

  function nextPara() {
    if (currentIdx.value < paragraphs.value.length - 1) speakFrom(currentIdx.value + 1)
  }
  function prevPara() {
    if (currentIdx.value > 0) speakFrom(currentIdx.value - 1)
  }

  function seekTo(idx: number) {
    if (idx < 0 || idx >= paragraphs.value.length) return
    clearProgressGuard()
    readerRef.value?.highlight(idx)
    if (currentBook.value) saveProgress(currentBook.value.path, idx)
    if (isPlaying.value) {
      speakFrom(idx)
    } else {
      currentIdx.value = idx
      _targetIdx = idx
      statusText.value = `跳到第 ${idx + 1} 段`
    }
  }

  const debouncedRestartSpeak = debounce((idx: number) => {
    if (isPlaying.value && currentBook.value) speakFrom(idx)
  }, 200)

  function onRateChange(v: number) {
    rate.value = v
    savePrefs({ rate: v })
    debouncedRestartSpeak(currentIdx.value)
  }
  function onVoiceChange(v: string) {
    voiceURI.value = v
    savePrefs({ voiceURI: v })
    debouncedRestartSpeak(currentIdx.value)
  }
  function onVolumeChange(v: number) {
    volume.value = v
    savePrefs({ volume: v })
    debouncedRestartSpeak(currentIdx.value)
  }

  function voiceOptions() {
    return voices.value.map(v => ({ uri: v.voiceURI, label: friendlyVoiceName(v) }))
  }

  return {
    isPlaying, voices, statusText,
    voiceOptions,
    speakFrom, stopSpeak, togglePlay, nextPara, prevPara, seekTo,
    onRateChange, onVoiceChange, onVolumeChange,
    flushProgress,
    loadVoices,
  }
}
