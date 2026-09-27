// 替代 Wails Go 绑定的书库服务
// 构建时由 build.mjs 生成 public/books-manifest.json

export interface Book {
  title: string
  suffix: string
  category: string
  path: string
}

export interface CategoryGroup {
  name: string
  books: Book[]
}

let cached: CategoryGroup[] | null = null

export async function listBooks(): Promise<CategoryGroup[]> {
  if (cached !== null) return cached
  const res = await fetch('./books-manifest.json')
  if (!res.ok) {
    throw new Error(`加载书库失败：${res.status}`)
  }
  const text = await res.text()
  try {
    cached = JSON.parse(text) as CategoryGroup[]
  } catch {
    console.error('[listBooks] manifest 解析失败，响应前100字符：', text.slice(0, 100))
    throw new Error('书库文件格式异常')
  }
  return cached
}

export async function readBook(path: string): Promise<string> {
  const safe = path.replace(/^\/+/, '')
  const res = await fetch(`./books/${encodeURI(safe)}`)
  if (!res.ok) {
    throw new Error(`无法读取书籍：${path}`)
  }
  return res.text()
}
