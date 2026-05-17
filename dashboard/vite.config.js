import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000'
      },
      '/e': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true
      },
      '/decide': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true
      },
      '/static': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true
      },
      '/array': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true
      },
      '/batch': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true
      },
      '/i': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true
      },
      '^/s/': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true
      }
    }
  }
})
