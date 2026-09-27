# 书籍蒸馏阅读器

一款极简的本地 HTML 书籍阅读器，内置 edge-tts / 系统语音双引擎朗读。

配合 **book-distiller** skill 使用：AI Agent 将原版书籍（PDF / EPUB / 文本）蒸馏为结构化 HTML，放入书库即可阅读+朗读。

## 特性

- 🧪 **AI 蒸馏工作流** — 上游由 book-distiller skill 将原版书籍提纯为结构化 HTML（目录 / 精华段落 / 知识点高亮），本应用负责消费与朗读
- 📖 **本地书库** — 按分类目录自动扫描 HTML 书籍，侧栏手风琴浏览
- 🎙️ **双引擎朗读** — edge-tts 在线语音（微软神经嗓音）+ Windows 系统语音，实时切换
- 🛡️ **超长段落防护** — 自动按句切分再拼接，edge-tts 不再因长段落失败
- 💾 **记忆续读** — 每本书独立保存朗读进度，下次打开自动恢复
- 🔍 **书库搜索** — 侧栏按书名/副标题即时过滤
- 🌓 **深色模式** — CSS 变量分层，一键切换，偏好持久化
- 🔤 **字号调节** — 滑块控制 iframe 内文字大小
- 📊 **总进度条** — TtsBar 顶部横向进度，可点击跳段
- 🪟 **窗口圆角** — Windows 11 自动小圆角（Win10 兼容跳过）

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Wails v2（WebView2） |
| 后端 | Go 1.25 |
| 前端 | Vue 3 + TypeScript + Vite |
| TTS | edge-tts（`github.com/bytectlgo/edge-tts`）+ Web Speech API |
| 窗口圆角 | DWM API（`golang.org/x/sys/windows`） |

## 项目结构

```
app/
├── main.go               # Wails 入口，Frameless 窗口 + embed 前端资源
├── app.go                # 书库扫描 / 进度持久化 / TTS 设置
├── tts.go                # edge-tts 嗓音列表 + 合成（含按句切分 + 超时 + 缓存）
├── round_windows.go      # Windows 11 窗口圆角（build tag: windows）
├── title.go              # 窗口标题辅助
├── wails.json            # Wails 配置
├── go.mod
├── frontend/
│   ├── src/
│   │   ├── App.vue            # 主组件（书库 + 模板组装）
│   │   ├── main.ts
│   │   ├── style.css          # 全局样式 + CSS 变量（含深色模式）
│   │   ├── composables/
│   │   │   └── useTts.ts      # TTS 朗读逻辑（状态/缓存/预取/播放）
│   │   ├── components/
│   │   │   ├── TitleBar.vue   # 自绘标题栏 + 深色模式切换
│   │   │   ├── Sidebar.vue    # 书库侧栏（搜索 + 手风琴）
│   │   │   ├── Reader.vue     # iframe 阅读器（段落标记/高亮/字号注入）
│   │   │   └── TtsBar.vue     # 朗读控制条（进度条/语速/嗓音/字号）
│   │   └── shared/
│   │       └── selector.ts    # 前后端共用段落选择器
│   └── wailsjs/               # Wails 自动生成的前端 ↔ Go 绑定
└── books/                     # 书籍存放目录（运行时自动扫描）
    ├── 心理学/
    └── 经济学/
```

## 快速开始

### 环境要求

- Windows 10/11（WebView2 运行时，Win11 支持窗口圆角）
- Go 1.25+
- Node.js 20+
- Wails CLI v2：`go install github.com/wailsapp/wails/v2/cmd/wails@latest`

### 开发

```bash
cd app
wails dev
```

首次运行会自动 `npm install` + `go mod tidy`，Vite Dev Server 启动后 Wails 会拉起桌面窗口。前端代码热更新、Go 端改动会重新编译。

### 构建发布

```bash
cd app
wails build
```

产物在 `build/bin/书籍蒸馏阅读器.exe`，单文件可执行。

### 仅前端 / 仅后端

```bash
# 前端
cd frontend && npm run dev      # Vite 开发服务器
cd frontend && npm run build    # 生产构建（vue-tsc + vite build）

# 后端
go vet ./...                    # 静态检查
go build ./...                  # 编译
```

## 使用说明

### 书籍来源：AI 蒸馏

书籍由 **book-distiller** skill 蒸馏生成。在 TRAE 中调用 skill，输入原版书籍（PDF / EPUB / Markdown / 纯文本），AI Agent 会：

1. 提取目录结构，按章节重组
2. 识别精华段落、核心论点、关键概念
3. 生成带 `.callout-title` / `.info-box-title` 等语义 class 的结构化 HTML
4. 自动跳过封面、版权页、空白等非内容区

蒸馏产物按分类放进 `books/<分类名>/` 目录即可，应用启动后点侧栏右上角刷新按钮加载。

### 手动放置（可选）

也可以手动把符合以下结构的 HTML 放进书库：

```
books/
├── 心理学/《梦的解析》精华版.html
└── 经济学/《经济学原理》精华版.html
```

HTML 应包含 `<section>` / `<main>` 标签和语义 class（`.callout-title` 等），才能被 [selector.ts](frontend/src/shared/selector.ts) 正确识别为可朗读段落。

### 朗读

- 侧栏选书 → 正文显示 → 点击段落 / 右键段落「从这里开始朗读」
- TtsBar 控制播放/暂停、上下段、语速、嗓音、引擎切换
- **系统语音**：无需网络，使用 Windows 自带语音
- **Edge 语音**：在线合成，音质更好，首次加载嗓音列表需联网

### 进度与设置

- 朗读进度自动保存，下次打开恢复到上次位置
- 语速、引擎、嗓音、字号、主题偏好均持久化
- 配置文件位置：`%APPDATA%/书籍蒸馏/`（规划中，当前为 exe 同级）

### 段落标记规则

前后端共用 [selector.ts](frontend/src/shared/selector.ts)，按以下优先级识别可朗读段落：

1. `section` 内的 p / h2 / h3 / h4 / li / .callout-title / .info-box-title / .core-num
2. 无 section 时降级到 `main` 内同选择器
3. 都没有时匹配全局

`.toc / nav / [data-tts="skip"]` 子树会被跳过。

## 已知限制

- **网络小说**：当前只读本地 HTML，无在线抓取能力
- **Win10 圆角**：`DWMWA_WINDOW_CORNER_PREFERENCE` 仅 Win11 支持，Win10 窗口保持直角
- **零测试**：项目没有自动化测试，tts.go 的切分函数最适合补单测

## License

MIT
