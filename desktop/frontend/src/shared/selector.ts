// 可朗读段落选择器与文档预处理
// App.vue 的 extractParagraphs 与 Reader.vue 的 indexParagraphs 必须共用同一份逻辑，
// 否则朗读序号与 iframe 内 data-tts-idx 标记会错位，导致高亮跳到错误段落。

// v2 优先 section；v1 兼容 main / 全局
export const PARAGRAPH_SELECTOR = [
  'section p', 'section h2', 'section h3', 'section h4', 'section li',
  'section .callout-title', 'section .info-box-title'
].join(', ')

const FALLBACK_MAIN = [
  'main p', 'main h2', 'main h3', 'main h4', 'main li',
  'main .callout-title', 'main .info-box-title'
].join(', ')

const FALLBACK_GLOBAL = [
  'p', 'h2', 'h3', 'h4', '.callout-title', '.info-box-title'
].join(', ')

// 预处理文档：移除 toc 区域、标记 data-tts="skip" 子树
// 两端共用，确保朗读序号与 iframe 标记 idx 完全一致
export function prepareDoc(doc: Document | null): void {
  if (!doc) return
  doc.querySelectorAll('.toc, .toc-list, nav').forEach(n => n.remove())
  doc.querySelectorAll('[data-tts="skip"]').forEach(n => {
    n.setAttribute('data-tts-skip-mark', '1')
  })
}

// 按优先级查询可朗读段落节点（section → main → 全局）
export function queryParagraphNodes(doc: Document): NodeListOf<Element> {
  let nodes = doc.querySelectorAll(PARAGRAPH_SELECTOR)
  if (nodes.length === 0) nodes = doc.querySelectorAll(FALLBACK_MAIN)
  if (nodes.length === 0) nodes = doc.querySelectorAll(FALLBACK_GLOBAL)
  return nodes
}

// 判断节点是否应被跳过（aria-hidden 装饰元素 / data-tts="skip" 子树）
export function shouldSkipNode(n: Element): boolean {
  if (n.getAttribute('aria-hidden') === 'true') return true
  if ((n as HTMLElement).closest('[data-tts-skip-mark]')) return true
  return false
}
