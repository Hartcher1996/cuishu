# 萃书 (Cuishu)

把厚书读薄，把精华听进心里。

一款极简的书籍蒸馏阅读器：AI 将原版书籍蒸馏为结构化 HTML，本地阅读 + 语音朗读。
<img width="1600" height="975" alt="QQ截图20260927211116" src="https://github.com/user-attachments/assets/452277c5-ea65-48a3-b6df-b0ddec32cfcd" />
<img width="1600" height="975" alt="QQ截图20260927211109" src="https://github.com/user-attachments/assets/d03c6afa-d5fd-4220-acf9-bf29f22b1368" />

## 项目结构

```
cuishu/
├── .book-distiller/      # 书籍蒸馏 Skill（SKILL.md + template.html）
├── desktop/              # 桌面端（Wails v2 + Vue 3 + Go）
└── web/                  # 网页端（Vue 3，部署到 Cloudflare Pages）
```

## 两个版本

| | 桌面端 `desktop/` | 网页端 `web/` |
|---|---|---|
| 技术栈 | Wails v2 + Vue 3 + Go | Vue 3 + Vite |
| 语音引擎 | edge-tts + Windows 系统语音 | Web Speech API |
| 书库来源 | 本地 `build/bin/books/` | `public/books/` |
| 字体 | 思源宋体/黑体、鸿蒙、霞鹜文楷（打包） | 同左 |

## 快速开始

### 桌面端

```bash
cd desktop
wails dev
```

构建 exe：

```bash
cd desktop
wails build
# 或一键脚本
build.bat
```

### 网页端

```bash
cd web
npm install
npm run dev
```

构建：

```bash
npm run build   # 产物在 dist/，可部署到 Cloudflare Pages
```

## 蒸馏新书籍

使用 `.book-distiller/` 下的 Skill，在 TRAE 中调用，输入原版书籍（PDF / EPUB / 文本），生成结构化 HTML。

蒸馏产物放入对应书库目录：

- 桌面端：`desktop/build/bin/books/<分类>/`
- 网页端：`web/public/books/<分类>/`

## 特性

- 📖 本地书库，按分类浏览
- 🎙️ 双引擎朗读（edge-tts + 系统语音）
- 🔤 4 种字体切换（思源宋/黑、鸿蒙、霞鹜文楷）
- 🌗 深色模式
- ⏱️ 阅读进度自动保存
- 📱 响应式布局

## License

MIT
