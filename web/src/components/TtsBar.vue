<script lang="ts" setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

interface VoiceOption { uri: string; label: string }

const props = defineProps<{
  currentIdx: number
  total: number
  isPlaying: boolean
  rate: number
  voiceUri: string
  voiceOptions: VoiceOption[]
  statusText: string
  fontSize: number
  fontFamily: string
  volume: number
}>()

const emit = defineEmits<{
  toggle: []
  stop: []
  next: []
  prev: []
  seek: [idx: number]
  'rate-change': [v: number]
  'voice-change': [v: string]
  'font-size-change': [v: number]
  'font-family-change': [v: string]
  'volume-change': [v: number]
}>()

const FONT_OPTIONS = [
  { value: 'noto-serif-sc', label: '思源宋体', family: "'Noto Serif SC', Georgia, serif" },
  { value: 'noto-sans-sc', label: '思源黑体', family: "'Noto Sans SC', 'PingFang SC', sans-serif" },
  { value: 'harmonyos-sans', label: '鸿蒙字体', family: "'HarmonyOS Sans', 'PingFang SC', sans-serif" },
  { value: 'lxgw-wenkai', label: '霞鹜文楷', family: "'LXGW WenKai', 'KaiTi', serif" },
]
const fontFamilyMap: Record<string, string> = Object.fromEntries(FONT_OPTIONS.map(f => [f.value, f.family]))

function onFontFamilyChange(e: Event) {
  emit('font-family-change', (e.target as HTMLSelectElement).value)
}

const rateLabel = computed(() => props.rate.toFixed(1) + 'x')
const progressPct = computed(() => {
  if (props.total <= 0) return 0
  return Math.min(100, Math.max(0, (props.currentIdx + 1) / props.total * 100))
})

const showVolume = ref(false)
const showAdvanced = ref(false)
const volumePct = computed(() => props.volume)

const volumeIcon = computed(() => {
  if (props.volume <= 0) return 'mute'
  if (props.volume <= 33) return 'low'
  if (props.volume <= 66) return 'mid'
  return 'high'
})

function onRateInput(e: Event) {
  emit('rate-change', parseFloat((e.target as HTMLInputElement).value))
}
function onFontSizeInput(e: Event) {
  emit('font-size-change', parseInt((e.target as HTMLInputElement).value, 10))
}
function onVolumeInput(e: Event) {
  emit('volume-change', parseInt((e.target as HTMLInputElement).value, 10))
}
function onVoiceChange(e: Event) {
  emit('voice-change', (e.target as HTMLSelectElement).value)
}
function toggleVolume() {
  showVolume.value = !showVolume.value
}
function onVolumeBtnClick() {
  if (props.volume <= 0) {
    emit('volume-change', 100)
  } else {
    toggleVolume()
  }
}
function onVolumeSliderMouseUp() {
  showVolume.value = false
}

const volumeWrapRef = ref<HTMLElement | null>(null)
function onDocMouseDown(e: MouseEvent) {
  if (!showVolume.value) return
  const wrap = volumeWrapRef.value
  if (wrap && !wrap.contains(e.target as Node)) {
    showVolume.value = false
  }
}
onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
})
function onProgressClick(e: MouseEvent) {
  if (props.total <= 0) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  const idx = Math.floor(ratio * props.total)
  if (idx >= 0 && idx < props.total) emit('seek', idx)
}
</script>

<template>
  <div class="tts-bar">
    <div
      v-if="total > 0"
      class="overall-progress"
      :title="`总进度 ${progressPct.toFixed(0)}%（点击跳段）`"
      @click="onProgressClick"
    >
      <div class="overall-progress-fill" :style="{ width: progressPct + '%' }"></div>
    </div>
    <button class="tts-btn" title="上一段" @click="emit('prev')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
    </button>
    <button class="tts-btn primary" :title="isPlaying ? '暂停' : '播放'" @click="emit('toggle')">
      <svg v-if="isPlaying" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
      <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </button>
    <button class="tts-btn" title="停止" @click="emit('stop')">
      <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
    </button>
    <button class="tts-btn" title="下一段" @click="emit('next')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 6v12l8.5-6z"/></svg>
    </button>

    <!-- 移动端展开/收起高级控件 -->
    <button class="tts-btn adv-toggle" :class="{ active: showAdvanced }" :title="showAdvanced ? '收起设置' : '展开设置'" @click="showAdvanced = !showAdvanced">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>

    <!-- 高级控件容器：桌面 display:contents，移动端按需展开 -->
    <div class="adv-wrap" :class="{ 'adv-open': showAdvanced }">
      <div class="tts-divider"></div>

      <div class="volume-wrap" ref="volumeWrapRef">
        <button
          class="tts-btn"
          :title="`音量 ${volumePct}%`"
          @click="onVolumeBtnClick"
        >
          <svg v-if="volumeIcon === 'mute'" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
          <svg v-else-if="volumeIcon === 'low'" viewBox="0 0 24 24" fill="currentColor"><path d="M7 9v6h4l5 5V4l-5 5H7z"/><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
          <svg v-else-if="volumeIcon === 'mid'" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
        </button>
        <div v-if="showVolume" class="volume-popup" @mousedown.stop>
          <div class="volume-val">{{ volumePct }}%</div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="volume"
            @input="onVolumeInput"
            @mouseup="onVolumeSliderMouseUp"
          />
        </div>
      </div>

      <div class="tts-divider"></div>

      <div class="tts-control">
        <label>语速</label>
        <input type="range" min="0.5" max="2" step="0.1" :value="rate" @input="onRateInput" />
        <span class="val">{{ rateLabel }}</span>
      </div>

      <div class="tts-divider"></div>

      <div class="tts-control">
        <label>字号</label>
        <input type="range" min="14" max="22" step="1" :value="fontSize" @input="onFontSizeInput" />
        <span class="val">{{ fontSize }}px</span>
      </div>

      <div class="tts-divider"></div>

      <div class="tts-control">
        <label>字体</label>
        <select :value="fontFamily" @change="onFontFamilyChange">
          <option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
        </select>
      </div>

      <div class="tts-divider"></div>

      <div class="tts-control">
        <label>嗓音</label>
        <select :value="voiceUri" @change="onVoiceChange">
          <option v-for="opt in voiceOptions" :key="opt.uri" :value="opt.uri">{{ opt.label }}</option>
        </select>
      </div>
    </div>

    <div class="tts-spacer"></div>

    <div class="tts-status" :class="{ reading: isPlaying }">
      <span class="dot"></span>
      <span>{{ statusText }}</span>
    </div>
  </div>
</template>

<style scoped>
.tts-bar {
  height: 56px;
  background: var(--primary-bg);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 20px;
  flex-shrink: 0;
  position: relative;
}

/* 桌面端：高级控件展开到 flex 行内，隐藏展开按钮 */
.adv-toggle { display: none !important; }
.adv-wrap { display: contents; }

@media (max-width: 768px) {
  .tts-bar {
    flex-wrap: wrap;
    height: auto;
    min-height: 50px;
    gap: 8px;
    padding: 6px 10px;
    padding-bottom: calc(6px + var(--safe-bottom));
  }
  .adv-toggle { display: flex; }
  .adv-toggle.active { color: var(--primary); border-color: var(--primary); background: var(--surface); }
  .adv-wrap { display: none; width: 100%; flex-wrap: wrap; gap: 6px; align-items: center; }
  .adv-wrap.adv-open { display: flex; }
  .tts-btn { width: 32px; height: 32px; flex-shrink: 0; }
  .tts-btn svg { width: 13px; height: 13px; }
  .tts-btn.primary { width: 36px; height: 36px; }
  .tts-btn.primary svg { width: 15px; height: 15px; }
  .tts-divider { display: none; }
  .tts-control { font-size: 0.76rem; gap: 6px; }
  .tts-control input[type="range"] { width: 70px; }
  .tts-control select { font-size: 0.76rem; }
  .tts-spacer { flex: 1; min-width: 0; }
  .tts-status { font-size: 0.72rem; }
  .volume-popup { bottom: calc(100% + 6px); }
  .volume-popup input[type="range"] { height: 80px; }
}

.overall-progress {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--border-dark);
  cursor: pointer;
  transition: height 0.15s ease;
}
.overall-progress:hover { height: 5px; }
.overall-progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.25s ease;
}

.tts-btn {
  width: 34px; height: 34px;
  border: none;
  border-radius: 50%;
  background: var(--bg);
  border: 1px solid var(--border-dark);
  color: var(--text-light);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.18s ease;
  position: relative;   /* 确保 z-index 高于绝对定位的进度条 */
  z-index: 1;
}
.tts-btn svg { width: 14px; height: 14px; }
.tts-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--surface);
}
.tts-btn.primary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  width: 38px; height: 38px;
}
.tts-btn.primary:hover { background: var(--primary-light); border-color: var(--primary-light); color: #fff; }
.tts-btn.primary svg { width: 16px; height: 16px; }

.volume-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.volume-popup {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--border-dark);
  border-radius: 10px;
  padding: 10px 6px 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.volume-popup::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--surface);
}
.volume-val {
  font-size: 0.72rem;
  color: var(--primary-dark);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: center;
}
.volume-popup input[type="range"] {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 30px;
  height: 110px;
  accent-color: var(--primary);
  cursor: pointer;
}

.tts-divider {
  width: 1px;
  height: 24px;
  background: var(--border-dark);
}

.tts-control {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--text-light);
}
.tts-control label { white-space: nowrap; }
.tts-control input[type="range"] {
  width: 90px;
  accent-color: var(--primary);
}
.tts-control select {
  padding: 4px 8px;
  border: 1px solid var(--border-dark);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.78rem;
  cursor: pointer;
  font-family: inherit;
}
.tts-control .val {
  font-variant-numeric: tabular-nums;
  color: var(--primary-dark);
  font-weight: 500;
  min-width: 32px;
}

.tts-spacer { flex: 1; }

.tts-status {
  font-size: 0.75rem;
  color: var(--text-light);
  display: flex; align-items: center; gap: 6px;
}
.tts-status .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--text-lighter);
}
.tts-status.reading .dot { background: var(--primary); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.4); }
}
</style>
