import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // src/lib/reportGating.js imports api/lib/report-config-validation.js — the SINGLE source
    // of truth for which report shapes the server gates. Re-typing that list here is exactly
    // the duplicate-allowlist bug #248 killed, so we import it instead; the dev server needs
    // read access one level above the Vite root to serve it. (The module is pure: no imports,
    // no node APIs, no secrets — the API already echoes these lists in its 400 messages.)
    fs: { allow: ['..'] },
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
