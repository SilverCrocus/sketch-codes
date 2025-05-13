import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // Your current frontend port
    proxy: {
      // string shorthand: http://localhost:5174/api -> http://localhost:8000/api
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Optionally, if your backend /api/words is actually /words,
        // you might need to rewrite:
        // rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
