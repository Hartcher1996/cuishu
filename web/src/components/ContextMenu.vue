<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

export interface MenuItem {
  label: string
  icon?: string
  action: () => void
  danger?: boolean
  disabled?: boolean
  divider?: boolean
}

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const items = ref<MenuItem[]>([])

function show(menuItems: MenuItem[], mx: number, my: number) {
  items.value = menuItems
  visible.value = true
  requestAnimationFrame(() => {
    const el = document.querySelector('.ctx-menu') as HTMLElement
    if (el) {
      const w = el.offsetWidth
      const h = el.offsetHeight
      x.value = mx + w > window.innerWidth ? mx - w : mx
      y.value = my + h > window.innerHeight ? my - h : my
    } else {
      x.value = mx
      y.value = my
    }
  })
}

function hide() { visible.value = false }

function onItemClick(item: MenuItem) {
  if (item.disabled) return
  item.action()
  hide()
}

function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') hide() }

onMounted(() => {
  document.addEventListener('keydown', onEsc)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEsc)
})

defineExpose({ show, hide })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="ctx-backdrop" @click="hide" @contextmenu.prevent="hide">
      <div class="ctx-menu" :style="{ left: x + 'px', top: y + 'px' }" @click.stop @contextmenu.prevent.stop>
        <template v-for="(item, i) in items" :key="i">
          <div v-if="item.divider" class="ctx-divider"></div>
          <button
            v-else
            class="ctx-item"
            :class="{ danger: item.danger, disabled: item.disabled }"
            :disabled="item.disabled"
            @click.stop="onItemClick(item)"
          >
            <svg v-if="item.icon" class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path :d="item.icon" />
            </svg>
            <span>{{ item.label }}</span>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: transparent;
}
.ctx-menu {
  position: fixed;
  z-index: 10000;
  min-width: 180px;
  background: var(--surface, #fff);
  border: 1px solid var(--border-dark, #ddd);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.16);
  padding: 6px;
  user-select: none;
  animation: ctxIn 0.12s ease;
}
@keyframes ctxIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.ctx-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--text, #333);
  font-size: 0.84rem;
  font-family: inherit;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.12s ease;
  text-align: left;
}
.ctx-item:hover {
  background: var(--primary-bg, rgba(192,57,43,0.08));
  color: var(--primary, #c0392b);
}
.ctx-item.danger:hover {
  background: rgba(231,76,60,0.12);
  color: #e74c3c;
}
.ctx-item.disabled {
  opacity: 0.4;
  cursor: default;
}
.ctx-item.disabled:hover { background: transparent; color: var(--text, #333); }
.ctx-icon {
  width: 15px; height: 15px;
  flex-shrink: 0;
  opacity: 0.7;
}
.ctx-item:hover .ctx-icon { opacity: 1; }
.ctx-divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--border-dark, #ddd);
}
</style>
