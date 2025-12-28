import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174, // 修改端口避免与旧项目 (vibe-vibe) 冲突
    fs: {
      allow: ['..'] // 允许访问当前项目根目录下的文件
    }
  }
})
