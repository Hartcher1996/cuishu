// 浏览器 localStorage 持久化（进度 + 所有阅读器配置）

const PROGRESS_KEY = 'reading-progress'
const PREFS_KEY = 'reader-prefs'

export interface ReaderPrefs {
  rate: number
  voiceURI: string
  fontSize: number
  fontFamily: string
  volume: number
  theme: 'light' | 'dark'
}

const DEFAULT_PREFS: ReaderPrefs = {
  rate: 1.3,
  voiceURI: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
  fontSize: 16,
  fontFamily: 'lxgw-wenkai',
  volume: 100,
  theme: 'dark',
}

// === 阅读进度 ===
export function loadProgressMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return {}
  }
}

export function loadProgress(bookPath: string): number {
  return loadProgressMap()[bookPath] ?? 0
}

export function saveProgress(bookPath: string, idx: number): void {
  const all = loadProgressMap()
  all[bookPath] = idx
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

// === 阅读器全部偏好 ===
export function loadPrefs(): ReaderPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>
    return { ...DEFAULT_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(prefs: Partial<ReaderPrefs>): void {
  try {
    const merged = { ...loadPrefs(), ...prefs }
    localStorage.setItem(PREFS_KEY, JSON.stringify(merged))
  } catch { /* ignore */ }
}
