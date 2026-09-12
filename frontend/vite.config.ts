import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Convex backend lives in a sibling folder (../backend), not in this one.
// This alias is the only thing that crosses that line, and it only ever
// imports generated types and function references — never backend logic.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@backend': fileURLToPath(new URL('../backend/convex', import.meta.url)),
    },
  },
})
