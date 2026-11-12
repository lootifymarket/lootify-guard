import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Tauri prints its own output to the same terminal.
  clearScreen: false,
  server: {
    // Must match devUrl in src-tauri/tauri.conf.json.
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/target/**'],
    },
  },
})
