package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// safeBookPath 返回 exe 同级 books/<path> 的绝对路径。
// 若 path 通过 ".." 或绝对路径越界，返回空字符串。
func safeBookPath(bookPath string) string {
	root := filepath.Join(exeDir(), "books")
	cleaned := filepath.Clean(filepath.Join(root, bookPath))
	if cleaned == root {
		return root
	}
	if !strings.HasPrefix(cleaned, root+string(filepath.Separator)) {
		return ""
	}
	return cleaned
}

// Book 描述一本书
type Book struct {
	Title    string `json:"title"`    // 《梦的解析》
	Suffix   string `json:"suffix"`   // 精华版
	Category string `json:"category"` // 心理学
	Path     string `json:"path"`     // 心理学/《梦的解析》精华版.html
}

// CategoryGroup 分类分组
type CategoryGroup struct {
	Name  string `json:"name"`
	Books []Book `json:"books"`
}

// progressRecord 进度记忆单条记录
type progressRecord struct {
	Index int `json:"idx"`
}

// ttsSettings TTS 设置（嗓音/语速/引擎）
type ttsSettings struct {
	Rate      float64 `json:"rate"`
	Engine    string  `json:"engine"`
	EdgeVoice string  `json:"edgeVoice"`
	WebVoice  string  `json:"webVoice"`
}

// App 主应用结构
type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	enableRoundedCorners()
}

// exeDir 返回 exe 所在目录
func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Dir(exe)
}

// ListBooks 返回按分类分组的书籍列表
// 只读 exe 同级 ./books/ 目录
func (a *App) ListBooks() []CategoryGroup {
	externalDir := filepath.Join(exeDir(), "books")
	if info, err := os.Stat(externalDir); err == nil && info.IsDir() {
		return listBooksFromDir(externalDir)
	}
	return []CategoryGroup{}
}

// listBooksFromDir 扫描本地 books/ 目录
func listBooksFromDir(root string) []CategoryGroup {
	groupMap := map[string][]Book{}
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if filepath.Ext(path) != ".html" {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		dir := filepath.Dir(rel)
		category := dir
		if category == "." {
			category = "未分类"
		}
		filename := filepath.Base(rel)
		title, suffix := parseTitle(filename)
		groupMap[category] = append(groupMap[category], Book{
			Title: title, Suffix: suffix, Category: category,
			Path: filepath.ToSlash(rel),
		})
		return nil
	})
	return buildGroups(groupMap)
}

// buildGroups 把 map 组装成有序的 []CategoryGroup
func buildGroups(groupMap map[string][]Book) []CategoryGroup {
	categories := make([]string, 0, len(groupMap))
	for c := range groupMap {
		categories = append(categories, c)
	}
	sort.Strings(categories)
	groups := make([]CategoryGroup, 0, len(categories))
	for _, c := range categories {
		groups = append(groups, CategoryGroup{Name: c, Books: groupMap[c]})
	}
	return groups
}

// ReadBook 读取书籍 HTML 内容
// 只读 exe 同级 books/<path>
// 路径越界返回 os.ErrNotExist；其他读取错误（权限/IO）原样返回，便于前端区分
func (a *App) ReadBook(path string) (string, error) {
	safe := safeBookPath(path)
	if safe == "" {
		return "", os.ErrNotExist
	}
	data, err := os.ReadFile(safe)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// BookExists 检查书籍是否存在
func (a *App) BookExists(path string) bool {
	safe := safeBookPath(path)
	if safe == "" {
		return false
	}
	if _, err := os.Stat(safe); err == nil {
		return true
	}
	return false
}

// progressPath 进度记忆文件路径
func progressPath() string {
	return filepath.Join(exeDir(), "reading-progress.json")
}

// SaveProgress 保存某本书的朗读进度段号
func (a *App) SaveProgress(bookPath string, idx int) {
	all := a.loadAllProgress()
	all[bookPath] = progressRecord{Index: idx}
	data, _ := json.MarshalIndent(all, "", "  ")
	_ = os.WriteFile(progressPath(), data, 0644)
}

// LoadProgress 读取某本书的朗读进度段号，未记录返回 0
func (a *App) LoadProgress(bookPath string) int {
	all := a.loadAllProgress()
	if rec, ok := all[bookPath]; ok {
		return rec.Index
	}
	return 0
}

func (a *App) loadAllProgress() map[string]progressRecord {
	out := map[string]progressRecord{}
	data, err := os.ReadFile(progressPath())
	if err != nil {
		return out
	}
	_ = json.Unmarshal(data, &out)
	return out
}

// ttsSettingsPath TTS 设置文件路径（exe 同级）
func ttsSettingsPath() string {
	return filepath.Join(exeDir(), "tts-settings.json")
}

// SaveTtsSettings 保存 TTS 设置
func (a *App) SaveTtsSettings(rate float64, engine, edgeVoice, webVoice string) {
	s := ttsSettings{Rate: rate, Engine: engine, EdgeVoice: edgeVoice, WebVoice: webVoice}
	data, _ := json.MarshalIndent(s, "", "  ")
	_ = os.WriteFile(ttsSettingsPath(), data, 0644)
}

// LoadTtsSettings 读取 TTS 设置
func (a *App) LoadTtsSettings() ttsSettings {
	out := ttsSettings{Rate: 1.0, Engine: "edge"}
	data, err := os.ReadFile(ttsSettingsPath())
	if err != nil {
		return out
	}
	_ = json.Unmarshal(data, &out)
	if out.Rate <= 0 {
		out.Rate = 1.0
	}
	if out.Engine != "web" && out.Engine != "edge" {
		out.Engine = "edge"
	}
	return out
}
