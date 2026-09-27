<script lang="ts" setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { prepareDoc, queryParagraphNodes, shouldSkipNode } from '../shared/selector'

interface Book { title: string; suffix: string; category: string; path: string }
interface Para { text: string; anchor?: string }

type Theme = 'light' | 'dark'

const props = defineProps<{
  book: Book | null
  html: string
  paragraphs: Para[]
  currentIdx: number
  fontSize: number
  fontFamily: string
  theme: Theme
}>()

const FONT_FAMILY_MAP: Record<string, string> = {
  'noto-serif-sc': "'Noto Serif SC', Georgia, serif",
  'noto-sans-sc': "'Noto Sans SC', 'PingFang SC', sans-serif",
  'harmonyos-sans': "'HarmonyOS Sans', 'PingFang SC', sans-serif",
  'lxgw-wenkai': "'LXGW WenKai', 'KaiTi', serif",
}

const emit = defineEmits<{
  'play-from': [idx: number]
  'jump': [anchor: string]
  'context-menu': [payload: { idx: number; selText: string; x: number; y: number }]
}>()

const iframeEl = ref<HTMLIFrameElement | null>(null)

// 注入到 iframe 内的样式：段落高亮 + 悬停提示 + 隐藏滚动条
// v2 选择器：.callout-title 加入；v1 兼容：.info-box-title / .core-num 保留
const injectCSS = `
.tts-active {
  background: rgba(41, 128, 185, 0.28) !important;
}
section p, section li, section h4, section .callout-title, section .info-box-title, section .core-num, main p, main li, main h4, main .callout-title, main .info-box-title, main .core-num {
  cursor: context-menu;
  transition: background 0.15s ease;
}
section p:hover, section li:hover, section h4:hover, section .callout-title:hover, section .info-box-title:hover, section .core-num:hover, main p:hover, main li:hover, main h4:hover, main .callout-title:hover, main .info-box-title:hover, main .core-num:hover {
  background: rgba(192, 57, 43, 0.05);
}
html::-webkit-scrollbar,
body::-webkit-scrollbar { display: none; }
html, body { -ms-overflow-style: none; scrollbar-width: none; }
`

// 把字号偏好注入 iframe：设置 rem 单位基准，使基于 rem/em 的样式可缩放
// 直接调用即可，重复调用会先移除旧 style 再注入新值
function injectFontSize() {
  const doc = iframeEl.value?.contentDocument
  if (!doc) return
  const id = 'reader-font-size'
  doc.getElementById(id)?.remove()
  const style = doc.createElement('style')
  style.id = id
  style.textContent = `html { font-size: ${props.fontSize}px !important; } body { font-size: 1rem !important; }`
  doc.head.appendChild(style)
}

// 字体家族注入机制：与 injectFontSize 一致
function injectFontFamily() {
  const doc = iframeEl.value?.contentDocument
  if (!doc) return
  const id = 'reader-font-family'
  doc.getElementById(id)?.remove()
  const family = FONT_FAMILY_MAP[props.fontFamily] || FONT_FAMILY_MAP['noto-serif-sc']
  const style = doc.createElement('style')
  style.id = id
  style.textContent = `
    body, .content, section p, section li, section h1, section h2, section h3, section h4,
    main p, main li, main h1, main h2, main h3, main h4, .toc {
      font-family: ${family} !important;
    }
  `
  doc.head.appendChild(style)
}

// 深色主题覆盖 CSS：覆盖蒸馏 HTML 里 :root 的 CSS 变量 + 兜底硬编码色
// 蒸馏 HTML 用 var(--bg) 等变量，覆盖 :root 即可联动大部分元素
// 兜底的 !important 用于处理蒸馏 HTML 里少量硬编码色（#fafafa / #fff 等）
const darkThemeCSS = `
:root {
  --bg: #1a1a1a;
  --text: #e8e8e8;
  --text-light: #a0a0a0;
  --text-lighter: #707070;
  --border: #2a2a2a;
  --border-dark: #3a3a3a;
  --toc-bg: #222;
  --primary: #e74c3c;
  --primary-dark: #ff6b5c;
  --primary-light: #ff8a7c;
  --primary-bg: rgba(192, 57, 43, 0.15);
  --tip-bg: #1e3a2e;
  --tip-border: #2e7d5a;
  --tip-title: #5ec89a;
  --warn-bg: #3a2e15;
  --warn-border: #d68910;
  --warn-title: #f5b942;
  --case-bg: #2a1a3a;
  --case-border: #8e44ad;
  --case-title: #b97adb;
}
body, .toc, .quote, .info-box, .km-level { background: #222 !important; color: #e8e8e8 !important; }
.card.concept { background: #2a2020 !important; border-color: #5a3030 !important; }
.km { background: linear-gradient(180deg, #222 0%, #1a1a1a 100%) !important; }
.km-item { background: rgba(192,57,43,0.15) !important; color: #ff6b5c !important; border-color: #5a3030 !important; }
.km-item:hover { background: var(--primary) !important; color: #fff !important; }
.steps li::before { background: rgba(192,57,43,0.2) !important; color: #ff6b5c !important; }
.book-footer { color: #707070 !important; }
`

// 主题切换：往 iframe 注入（或移除）主题覆盖样式
// 机制与 injectFontSize 一致：用固定 id，先移除旧的再注入新的
function applyTheme(theme: Theme) {
  const doc = iframeEl.value?.contentDocument
  if (!doc) return
  const id = 'reader-theme-inject'
  doc.getElementById(id)?.remove()
  if (theme === 'light') return  // 浅色模式不需要注入
  const style = doc.createElement('style')
  style.id = id
  style.textContent = darkThemeCSS
  doc.head.appendChild(style)
}

// 给 iframe 内段落标记 data-idx
// 选择器与跳过逻辑与 App.vue extractParagraphs 共用 src/shared/selector.ts，
// 确保朗读序号与 iframe 内 data-tts-idx 标记完全一致
function indexParagraphs() {
  const doc = iframeEl.value?.contentDocument
  if (!doc) return
  prepareDoc(doc)
  const nodes = queryParagraphNodes(doc)
  let idx = 0
  nodes.forEach(n => {
    if (shouldSkipNode(n)) return
    n.setAttribute('data-tts-idx', String(idx))
    idx++
  })
  // 注入样式（先移除旧的，避免累积）
  const STYLE_ID = 'reader-inject-css'
  doc.getElementById(STYLE_ID)?.remove()
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = injectCSS
  doc.head.appendChild(style)
  injectFontSize()
  injectFontFamily()
  applyTheme(props.theme)
  // 右键 -> 智能上下文菜单（交给父组件 App.vue 渲染，因为 iframe 内无法浮层到父窗口）
  doc.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const target = (e.target as HTMLElement).closest('[data-tts-idx]') as HTMLElement | null
    const sel = doc.getSelection()
    const selText = sel && sel.toString().trim().length > 0 ? sel.toString().trim() : ''
    const idx = target ? parseInt(target.getAttribute('data-tts-idx') || '0', 10) : -1

    // 把坐标换算到父窗口（加上 iframe 在父窗口里的偏移）
    const frame = doc.defaultView?.frameElement as HTMLIFrameElement
    const rect = frame?.getBoundingClientRect()
    const x = rect ? rect.left + e.clientX : e.clientX
    const y = rect ? rect.top + e.clientY : e.clientY

    emit('context-menu', { idx, selText, x, y })
  })
  // 拦截 TOC 锚点点击 -> 跳章
  doc.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null
    if (a) {
      e.preventDefault()
      const anchor = a.getAttribute('href')!.slice(1)
      if (anchor) emit('jump', anchor)
    }
  })
}

// 字号变化时重新注入（不必重新加载 iframe）
watch(() => props.fontSize, () => {
  injectFontSize()
})

// 主题变化时重新注入
watch(() => props.theme, (t) => {
  applyTheme(t)
})

// 字体变化时重新注入
watch(() => props.fontFamily, () => {
  injectFontFamily()
})

// iframe load 后初始化
function onIframeLoad() {
  indexParagraphs()
  nextTick(() => highlight(props.currentIdx))
}

// 高亮第 idx 段
function highlight(idx: number) {
  const doc = iframeEl.value?.contentDocument
  if (!doc) return
  doc.querySelectorAll('.tts-active').forEach(n => n.classList.remove('tts-active'))
  const el = doc.querySelector(`[data-tts-idx="${idx}"]`) as HTMLElement | null
  if (el) {
    el.classList.add('tts-active')
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// 滚动到锚点
function scrollToAnchor(anchor: string) {
  const doc = iframeEl.value?.contentDocument
  if (!doc) return
  const el = doc.getElementById(anchor) as HTMLElement | null
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 滚动到顶部（供 App.vue 右键菜单「返回顶部」调用）
function scrollToTop() {
  const doc = iframeEl.value?.contentDocument
  if (!doc) return
  doc.defaultView?.scrollTo({ top: 0, behavior: 'smooth' })
}

// 暴露给父组件
defineExpose({ highlight, scrollToAnchor, applyTheme, scrollToTop })

// html 变化时重新加载 iframe（等 v-if 把 iframe 挂到 DOM 后再设 srcdoc）
watch(() => props.html, (val) => {
  if (!val) return
  nextTick(() => {
    if (iframeEl.value) {
      iframeEl.value.srcdoc = val
    }
  })
})

onMounted(() => {
  if (iframeEl.value && props.html) {
    iframeEl.value.srcdoc = props.html
  }
})

onBeforeUnmount(() => {
  iframeEl.value = null
})
</script>

<template>
  <main class="reader-area">
    <iframe
      v-if="book && html"
      ref="iframeEl"
      class="reader-frame"
      sandbox="allow-same-origin"
      @load="onIframeLoad"
    ></iframe>
    <div v-else class="welcome">
      <div class="welcome-card">
        <div class="welcome-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <h1>萃书</h1>
        <p class="welcome-sub">把厚书读薄，把精华听进心里</p>

        <div class="guide">
          <h2>新手操作指南</h2>
          <ul>
            <li><strong>选书</strong>：从左侧书库点击一本书开始阅读</li>
            <li><strong>朗读</strong>：点底部 ▶ 开始朗读，再次点击暂停</li>
            <li><strong>从某段开始</strong>：右键段落 →「从这里开始朗读」</li>
            <li><strong>跳章</strong>：点击原书目录锚点，自动跳到该章首段起读</li>
            <li><strong>上下段</strong>：用底部 ◀ ▶ 切换朗读起点</li>
            <li><strong>语速嗓音</strong>：底栏调节语速、选择嗓音，立即生效</li>
            <li><strong>引擎</strong>：Edge 在线语音（晓晓等）/ Windows 系统语音</li>
            <li><strong>进度</strong>：自动记忆每本书读到第几段，下次续读</li>
          </ul>
        </div>

        <div class="tips">
          <p>提示：往 exe 同级 <code>books/分类/</code> 目录放入 HTML 书籍，点书库旁 ↻ 刷新即可加载。</p>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.reader-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg);
}
.reader-frame {
  flex: 1;
  border: none;
  width: 100%;
  background: var(--bg);
}

/* 欢迎页 */
.welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: var(--bg);
  overflow-y: auto;
}
.welcome-card {
  max-width: 560px;
  width: 100%;
  text-align: center;
}
.welcome-logo {
  width: 72px; height: 72px;
  margin: 0 auto 20px;
  color: var(--primary);
  display: flex; align-items: center; justify-content: center;
  background: var(--primary-bg);
  border-radius: 18px;
}
.welcome-logo svg { width: 38px; height: 38px; }
.welcome-card h1 {
  font-family: Georgia, "Noto Serif SC", "Source Han Serif SC", serif;
  font-size: 1.7rem;
  color: var(--primary-dark);
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.welcome-sub {
  color: var(--text-light);
  font-size: 0.95rem;
  margin-bottom: 28px;
}
.guide {
  background: var(--toc-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
  text-align: left;
  margin-bottom: 18px;
}
.guide h2 {
  font-family: Georgia, "Noto Serif SC", serif;
  font-size: 1.05rem;
  color: var(--primary-dark);
  font-weight: 600;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.guide h2::before {
  content: "";
  width: 3px; height: 16px;
  background: var(--primary);
  border-radius: 2px;
}
.guide ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.guide li {
  padding: 6px 0;
  font-size: 0.88rem;
  color: var(--text);
  line-height: 1.6;
  border-bottom: 1px dashed var(--border);
}
.guide li:last-child { border-bottom: none; }
.guide li strong {
  color: var(--primary-dark);
  font-weight: 600;
  margin-right: 4px;
}
.tips {
  font-size: 0.82rem;
  color: var(--text-light);
  line-height: 1.6;
}
.tips code {
  background: var(--border);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.78rem;
  color: var(--primary-dark);
}
</style>
