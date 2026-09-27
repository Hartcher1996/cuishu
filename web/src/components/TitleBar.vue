<script lang="ts" setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits<{
  'theme-change': ['light' | 'dark']
  'toggle-sidebar': []
}>()

const isDark = ref(false)
const THEME_KEY = 'theme'

function applyTheme(dark: boolean) {
  isDark.value = dark
  const t = dark ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', t)
  emit('theme-change', t)
}

function toggleTheme() {
  const next = !isDark.value
  applyTheme(next)
  try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light') } catch {}
}

onMounted(() => {
  let stored = ''
  try { stored = localStorage.getItem(THEME_KEY) || '' } catch {}
  applyTheme(stored === 'dark')
})
</script>

<template>
  <header class="title-bar">
    <button class="hamburger-btn" title="书库" @click="emit('toggle-sidebar')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12h18M3 6h18M3 18h18"/>
      </svg>
    </button>
    <div class="title-text">
      <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
      萃书
      <span class="title-sub">· Web</span>
    </div>
    <div class="right-controls">
      <button class="theme-btn" :title="isDark ? '切换到浅色' : '切换到深色'" @click="toggleTheme">
        <svg v-if="!isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.title-bar {
  height: 40px;
  background: var(--primary-bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  padding-top: var(--safe-top);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}
.hamburger-btn {
  display: none;
  width: 36px; height: 36px;
  border: none;
  background: transparent;
  color: var(--primary-dark);
  cursor: pointer;
  align-items: center; justify-content: center;
  border-radius: 6px;
  flex-shrink: 0;
  margin-right: 4px;
}
.hamburger-btn svg { width: 20px; height: 20px; }

@media (max-width: 768px) {
  .hamburger-btn { display: flex; }
  .title-bar { padding: 0 8px; padding-top: var(--safe-top); }
  .title-sub { display: none; }
}
.title-bar::after {
  content: "";
  position: absolute;
  left: 0; right: 0; bottom: -2px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--primary) 20%, var(--primary) 80%, transparent);
  opacity: 0.6;
}
.title-text {
  font-family: Georgia, "Noto Serif SC", serif;
  font-size: 0.95rem;
  color: var(--primary-dark);
  font-weight: 600;
  letter-spacing: 0.04em;
  display: flex;
  align-items: center;
  gap: 8px;
}
.title-text .logo {
  width: 18px; height: 18px;
  color: var(--primary);
}
.title-sub {
  font-size: 0.7rem;
  color: var(--text-lighter);
  font-weight: 400;
  letter-spacing: 0.08em;
}
.right-controls { display: flex; height: 100%; align-items: stretch; }
.theme-btn {
  width: 36px; height: 100%;
  border: none;
  background: transparent;
  color: var(--text-light);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 0;
  transition: background 0.15s ease, color 0.15s ease;
}
.theme-btn svg { width: 16px; height: 16px; }
.theme-btn:hover { color: var(--primary); background: rgba(192, 57, 43, 0.08); }
</style>
