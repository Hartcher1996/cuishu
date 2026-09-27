package main

import (
	"context"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	edge_tts "github.com/bytectlgo/edge-tts/pkg/edge_tts"
)

// EdgeVoice edge-tts 嗓音信息（给前端用的简化结构）
type EdgeVoice struct {
	Name      string `json:"name"`      // Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxiaoNeural)
	ShortName string `json:"shortName"` // zh-CN-XiaoxiaoNeural
	Gender    string `json:"gender"`    // Female / Male
	Locale    string `json:"locale"`    // zh-CN
	LocalName string `json:"localName"` // 晓晓
}

// 嗓音列表内存缓存：嗓音列表极少变动，避免每次调用都请求网络
var (
	voicesCache     []EdgeVoice
	voicesCacheTime time.Time
	voicesCacheMu   sync.Mutex
)

const voicesCacheTTL = 24 * time.Hour

// ListEdgeVoices 获取 edge-tts 中文嗓音列表
// 24h 内复用内存缓存，避免每次调用都请求网络
func (a *App) ListEdgeVoices() ([]EdgeVoice, error) {
	voicesCacheMu.Lock()
	if len(voicesCache) > 0 && time.Since(voicesCacheTime) < voicesCacheTTL {
		out := make([]EdgeVoice, len(voicesCache))
		copy(out, voicesCache)
		voicesCacheMu.Unlock()
		return out, nil
	}
	voicesCacheMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	voices, err := edge_tts.ListVoices(ctx)
	if err != nil {
		return nil, err
	}
	var result []EdgeVoice
	for _, v := range voices {
		if strings.HasPrefix(v.Locale, "zh") {
			result = append(result, EdgeVoice{
				Name:      v.Name,
				ShortName: v.ShortName,
				Gender:    v.Gender,
				Locale:    v.Locale,
				LocalName: v.LocalName,
			})
		}
	}
	voicesCacheMu.Lock()
	voicesCache = result
	voicesCacheTime = time.Now()
	voicesCacheMu.Unlock()
	return result, nil
}

// Synthesize 用 edge-tts 合成音频，返回 mp3 字节
// rate 格式："+0%"、"+10%"、"-10%" 等
// 30s 总超时；超长段落（>3000 字）按句切分逐段合成再拼接，
// 避免 edge-tts 因一次性合成过长文本而失败
func (a *App) Synthesize(text, voice, rate string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	opts := []edge_tts.Option{
		edge_tts.WithRate(rate),
	}
	var audio []byte
	for _, chunk := range splitForTts(text, 3000) {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		c := edge_tts.NewCommunicate(chunk, voice, opts...)
		ch, err := c.Stream(ctx)
		if err != nil {
			return nil, err
		}
		for piece := range ch {
			if piece.Type == "audio" {
				audio = append(audio, piece.Data...)
			}
		}
	}
	return audio, nil
}

// splitForTts 将 text 切分为不超过 maxRunes 个 rune 的片段
// 优先按句末标点切分；若单句仍超限则按 maxRunes 硬切
func splitForTts(text string, maxRunes int) []string {
	if utf8.RuneCountInString(text) <= maxRunes {
		return []string{text}
	}
	var chunks []string
	var cur strings.Builder
	curLen := 0
	flush := func() {
		if curLen > 0 {
			chunks = append(chunks, cur.String())
			cur.Reset()
			curLen = 0
		}
	}
	for _, sentence := range splitSentences(text) {
		sentLen := utf8.RuneCountInString(sentence)
		if sentLen > maxRunes {
			flush()
			runes := []rune(sentence)
			for i := 0; i < len(runes); i += maxRunes {
				end := i + maxRunes
				if end > len(runes) {
					end = len(runes)
				}
				chunks = append(chunks, string(runes[i:end]))
			}
			continue
		}
		if curLen+sentLen > maxRunes {
			flush()
		}
		cur.WriteString(sentence)
		curLen += sentLen
	}
	flush()
	if len(chunks) == 0 {
		return []string{text}
	}
	return chunks
}

// splitSentences 按句末标点切分文本，保留标点
func splitSentences(text string) []string {
	var result []string
	var cur strings.Builder
	for _, r := range text {
		cur.WriteRune(r)
		switch r {
		case '。', '！', '？', '!', '?', '；', ';', '\n':
			result = append(result, cur.String())
			cur.Reset()
		}
	}
	if cur.Len() > 0 {
		result = append(result, cur.String())
	}
	return result
}
