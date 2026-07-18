import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

const serverEnv = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), 'VOICEASSET_')
const apiProxyTarget =
  process.env.VOICEASSET_API_PROXY_TARGET?.trim() ||
  serverEnv.VOICEASSET_API_PROXY_TARGET?.trim() ||
  'http://127.0.0.1:8080'
const apiProxy = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: false,
  },
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
