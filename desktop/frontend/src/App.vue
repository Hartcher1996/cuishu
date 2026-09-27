<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import Reader from './components/Reader.vue'
import TtsBar from './components/TtsBar.vue'
import ContextMenu, { type MenuItem } from './components/ContextMenu.vue'
import { prepareDoc, queryParagraphNodes, shouldSkipNode } from './shared/selector'
import { ListBooks, ReadBook, LoadProgress } from '../wailsjs/go/main/App'
import { useTts, type Book, type Para } from './composables/useTts'

// === 书库数据 ===
interface CategoryGroup { name: string; books: Book[] }
const categories = ref<CategoryGroup[]>([])
const currentBook = ref<Book | null>(null)

// === 段落 ===
const currentBookHtml = ref('')
const paragraphs = ref<Para[]>([])
const currentIdx = ref(0)

// 字号（注入到 iframe 内 body，方便阅读）
const fontSize = ref(16)
const FONT_SIZE_KEY = 'font-size'
function onFontSizeChange(v: number) {
  fontSize.value = v
  try { localStorage.setItem(FONT_SIZE_KEY, String(v)) } catch {}
}

// 音量（0-100%，纯前端偏好，不进后端 tts-settings）
const volume = ref(100)
const VOLUME_KEY = 'volume'
function onVolumeChange(v: number) {
  volume.value = v
  try { localStorage.setItem(VOLUME_KEY, String(v)) } catch {}
}

// 字体（下拉选择，联动 iframe 内蒸馏 HTML）
const fontFamily = ref('noto-serif-sc')
const FONT_FAMILY_KEY = 'font-family'
function onFontFamilyChange(v: string) {
  fontFamily.value = v
  try { localStorage.setItem(FONT_FAMILY_KEY, v) } catch {}
}

// 主题：浅色 / 深色，联动 iframe 内蒸馏 HTML
type Theme = 'light' | 'dark'
const theme = ref<Theme>('light')
const THEME_KEY = 'theme'
function onThemeChange(t: Theme) {
  theme.value = t
  // 同步给外部 html（TitleBar 也会做一次，这里冗余但安全）
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem(THEME_KEY, t) } catch {}
}
// 初始化恢复主题
try {
  const stored = localStorage.getItem(THEME_KEY) as Theme | null
  if (stored === 'light' || stored === 'dark') {
    theme.value = stored
    document.documentElement.setAttribute('data-theme', stored)
  }
} catch {}

const readerRef = ref<InstanceType<typeof Reader> | null>(null)
const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null)
// edge-tts 用 audio 元素播放
const audioEl = ref<HTMLAudioElement | null>(null)

// TTS 朗读逻辑全部抽到 useTts，App.vue 只负责书库管理与模板组装
const {
  isPlaying, rate, voiceURI, statusText, ttsEngine, voiceOptions,
  speakFrom, stopSpeak, togglePlay, nextPara, prevPara, seekTo,
  onRateChange, onVoiceChange, onEngineChange,
  flushProgress, clearAudioCache,
  loadTtsSettings, loadVoices, loadEdgeVoices,
} = useTts(paragraphs, currentIdx, currentBook, readerRef, audioEl, volume)

// === 初始化 ===
onMounted(async () => {
  await loadTtsSettings()
  // 恢复字号偏好
  try {
    const v = Number(localStorage.getItem(FONT_SIZE_KEY))
    if (v >= 12 && v <= 28) fontSize.value = v
  } catch {}
  // 恢复音量偏好
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    if (v >= 0 && v <= 100) volume.value = v
  } catch {}
  // 恢复字体偏好
  try {
    const v = localStorage.getItem(FONT_FAMILY_KEY)
    if (v) fontFamily.value = v
  } catch {}
  try {
    categories.value = await ListBooks() as CategoryGroup[]
  } catch (e) {
    console.error('加载书库失败', e)
  }
  // 初始化系统语音 + 加载 edge-tts 嗓音列表
  loadVoices()
  loadEdgeVoices()
})

// 组件卸载：刷写未保存进度 + 停止朗读 + 撤销所有 blob URL，避免内存泄漏
// （stopSpeak 内部已包含 flushProgress / pauseAll / clearAudioCache 等全部清理）
onBeforeUnmount(() => {
  stopSpeak()
})

// 刷新书库
async function refreshBooks() {
  try {
    categories.value = await ListBooks() as CategoryGroup[]
    statusText.value = '书库已刷新'
  } catch (e) {
    console.error('刷新书库失败', e)
    statusText.value = '刷新失败'
  }
}

// === 选书 ===
async function selectBook(book: Book) {
  // 停止当前朗读
  stopSpeak()
  currentBook.value = book
  currentIdx.value = 0
  paragraphs.value = []
  statusText.value = '加载中…'
  try {
    const html = await ReadBook(book.path)
    currentBookHtml.value = html
    paragraphs.value = extractParagraphs(html)
    // 恢复进度
    const saved = await LoadProgress(book.path)
    if (saved > 0 && saved < paragraphs.value.length) {
      currentIdx.value = saved
      statusText.value = `已恢复到第 ${saved + 1} 段`
    } else {
      statusText.value = '就绪'
    }
  } catch (e) {
    statusText.value = '加载失败'
    console.error(e)
  }
}

// 从 HTML 中抽取可朗读段落
// 选择器与跳过逻辑与 Reader.vue 的 indexParagraphs 共用 src/shared/selector.ts，
// 确保朗读序号与 iframe 内 data-tts-idx 标记完全一致
function extractParagraphs(html: string): Para[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  prepareDoc(doc)
  const nodes = queryParagraphNodes(doc)
  const list: Para[] = []
  nodes.forEach(n => {
    if (shouldSkipNode(n)) return
    const text = n.textContent?.replace(/\s+/g, ' ').trim()
    if (text && text.length > 0) {
      list.push({ text, anchor: n.id || undefined })
    }
  })
  return list
}

// 从某段开始朗读（Reader 组件触发）
function startFromParagraph(idx: number) {
  speakFrom(idx)
}

// 跳到锚点章节（从该章首段起读）
function jumpToAnchor(anchor: string) {
  const idx = paragraphs.value.findIndex(p => p.anchor === anchor)
  if (idx >= 0) {
    currentIdx.value = idx
    readerRef.value?.scrollToAnchor(anchor)
    speakFrom(idx)
  }
}

// 切换深色/浅色模式（右键菜单「切换深色/浅色模式」调用）
function onThemeToggle() {
  onThemeChange(theme.value === 'dark' ? 'light' : 'dark')
}

// 滚动到顶部（右键菜单「返回顶部」调用）
function onScrollTop() {
  readerRef.value?.scrollToTop()
}

// 智能右键菜单（Reader 组件在 iframe 内右键时触发，菜单浮层在父窗口渲染）
function onContextMenu(payload: { idx: number; selText: string; x: number; y: number }) {
  const { idx, selText, x, y } = payload
  const onPara = idx >= 0
  const items: MenuItem[] = []

  if (selText) {
    items.push({
      label: '复制选中文字',
      icon: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M5 7h2v14a2 2 0 0 0 2 2h6 M16 5h2a2 2 0 0 1 2 2v10',
      action: () => navigator.clipboard.writeText(selText),
    })
    items.push({
      label: '搜索选中文字',
      icon: 'M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M21 21l-4.35-4.35',
      action: () => window.open(`https://www.bing.com/search?q=${encodeURIComponent(selText)}`, '_blank'),
    })
    items.push({
      label: '朗读选中文字',
      icon: 'M3 3v18l9-9 M14 3v18l9-9 M21.44 11.02l-3.2 3.2a3 3 0 1 1-4.24-4.24l3.2-3.2',
      action: () => {
        const u = new SpeechSynthesisUtterance(selText)
        u.lang = 'zh-CN'
        speechSynthesis.cancel()
        speechSynthesis.speak(u)
      },
    })
  }

  if (onPara) {
    if (selText) items.push({ label: '', icon: '', action: () => {}, divider: true })
    items.push({
      label: '从此段开始朗读',
      icon: 'M8 5v14l11-7z',
      action: () => speakFrom(idx),
    })
    items.push({
      label: '复制此段文字',
      icon: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
      action: () => {
        const text = paragraphs.value[idx]?.text || ''
        navigator.clipboard.writeText(text)
      },
    })
    items.push({
      label: '滚动到此段',
      icon: 'M12 5v14 M5 12l7-7 7 7',
      action: () => readerRef.value?.highlight(idx),
    })
  }

  if (!onPara && !selText) {
    // 右键空白区域
    items.push({
      label: '从头开始朗读',
      icon: 'M8 5v14l11-7z',
      action: () => speakFrom(0),
    })
    items.push({
      label: '返回顶部',
      icon: 'M12 19V5 M5 12l7-7 7 7',
      action: () => onScrollTop(),
    })
  }

  // 通用项
  items.push({ label: '', icon: '', action: () => {}, divider: true })
  items.push({
    label: theme.value === 'dark' ? '切换浅色模式' : '切换深色模式',
    icon: theme.value === 'dark'
      ? 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 1v3 M12 20v3 M4.22 4.22l2.12 2.12 M17.66 17.66l2.12 2.12 M1 12h3 M20 12h3'
      : 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
    action: () => onThemeToggle(),
  })

  contextMenuRef.value?.show(items, x, y)
}

watch(currentBook, () => {
  nextTick(() => {
    readerRef.value?.highlight(currentIdx.value)
  })
})
</script>

<template>
  <div class="app-window">
    <TitleBar @theme-change="onThemeChange" />
    <div class="main-area">
      <Sidebar
        :categories="categories"
        :current-book="currentBook"
        @select="selectBook"
        @jump="jumpToAnchor"
        @refresh="refreshBooks"
      />
      <Reader
        ref="readerRef"
        :book="currentBook"
        :html="currentBookHtml"
        :paragraphs="paragraphs"
        :current-idx="currentIdx"
        :font-size="fontSize"
        :font-family="fontFamily"
        :theme="theme"
        @play-from="startFromParagraph"
        @jump="jumpToAnchor"
        @context-menu="onContextMenu"
      />
    </div>
    <TtsBar
      :current-idx="currentIdx"
      :total="paragraphs.length"
      :is-playing="isPlaying"
      :rate="rate"
      :voiceURI="voiceURI"
      :voice-options="voiceOptions"
      :status-text="statusText"
      :engine="ttsEngine"
      :font-size="fontSize"
      :font-family="fontFamily"
      :volume="volume"
      @toggle="togglePlay"
      @stop="stopSpeak"
      @next="nextPara"
      @prev="prevPara"
      @seek="seekTo"
      @rate-change="onRateChange"
      @voice-change="onVoiceChange"
      @engine-change="onEngineChange"
      @font-size-change="onFontSizeChange"
      @font-family-change="onFontFamilyChange"
      @volume-change="onVolumeChange"
    />
    <audio ref="audioEl" style="display:none" />
    <ContextMenu ref="contextMenuRef" />
  </div>
</template>

<style>
.app-window {
  width: 100%;
  height: 100%;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--primary);
  box-shadow: 0 0 0 1px rgba(192, 57, 43, 0.15);
}

.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
</style>
