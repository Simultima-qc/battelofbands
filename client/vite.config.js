import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

import { createGa4HtmlPlugin } from './ga4Plugin.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [
      createGa4HtmlPlugin(env.VITE_GA_MEASUREMENT_ID),
      react(),
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
