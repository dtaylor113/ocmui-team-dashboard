import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API requests to the Express backend during development
      '/api': {
        target: 'http://localhost:3017',
        changeOrigin: true,
      },
    },
  },
})
