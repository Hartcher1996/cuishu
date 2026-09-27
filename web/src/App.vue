<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import Reader from './components/Reader.vue'
import TtsBar from './components/TtsBar.vue'
import { prepareDoc, queryParagraphNodes, shouldSkipNode } from './shared/selector'
import { listBooks, readBook } from './services/bookStore'
import { loadProgress, loadPrefs, savePrefs } from './services/storage'
import { useTts, type Book, type Para } from './composables/useTts'
import { friendlyVoiceName } from './shared/voiceName'

// === 书库数据 ===
interface CategoryGroup { name: string; books: Book[] }
const categories = ref<CategoryGroup[]>([])
const currentBook = ref<Book | null>(null)

// === 段落 ===
const currentBookHtml = ref('')
const paragraphs = ref<Para[]>([])
const currentIdx = ref(0)

// === 阅读器偏好（单一数据源，全部走 localStorage）===
type Theme = 'light' | 'dark'
const prefs = loadPrefs()
const fontSize  = ref(prefs.fontSize)
const fontFamily = ref(prefs.fontFamily)
const volume    = ref(prefs.volume)
const theme     = ref<Theme>(prefs.theme)
const rate      = ref(prefs.rate)        // 被 useTts 直接引用
const voiceURI  = ref(prefs.voiceURI)    // 被 useTts 直接引用

// === 移动端侧边栏 ===
const sidebarOpen = ref(false)
function toggleSidebar() { sidebarOpen.value = !sidebarOpen.value }

function onFontSizeChange(v: number) { fontSize.value = v; savePrefs({ fontSize: v }) }
function onFontFamilyChange(v: string) { fontFamily.value = v; savePrefs({ fontFamily: v }) }
function onThemeChange(t: Theme) {
  theme.value = t
  document.documentElement.setAttribute('data-theme', t)
  savePrefs({ theme: t })
}
function onThemeToggle() {
  onThemeChange(theme.value === 'dark' ? 'light' : 'dark')
}
document.documentElement.setAttribute('data-theme', theme.value)

const readerRef = ref<InstanceType<typeof Reader> | null>(null)
const audioEl = ref<HTMLAudioElement | null>(null)

// === TTS 组合式函数（rate / voiceURI / volume 直接从本文件 refs 注入，无副本）===
const {
  isPlaying, statusText, voices,
  speakFrom, stopSpeak, togglePlay, nextPara, prevPara, seekTo,
  onRateChange, onVoiceChange, onVolumeChange,
  flushProgress,
  loadVoices,
  voiceOptions: getVoiceOptions,
} = useTts(paragraphs, currentIdx, currentBook, readerRef, audioEl, volume, rate, voiceURI)

// voiceOptions 作为 computed（voiceOptions() 是函数，改成 computed 包装）
const voiceOptions = computed(() => getVoiceOptions())

// === 初始化 ===
onMounted(async () => {
  try {
    categories.value = await listBooks()
  } catch (e) {
    console.error('加载书库失败', e)
  }
  loadVoices()
})

onBeforeUnmount(() => {
  stopSpeak()
})

async function refreshBooks() {
  try {
    categories.value = await listBooks()
    statusText.value = '书库已刷新'
  } catch (e) {
    console.error('刷新书库失败', e)
    statusText.value = '刷新失败'
  }
}

async function selectBook(book: Book) {
  sidebarOpen.value = false
  stopSpeak()
  currentBook.value = book
  currentIdx.value = 0
  paragraphs.value = []
  statusText.value = '加载中…'
  try {
    const html = await readBook(book.path)
    currentBookHtml.value = html
    paragraphs.value = extractParagraphs(html)
    const saved = loadProgress(book.path)
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

function startFromParagraph(idx: number) { speakFrom(idx) }
function jumpToAnchor(anchor: string) {
  const idx = paragraphs.value.findIndex(p => p.anchor === anchor)
  if (idx >= 0) {
    currentIdx.value = idx
    readerRef.value?.scrollToAnchor(anchor)
    speakFrom(idx)
  }
}

watch(currentBook, () => {
  nextTick(() => readerRef.value?.highlight(currentIdx.value))
})
</script>

<template>
  <div class="app-window">
    <TitleBar @theme-change="onThemeChange" @toggle-sidebar="toggleSidebar" />
    <div class="main-area">
      <Sidebar
        :categories="categories"
        :current-book="currentBook"
        :open="sidebarOpen"
        @select="selectBook"
        @jump="jumpToAnchor"
        @refresh="refreshBooks"
        @close="sidebarOpen = false"
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
        @theme-toggle="onThemeToggle"
        @scroll-top="() => readerRef?.$el?.querySelector('.book-content')?.scrollTo({ top: 0, behavior: 'smooth' })"
      />
    </div>
    <TtsBar
      :current-idx="currentIdx"
      :total="paragraphs.length"
      :is-playing="isPlaying"
      :rate="rate"
      :voice-uri="voiceURI"
      :voice-options="voiceOptions"
      :status-text="statusText"
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
      @font-size-change="onFontSizeChange"
      @font-family-change="onFontFamilyChange"
      @volume-change="onVolumeChange"
    />
    <audio ref="audioEl" style="display:none" />
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
