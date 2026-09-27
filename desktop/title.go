package main

import (
	"path/filepath"
	"regexp"
	"strings"
)

// 书名正则：匹配 《...》 中的内容
var bookTitleRe = regexp.MustCompile(`《([^》]+)》`)

// parseTitle 从文件名中解析主书名与后缀徽章
// 例："《梦的解析》精华版.html" -> ("《梦的解析》", "精华版")
// 若文件名中没有《》，则整个文件名（去扩展名）作为 title，suffix 为空
func parseTitle(filename string) (title, suffix string) {
	name := strings.TrimSuffix(filename, filepath.Ext(filename))
	match := bookTitleRe.FindStringIndex(name)
	if len(match) == 2 {
		// 截取到 《》 闭括号之后
		title = name[:match[1]]
		rest := strings.TrimSpace(name[match[1]:])
		if rest != "" {
			suffix = rest
		}
		return
	}
	title = name
	return
}
