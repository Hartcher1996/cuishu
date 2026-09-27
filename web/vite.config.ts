import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base: './' 让所有资源用相对路径
// Cloudflare Pages 部署到根域名或子路径都能正常工作
// 本地双击 dist/index.html 也能直接打开预览
export default defineConfig({
  plugins: [vue()],
  base: './',
})
