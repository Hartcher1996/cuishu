<script lang="ts" setup>
import { ref, computed, watch } from 'vue'

interface Book { title: string; suffix: string; category: string; path: string }
interface CategoryGroup { name: string; books: Book[] }

const props = defineProps<{
  categories: CategoryGroup[]
  currentBook: Book | null
}>()

const emit = defineEmits<{
  select: [book: Book]
  jump: [anchor: string]
  refresh: []
}>()

// 手风琴单开
const openCat = ref('')

// 书籍搜索关键词
const searchText = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

// 按关键词过滤分类：匹配的分类下只保留 title/suffix 含关键词的书
const filteredCategories = computed<CategoryGroup[]>(() => {
  const kw = searchText.value.trim().toLowerCase()
  if (!kw) return props.categories
  const result: CategoryGroup[] = []
  for (const cat of props.categories) {
    const books = cat.books.filter(b =>
      b.title.toLowerCase().includes(kw) ||
      (b.suffix && b.suffix.toLowerCase().includes(kw))
    )
    if (books.length > 0) result.push({ name: cat.name, books })
  }
  return result
})

// 初始化默认展开第一个有书的分类
watch(() => props.categories, (list) => {
  if (list.length > 0 && !openCat.value) {
    const firstWithBooks = list.find(c => c.books.length > 0)
    if (firstWithBooks) openCat.value = firstWithBooks.name
  }
}, { immediate: true })

// 搜索时若当前展开分类不在命中列表，则自动展开第一个命中分类
// 保持手风琴单开逻辑：用户仍可手动点击切换
watch(searchText, (kw) => {
  if (!kw.trim()) return
  const matched = filteredCategories.value
  if (matched.length === 0) return
  if (!matched.find(c => c.name === openCat.value)) {
    openCat.value = matched[0].name
  }
})

function toggle(cat: string) {
  openCat.value = openCat.value === cat ? '' : cat
}

// 清空搜索（点击搜索框右侧 × 时使用）
function clearSearch() {
  searchText.value = ''
  searchInput.value?.focus()
}

// 分类图标
const icons: Record<string, string> = {
  心理学: 'bulb',
  经济学: 'chart',
}
function iconKey(name: string) {
  return icons[name] || 'layers'
}

function onSelect(book: Book) {
  emit('select', book)
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>书库</h2>
      <div class="search-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref="searchInput"
          v-model="searchText"
          type="text"
          class="search-input"
          placeholder="搜索书名…"
          spellcheck="false"
        />
        <button v-if="searchText" class="search-clear" title="清空" @click="clearSearch">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <button class="refresh-btn" title="刷新书库" @click="emit('refresh')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
          <path d="M3 21v-5h5"/>
        </svg>
      </button>
    </div>
    <ul class="categories">
      <li v-if="filteredCategories.length === 0" class="empty-hint">
        未找到匹配书籍
      </li>
      <li
        v-for="cat in filteredCategories"
        :key="cat.name"
        class="category-item"
        :class="{ open: openCat === cat.name }"
      >
        <div class="category-title" @click="toggle(cat.name)">
          <!-- 心理学：灯泡 -->
          <svg v-if="iconKey(cat.name) === 'bulb'" class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
            <path d="M9 18h6"/><path d="M10 22h4"/>
          </svg>
          <!-- 经济学：柱状图 -->
          <svg v-else-if="iconKey(cat.name) === 'chart'" class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
          </svg>
          <!-- 未分类：层叠 -->
          <svg v-else class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
            <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>
            <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
          </svg>
          {{ cat.name }}
          <span class="cat-count">{{ cat.books.length }}</span>
        </div>
        <ul class="book-list">
          <div class="book-list-inner">
            <li v-for="book in cat.books" :key="book.path" class="book-item">
              <a
                :class="{ active: currentBook?.path === book.path }"
                @click="onSelect(book)"
              >
                <span class="book-title">{{ book.title }}</span>
                <span v-if="book.suffix" class="book-suffix">{{ book.suffix }}</span>
              </a>
            </li>
          </div>
        </ul>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  background: var(--toc-bg);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
/* 主色渐变分隔线：呼应 TitleBar 底部光带风格 */
.sidebar::after {
  content: "";
  position: absolute;
  top: 0; right: 0;
  width: 1px; height: 100%;
  background: linear-gradient(180deg,
    transparent 0%,
    var(--primary) 15%,
    var(--primary) 85%,
    transparent 100%);
  opacity: 0.5;
  pointer-events: none;
}
/* 光晕层：blur 后形成 3px 宽的柔光，深色模式下视觉更明显 */
.sidebar::before {
  content: "";
  position: absolute;
  top: 0; right: -1px;
  width: 3px; height: 100%;
  background: linear-gradient(180deg,
    transparent 0%,
    var(--primary) 20%,
    var(--primary) 80%,
    transparent 100%);
  filter: blur(2px);
  opacity: 0.35;
  pointer-events: none;
}
.sidebar-header {
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.sidebar-header h2 {
  font-family: Georgia, "Noto Serif SC", "Source Han Serif SC", serif;
  font-size: 1.15rem;
  color: var(--primary-dark);
  font-weight: 600;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.refresh-btn {
  width: 28px; height: 28px;
  border: none;
  background: transparent;
  color: var(--text-light);
  cursor: pointer;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s ease;
  flex-shrink: 0;
}
.refresh-btn svg { width: 16px; height: 16px; }
.refresh-btn:hover {
  color: var(--primary);
  background: var(--primary-bg);
}
.refresh-btn:active { transform: rotate(180deg); }
.sidebar-header h2::before {
  content: "";
  width: 4px; height: 18px;
  background: var(--primary);
  border-radius: 2px;
  flex-shrink: 0;
}

.search-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 8px;
  width: 13px; height: 13px;
  color: var(--text-lighter);
  pointer-events: none;
}
.search-input {
  width: 100%;
  height: 28px;
  padding: 0 28px 0 26px;
  border: 1px solid var(--border-dark);
  border-radius: 14px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.78rem;
  font-family: inherit;
  outline: none;
  transition: all 0.18s ease;
}
.search-input::placeholder { color: var(--text-lighter); }
.search-input:focus {
  border-color: var(--primary);
  background: var(--primary-bg);
}
.search-input:focus + .search-clear,
.search-input:not(:placeholder-shown) ~ .search-clear { color: var(--text-light); }
.search-clear {
  position: absolute;
  right: 4px;
  width: 20px; height: 20px;
  border: none;
  background: transparent;
  color: var(--text-lighter);
  cursor: pointer;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
  transition: all 0.15s ease;
}
.search-clear svg { width: 11px; height: 11px; }
.search-clear:hover { color: var(--primary); background: var(--primary-bg); }

.empty-hint {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-lighter);
  font-size: 0.82rem;
  font-style: italic;
  list-style: none;
}

.categories {
  list-style: none;
  padding: 12px 10px;
  overflow-y: auto;
  flex: 1;
}

.category-item { margin: 6px 0 2px; }

.category-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px 9px 14px;
  color: var(--text);
  font-family: Georgia, "Noto Serif SC", "Source Han Serif SC", serif;
  font-size: 0.98rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  border-radius: 6px;
  border-left: 3px solid transparent;
  transition: all 0.2s ease;
  cursor: pointer;
  user-select: none;
}
.category-title:hover { color: var(--primary); background: var(--primary-bg); }
.category-item.open .category-title {
  color: var(--primary);
  border-left-color: var(--primary);
  background: var(--primary-bg);
}
.category-title .cat-icon {
  width: 14px; height: 14px;
  color: var(--text-light);
  flex-shrink: 0;
}
.category-item.open .category-title .cat-icon { color: var(--primary); }
.category-title .cat-count {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--text-lighter);
  font-weight: 500;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.category-item.open .category-title .cat-count { color: var(--primary); opacity: 0.7; }

.book-list {
  list-style: none;
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.28s ease;
}
.book-list > .book-list-inner {
  overflow: hidden;
  min-height: 0;
}
.category-item.open .book-list { grid-template-rows: 1fr; }
.category-item.open .book-list > .book-list-inner { padding: 2px 0 4px; }

.book-item a {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 28px;
  color: var(--text-light);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  font-size: 0.82rem;
  font-weight: 400;
  border-radius: 6px;
  transition: all 0.18s ease;
  cursor: pointer;
  text-decoration: none;
  position: relative;
}
.book-item a::before {
  content: "";
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--text-lighter);
  flex-shrink: 0;
  position: absolute;
  left: 16px;
  transition: all 0.18s ease;
}
.book-item a:hover {
  color: var(--primary);
  background: var(--primary-bg);
  text-decoration: none;
}
.book-item a:hover::before { background: var(--primary-light); }
.book-item a.active {
  color: var(--primary);
  background: var(--primary-bg);
  font-weight: 500;
}
.book-item a.active::before {
  background: var(--primary);
  width: 6px; height: 6px;
  left: 15px;
}
.book-title { flex: 1; line-height: 1.4; }
.book-suffix {
  font-size: 0.64rem;
  color: var(--text-lighter);
  background: var(--border);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 6px;
  align-self: center;
  flex-shrink: 0;
}
.book-item a.active .book-suffix { background: rgba(192,57,43,0.12); color: var(--primary); }
</style>
