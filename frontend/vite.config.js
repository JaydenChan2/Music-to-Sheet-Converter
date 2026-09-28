import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to Flask. (Port 5000 is taken by AirPlay on macOS.)
    proxy: {
      '/api': process.env.VITE_BACKEND_URL || 'http://127.0.0.1:5001',
    },
  },
})
