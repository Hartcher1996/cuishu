// 可朗读段落选择器与文档预处理
// App.vue 的 extractParagraphs 与 Reader.vue 的 indexParagraphs 必须共用同一份逻辑，
// 否则朗读序号与 iframe 内 data-tts-idx 标记会错位，导致高亮跳到错误段落。

// 排除的选择器子项（带 class 的特殊块）—— 这些通常是其他元素的子节点，
// 比如 <p><span class="core-num">10</span>...</p>，我们不想让 .core-num 单独成段
const BLOCK_SELECTORS = [
  // 块级元素（天然是独立段落）
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre',
  // 独立信息块
  '.callout-title', '.info-box-title', '.core-title', '.core-nums',
]

// 内联装饰类（不能独立成段！必须依附父元素一起读）
const INLINE_DECORATORS = ['.core-num', '.num', '.label', '.tag']

function buildSelector(scope: 'section' | 'main' | ''): string {
  const s = scope ? `${scope} ` : ''
  const all = [
    ...BLOCK_SELECTORS.map(x => `${s}${x}`),
    ...INLINE_DECORATORS.map(x => `${s}${x}`),
  ]
  return all.join(', ')
}

export const PARAGRAPH_SELECTOR = buildSelector('section')
const FALLBACK_MAIN = buildSelector('main')
const FALLBACK_GLOBAL = buildSelector('' as any)

// 预处理文档：移除 toc 区域、移除所有 <script>、标记 data-tts="skip" 子树
// 两端共用，确保朗读序号与 iframe 标记 idx 完全一致
export function prepareDoc(doc: Document | null): void {
  if (!doc) return
  doc.querySelectorAll('script, .toc, .toc-list, nav').forEach(n => n.remove())
  doc.querySelectorAll('[data-tts="skip"]').forEach(n => {
    n.setAttribute('data-tts-skip-mark', '1')
  })
}

/**
 * 父子去重：如果候选节点的祖先已在结果集中，跳过候选（保留外层）。
 * 比如 <p>里的 <span class="core-num">10</span>，外层 <p> 已经收录，
 * 内层 span 被包含 → 跳过 span。
 *
 * 但有个例外：如果祖先元素本身是 INLINE_DECORATORS 类（不太可能），
 * 或者候选是块级元素而祖先是 inline → 保留候选。
 */
function dedupAncestors(candidates: Element[]): Element[] {
  const result: Element[] = []
  for (const n of candidates) {
    let skip = false
    for (const existing of result) {
      if (existing === n) continue
      if (existing.contains(n)) {
        // 祖先已收录 → 当前是它的后代 → 跳过当前
        skip = true
        break
      }
    }
    if (!skip) result.push(n)
  }
  return result
}

// 按优先级查询可朗读段落节点（section → main → 全局）
export function queryParagraphNodes(doc: Document): Element[] {
  let raw: NodeListOf<Element>
  raw = doc.querySelectorAll(PARAGRAPH_SELECTOR)
  if (raw.length === 0) raw = doc.querySelectorAll(FALLBACK_MAIN)
  if (raw.length === 0) raw = doc.querySelectorAll(FALLBACK_GLOBAL)
  return dedupAncestors(Array.from(raw))
}

/** 和 queryParagraphNodes 一样的去重逻辑，限定在 root 内（Reader.vue 用）*/
export function queryParagraphNodesIn(root: HTMLElement): Element[] {
  const raw = root.querySelectorAll([PARAGRAPH_SELECTOR, FALLBACK_MAIN, FALLBACK_GLOBAL].join(', '))
  return dedupAncestors(Array.from(raw))
}

// 判断节点是否应被跳过（aria-hidden 装饰元素 / data-tts="skip" 子树）
export function shouldSkipNode(n: Element): boolean {
  if (n.getAttribute('aria-hidden') === 'true') return true
  if ((n as HTMLElement).closest('[data-tts-skip-mark]')) return true
  return false
}
