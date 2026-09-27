//go:build windows

package main

import (
	"os"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// DWMWA_WINDOW_CORNER_PREFERENCE: Windows 11+ 可用
const DWMWA_WINDOW_CORNER_PREFERENCE = 33

// DWMWCP_* 窗口圆角偏好
const (
	DWMWCP_DEFAULT    = 0
	DWMWCP_DONOTROUND = 1
	DWMWCP_ROUND      = 2
	DWMWCP_ROUNDSMALL = 3
)

var (
	user32              = syscall.NewLazyDLL("user32.dll")
	procGetWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
)

// enableRoundedCorners 给当前进程的主窗口开启圆角
// 仅在 Windows 11 (Build 22000+) 生效；旧系统静默跳过
func enableRoundedCorners() {
	// 延迟确保窗口已创建并成为前台
	time.AfterFunc(120*time.Millisecond, func() {
		hwnd, ok := findMainWindow()
		if !ok {
			return
		}
		preference := DWMWCP_ROUNDSMALL // 小圆角，比默认更精致
		_ = windows.DwmSetWindowAttribute(
			hwnd,
			DWMWA_WINDOW_CORNER_PREFERENCE,
			unsafe.Pointer(&preference),
			uint32(unsafe.Sizeof(preference)),
		)
	})
}

// findMainWindow 通过 GetForegroundWindow + 进程号匹配找到本进程窗口
// Wails 启动后前台就是我们的窗口
func findMainWindow() (windows.HWND, bool) {
	hwnd := windows.GetForegroundWindow()
	if hwnd == 0 {
		return 0, false
	}
	var pid uint32
	procGetWindowThreadProcessId.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&pid)))
	if pid == uint32(os.Getpid()) {
		return hwnd, true
	}
	return 0, false
}
