// 构建前扫描 public/books/ 生成 public/books-manifest.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const booksDir = path.resolve(__dirname, 'public/books')
const outPath = path.resolve(__dirname, 'public/books-manifest.json')

function parseTitle(filename) {
  const m = filename.match(/《(.+?)》\s*(.*?)\.html$/)
  if (m) return [m[1], m[2]]
  return [filename.replace(/\.html$/, ''), '']
}

function scan(dir, rel = '') {
  const groups = {}
  if (!fs.existsSync(dir)) return []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      const sub = scan(full, path.join(rel, name))
      for (const g of sub) {
        groups[g.name] = groups[g.name] || []
        groups[g.name].push(...g.books)
      }
    } else if (name.endsWith('.html')) {
      const category = rel.replace(/\\/g, '/') || '未分类'
      const [title, suffix] = parseTitle(name)
      groups[category] = groups[category] || []
      groups[category].push({
        title, suffix, category,
        path: (rel ? rel + '/' : '') + name,
      })
    }
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
    .map(([name, books]) => ({
      name,
      books: books.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    }))
}

const manifest = scan(booksDir)
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf-8')
const total = manifest.reduce((s, g) => s + g.books.length, 0)
console.log(`✅ books-manifest.json：${manifest.length} 个分类，${total} 本书`)
