// 嗓音友好名工具
// App.vue 和 useTts.ts 共用，避免重复

const STRIP_WORDS = /\b(microsoft|desktop|online|neural|tts|voice|preview|beta|experimental|local|enhanced|default)\b/gi

// key → [中文名, 性别]
// 注意：长 key 必须排在短 key 前面，否则 Yunxia 会被 yunxi 先匹配
const VOICE_MAP: Record<string, [string, string]> = {
  // 内地普通话（edge-tts / Microsoft Online）
  xiaoxiao: ['晓晓', '女'],
  xiaoyi:   ['晓伊', '女'],
  xiaochen: ['晓辰', '女'],
  xiaohan:  ['晓涵', '女'],
  xiaomeng: ['晓梦', '女'],
  xiaomo:   ['晓墨', '女'],
  xiaoqiu:  ['晓秋', '女'],
  xiaorui:  ['晓睿', '女'],
  xiaoshuang: ['晓双', '女'],
  xiaowen:  ['晓文', '女'],
  xiaoxuan: ['晓萱', '女'],
  xiaoyan:  ['晓颜', '女'],
  xiaozhen: ['晓甄', '女'],
  xiaobei:  ['晓北', '女'],
  xiaoni:   ['晓妮', '女'],
  huihui:   ['慧慧', '女'],
  yaoyao:   ['瑶瑶', '女'],
  yating:   ['雅婷', '女'],
  yunxia:   ['云侠', '男'],
  yunyang:  ['云扬', '男'],
  yunjian:  ['云健', '男'],
  yunfeng:  ['云枫', '男'],
  yunhao:   ['云皓', '男'],
  yunxi:    ['云希', '男'],
  kangkang: ['康康', '男'],

  // 粤语 / 香港
  hiuGaai:  ['晓佳', '女'],
  hiuMaan:  ['晓曼', '女'],
  wanLung:  ['云龙', '男'],

  // 台湾国语
  hsiaoYu:  ['晓雨', '女'],
  hsiaoChen: ['晓辰', '女'],
  yunJhe:   ['云哲', '男'],

  // macOS
  'tingting-meijia': ['婷婷-美佳', '女'],
  'sinji-meijia': ['思琪-美佳', '女'],
  'yu-shu':  ['宇舒', '女'],
  meijia:    ['美佳', '女'],
  tingting:  ['婷婷', '女'],
  sinji:     ['思琪', '女'],
  yunkun:    ['云坤', '男'],
  meijin:    ['美津', '女'],
  damayong:  ['大马勇', '男'],
}

// 按 key 长度降序 → 长 key 先匹配（防止 yunxi 抢 yunxia）
const SORTED_KEYS = Object.keys(VOICE_MAP).sort((a, b) => b.length - a.length)

// 语言区域后缀
const LANG_TAG: Record<string, string> = {
  'zh-CN': '',             // 内地（默认，不显示后缀）
  'zh-cmn': '',            // 某些浏览器内地标记
  'zh-HK': ' · 粤语',
  'zh-yue': ' · 粤语',
  'yue-HK': ' · 粤语',
  'yue-Hant-HK': ' · 粤语',
  'zh-TW': ' · 台湾',
  'cmn-TW': ' · 台湾',
  'zh-MO': ' · 澳门',
}

// 方言嗓硬编码（lang 还是 zh-CN，但名字里带了方言标识）
const DIALECT_TAG: Record<string, string> = {
  xiaobei: ' · 东北话',
  xiaoni:  ' · 陕西话',
}

export function friendlyVoiceName(v: SpeechSynthesisVoice): string {
  const lower = v.name.toLowerCase()
  for (const key of SORTED_KEYS) {
    if (lower.includes(key.toLowerCase())) {
      const [zh, gender] = VOICE_MAP[key]
      // 方言优先覆盖 lang
      const dialect = DIALECT_TAG[key] || ''
      const langTag = dialect ? '' : (LANG_TAG[v.lang] || '')
      return `${zh} · ${gender}${dialect || langTag}`
    }
  }
  const stripped = v.name.replace(STRIP_WORDS, '').replace(/\s+/g, ' ').trim()
  return stripped && stripped.length < 25 ? stripped : v.name
}
