<script lang="ts" setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { prepareDoc, queryParagraphNodesIn, shouldSkipNode } from '../shared/selector'
import ContextMenu, { type MenuItem } from './ContextMenu.vue'

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

const emit = defineEmits<{
  'play-from': [idx: number]
  'jump': [anchor: string]
  'theme-toggle': []
  'scroll-top': []
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null)

const FONT_FAMILY_MAP: Record<string, string> = {
  'fzsongsong': "'FZShuSong', 'Noto Serif SC', Georgia, serif",
  'noto-serif-sc': "'Noto Serif SC', Georgia, serif",
  'noto-sans-sc': "'Noto Sans SC', 'PingFang SC', sans-serif",
  'harmonyos-sans': "'HarmonyOS Sans', 'PingFang SC', sans-serif",
  'lxgw-wenkai': "'LXGW WenKai', 'KaiTi', serif",
}

// 主题覆盖 CSS：把蒸馏 HTML 里 :root 的 CSS 变量 + 兜底硬编码色全部按主题重写
const DARK_OVERRIDE_CSS = `
.book-content {
  --bg: #1a1a1a !important;
  --text: #e8e8e8 !important;
  --text-light: #a0a0a0 !important;
  --text-lighter: #707070 !important;
  --border: #2a2a2a !important;
  --border-dark: #3a3a3a !important;
  --toc-bg: #222 !important;
  --primary: #e74c3c !important;
  --primary-dark: #ff6b5c !important;
  --primary-light: #ff8a7c !important;
  --primary-bg: rgba(192, 57, 43, 0.15) !important;
  --tip-bg: #1e3a2e !important;
  --tip-border: #2e7d5a !important;
  --tip-title: #5ec89a !important;
  --warn-bg: #3a2e15 !important;
  --warn-border: #d68910 !important;
  --warn-title: #f5b942 !important;
  --case-bg: #2a1a3a !important;
  --case-border: #8e44ad !important;
  --case-title: #b97adb !important;
}
.book-content body, .book-content .toc, .book-content .quote, .book-content .info-box, .book-content .km-level { background: #222 !important; color: #e8e8e8 !important; }
.book-content .card.concept { background: #2a2020 !important; border-color: #5a3030 !important; }
.book-content .km { background: linear-gradient(180deg, #222 0%, #1a1a1a 100%) !important; }
.book-content .km-item { background: rgba(192,57,43,0.15) !important; color: #ff6b5c !important; border-color: #5a3030 !important; }
.book-content .km-item:hover { background: var(--primary) !important; color: #fff !important; }
.book-content .steps li::before { background: rgba(192,57,43,0.2) !important; color: #ff6b5c !important; }
.book-content .book-footer { color: #707070 !important; }
`

// 通用覆盖：高亮、hover、滚动条隐藏、段落 cursor、字体/字号注入
function buildBookOverrideCSS() {
  const fontSize = props.fontSize
  const family = FONT_FAMILY_MAP[props.fontFamily] || FONT_FAMILY_MAP['noto-serif-sc']
  return `
.book-content {
  font-size: ${fontSize}px !important;
  font-family: ${family} !important;
  overflow-y: auto;
  max-height: 100%;
}
/* 隐藏书籍自带的移动端 TOC 按钮和遮罩（我们用自己的）*/
.book-content .menu-btn { display: none !important; }
.book-content .overlay { display: none !important; }
.book-content body, .book-content .content,
.book-content section p, .book-content section li, .book-content section h1, .book-content section h2, .book-content section h3, .book-content section h4,
.book-content main p, .book-content main li, .book-content main h1, .book-content main h2, .book-content main h3, .book-content main h4,
.book-content .toc {
  font-family: ${family} !important;
  font-size: inherit !important;
}
.book-content .tts-active { background: rgba(41, 128, 185, 0.28) !important; }
.book-content section p, .book-content section li, .book-content section h4,
.book-content section .callout-title, .book-content section .info-box-title, .book-content section .core-num,
.book-content main p, .book-content main li, .book-content main h4,
.book-content main .callout-title, .book-content main .info-box-title, .book-content main .core-num {
  cursor: context-menu;
  transition: background 0.15s ease;
}
.book-content section p:hover, .book-content section li:hover, .book-content section h4:hover,
.book-content section .callout-title:hover, .book-content section .info-box-title:hover, .book-content section .core-num:hover,
.book-content main p:hover, .book-content main li:hover, .book-content main h4:hover,
.book-content main .callout-title:hover, .book-content main .info-box-title:hover, .book-content main .core-num:hover {
  background: rgba(192, 57, 43, 0.05);
}
.book-content ::-webkit-scrollbar { width: 6px; }
.book-content ::-webkit-scrollbar-thumb { background: var(--border-dark); border-radius: 3px; }
.book-content ::-webkit-scrollbar-track { background: transparent; }
` + (props.theme === 'dark' ? DARK_OVERRIDE_CSS : '')
}

/**
 * 把蒸馏书籍 HTML 转换为可安全 v-html 渲染的字符串
 * - 抽走 <script> 标签（安全 + 避免被浏览器静默执行）
 * - 抽走 <style> 标签内容并做选择器作用域重写
 * - 只保留 body 内的结构
 */
function sanitizeBook(html: string): string {
  // 1. 先抽走所有 <script> —— 最保险
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '')

  // 2. 抽走 <style>，改写选择器作用域
  const styleMatches: string[] = []
  clean = clean.replace(/<style>([\s\S]*?)<\/style>/gi, (_m, css) => {
    styleMatches.push(String(css))
    return ''
  })

  // 3. 抽 body 内的内容
  const bodyMatch = clean.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  let bodyInner = bodyMatch ? bodyMatch[1] : clean

  // 4. 抽走原生 TOC 区域（我们用 Sidebar 替代了）
  bodyInner = bodyInner.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')

  // 5. 把原始 style 里的选择器作用域重写到 .book-content
  const scopedStyle = styleMatches
    .map(css => scopeCss(css))
    .join('\n')

  // 6. 拼上我们的覆盖样式
  const override = buildBookOverrideCSS()

  return `<style>${scopedStyle}\n${override}</style>\n${bodyInner}`
}

// 把所有 CSS 选择器作用域重写到 .book-content 内
// 防止书籍 CSS 污染全局（如 sidebar 的 h2、a、input 等元素）
function scopeCss(css: string): string {
  // 1. 把 html / body / :root 替换成 .book-content
  let out = css.replace(/\b(html|body|:root)\b/g, '.book-content')

  // 2. 给每个选择器列表加 .book-content 前缀
  //    匹配模式：(start-of-file 或 })(whitespace)(selector-list)(whitespace){
  //    只匹配选择器（不含 ; 和 }），跳过 @-rules
  out = out.replace(/(^|[\n\r}])(\s*)([^{};]*?)(\s*\{)/g, (match, pre, ws, selectors, brace) => {
    const s = selectors.trim()
    // 空或 @-rule → 不处理
    if (!s || s.startsWith('@')) return match

    const scoped = s.split(',').map((sel: string) => {
      sel = sel.trim()
      if (!sel) return sel
      // 已经带前缀 → 不重复
      if (sel.startsWith('.book-content')) return sel
      // 去掉重复的 .book-content（如 html body → .book-content .book-content）
      return '.book-content ' + sel
    }).join(', ')

    return pre + ws + scoped + brace
  })

  return out
}

// 给段落打 data-tts-idx 标记（复用 prepareDoc / queryParagraphNodes / shouldSkipNode）
function indexParagraphs() {
  const el = containerRef.value
  if (!el) return
  const doc = document // 直接用全局 document
  // 先给容器内所有 .toc / .toc-list / nav 临时标记让 prepareDoc 移除它们
  prepareDoc(doc as any) // prepareDoc 本来就接收 Document
  // 给容器内段落打标
  const nodes = queryParagraphNodesIn(el)
  let idx = 0
  nodes.forEach(n => {
    if (shouldSkipNode(n)) return
    n.setAttribute('data-tts-idx', String(idx))
    idx++
  })
  // 右键 → 智能上下文菜单
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const mx = e.clientX, my = e.clientY
    const target = (e.target as HTMLElement).closest('[data-tts-idx]') as HTMLElement | null
    const sel = window.getSelection()
    const selText = sel && sel.toString().trim().length > 0 ? sel.toString().trim() : ''
    const idx = target ? parseInt(target.getAttribute('data-tts-idx') || '0', 10) : -1
    const onPara = idx >= 0

    const items: MenuItem[] = []

    if (selText) {
      // 选中了文字
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
        action: () => emit('play-from', idx),
      })
      items.push({
        label: '复制此段文字',
        icon: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
        action: () => {
          const text = target?.textContent?.replace(/\s+/g, ' ').trim() || ''
          navigator.clipboard.writeText(text)
        },
      })
      items.push({
        label: '滚动到此段',
        icon: 'M12 5v14 M5 12l7-7 7 7',
        action: () => target?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      })
    }

    if (!onPara && !selText) {
      // 右键空白区域
      items.push({
        label: '从头开始朗读',
        icon: 'M8 5v14l11-7z',
        action: () => emit('play-from', 0),
      })
      items.push({
        label: '返回顶部',
        icon: 'M12 19V5 M5 12l7-7 7 7',
        action: () => el.scrollTo({ top: 0, behavior: 'smooth' }),
      })
    }

    // 通用项
    items.push({ label: '', icon: '', action: () => {}, divider: true })
    items.push({
      label: props.theme === 'dark' ? '切换浅色模式' : '切换深色模式',
      icon: props.theme === 'dark'
        ? 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 1v3 M12 20v3 M4.22 4.22l2.12 2.12 M17.66 17.66l2.12 2.12 M1 12h3 M20 12h3'
        : 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
      action: () => emit('theme-toggle'),
    })

    contextMenuRef.value?.show(items, mx, my)
  })
  // 移动端长按 → 触发右键菜单
  {
    let touchTimer: ReturnType<typeof setTimeout> | null = null
    let touchStartX = 0, touchStartY = 0
    let touchMoved = false
    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      touchStartX = t.clientX
      touchStartY = t.clientY
      touchMoved = false
      touchTimer = setTimeout(() => {
        touchTimer = null
        if (touchMoved) return
        // 复用 contextmenu 逻辑
        const target = (e.target as HTMLElement).closest('[data-tts-idx]') as HTMLElement | null
        const sel = window.getSelection()
        const selText = sel && sel.toString().trim().length > 0 ? sel.toString().trim() : ''
        const idx = target ? parseInt(target.getAttribute('data-tts-idx') || '0', 10) : -1
        const onPara = idx >= 0
        const items: MenuItem[] = []
        if (selText) {
          items.push({ label: '复制选中文字', icon: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M5 7h2v14a2 2 0 0 0 2 2h6 M16 5h2a2 2 0 0 1 2 2v10', action: () => navigator.clipboard.writeText(selText) })
          items.push({ label: '搜索选中文字', icon: 'M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M21 21l-4.35-4.35', action: () => window.open(`https://www.bing.com/search?q=${encodeURIComponent(selText)}`, '_blank') })
          items.push({ label: '朗读选中文字', icon: 'M3 3v18l9-9 M14 3v18l9-9', action: () => { const u = new SpeechSynthesisUtterance(selText); u.lang = 'zh-CN'; speechSynthesis.cancel(); speechSynthesis.speak(u) } })
        }
        if (onPara) {
          if (selText) items.push({ label: '', icon: '', action: () => {}, divider: true })
          items.push({ label: '从此段开始朗读', icon: 'M8 5v14l11-7z', action: () => emit('play-from', idx) })
          items.push({ label: '复制此段文字', icon: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', action: () => { const text = target?.textContent?.replace(/\s+/g, ' ').trim() || ''; navigator.clipboard.writeText(text) } })
        }
        if (!onPara && !selText) {
          items.push({ label: '从头开始朗读', icon: 'M8 5v14l11-7z', action: () => emit('play-from', 0) })
          items.push({ label: '返回顶部', icon: 'M12 19V5 M5 12l7-7 7 7', action: () => el.scrollTo({ top: 0, behavior: 'smooth' }) })
        }
        items.push({ label: '', icon: '', action: () => {}, divider: true })
        items.push({ label: props.theme === 'dark' ? '切换浅色模式' : '切换深色模式', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z', action: () => emit('theme-toggle') })
        contextMenuRef.value?.show(items, t.clientX, t.clientY)
      }, 500)
    }, { passive: true })
    el.addEventListener('touchmove', (e) => {
      const t = e.touches[0]
      if (Math.abs(t.clientX - touchStartX) > 10 || Math.abs(t.clientY - touchStartY) > 10) {
        touchMoved = true
        if (touchTimer) { clearTimeout(touchTimer); touchTimer = null }
      }
    }, { passive: true })
    el.addEventListener('touchend', () => {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null }
    })
  }
  // TOC 锚点点击 → 跳章
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null
    if (a) {
      e.preventDefault()
      const anchor = a.getAttribute('href')!.slice(1)
      if (anchor) emit('jump', anchor)
    }
  })
}

function highlight(idx: number) {
  const el = containerRef.value
  if (!el) return
  el.querySelectorAll('.tts-active').forEach(n => n.classList.remove('tts-active'))
  const target = el.querySelector(`[data-tts-idx="${idx}"]`) as HTMLElement | null
  if (target) {
    target.classList.add('tts-active')
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function scrollToAnchor(anchor: string) {
  const el = containerRef.value
  if (!el) return
  const target = el.querySelector(`#${CSS.escape(anchor)}`) as HTMLElement | null
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

defineExpose({ highlight, scrollToAnchor })

// 当 html 变化时重新渲染
const renderedHtml = ref('')
watch(() => props.html, (val) => {
  if (!val) return
  renderedHtml.value = sanitizeBook(val)
  nextTick(() => indexParagraphs())
}, { immediate: true })

// 字号/主题/字体变化时，不重新渲染 HTML（会丢 data-tts-idx），只更新 override style
watch([() => props.fontSize, () => props.fontFamily, () => props.theme], () => {
  if (!containerRef.value) return
  // 找到 .book-content 里的 <style>，替换掉我们注入的覆盖样式部分
  const style = containerRef.value.querySelector(':scope > style') || containerRef.value.querySelector('style')
  if (style) {
    // 重新 sanitize 一次拿新的 override，找到我们注入的片段替换
    const newFull = sanitizeBook(props.html)
    const newStyleMatch = newFull.match(/<style>([\s\S]*?)<\/style>/)
    if (newStyleMatch) style.textContent = newStyleMatch[1]
  }
})

onMounted(() => {
  if (props.html) {
    renderedHtml.value = sanitizeBook(props.html)
    nextTick(() => indexParagraphs())
  }
})
</script>

<template>
  <main class="reader-area">
    <div
      v-if="book && html"
      ref="containerRef"
      class="book-content"
      v-html="renderedHtml"
    ></div>
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
            <li><strong>右键菜单</strong>：右键段落「从此段开始朗读」，右键选中文字可复制/搜索/朗读</li>
            <li><strong>跳章</strong>：点击原书目录锚点，自动跳到该章首段起读</li>
            <li><strong>上下段</strong>：用底部 ◀ ▶ 切换朗读起点</li>
            <li><strong>语速嗓音</strong>：底栏调节语速、选择嗓音，立即生效</li>
            <li><strong>进度</strong>：自动记忆每本书读到第几段，下次续读</li>
          </ul>
        </div>

        <div class="tips">
          <p>提示：往 <code>public/books/分类/</code> 放入 HTML 书籍，重新部署即可加载。</p>
        </div>
      </div>
    </div>
    <ContextMenu ref="contextMenuRef" />
  </main>
</template>

<style scoped>
.reader-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg);
  overflow: hidden;
}
.book-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bg);
}

/* 欢迎页（和之前一样） */
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

/* === 移动端排版 === */
@media (max-width: 768px) {
  .book-content {
    padding: 16px 14px !important;
    overflow-x: hidden;
    max-width: 100%;
  }
  .book-content h1 { font-size: 1.4rem !important; }
  .book-content h2 { font-size: 1.25rem !important; }
  .book-content h3 { font-size: 1.1rem !important; }
  .book-content h4 { font-size: 1rem !important; }
  .book-content pre {
    font-size: 0.8rem !important;
    overflow-x: auto;
  }
  .book-content img {
    max-width: 100% !important;
    height: auto !important;
  }
  .book-content table {
    max-width: 100%;
    display: block;
    overflow-x: auto;
  }
  .welcome { padding: 20px; }
  .welcome-card h1 { font-size: 1.4rem; }
  .guide { padding: 16px; }
}
</style>
