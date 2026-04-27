import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // En `npm run dev` redirige /api/ al backend (GCP o local)
      // Cambia target con: VITE_BACKEND_URL=http://localhost:8000 npm run dev
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'https://gammia-api-1028680563477.us-central1.run.app',
        changeOrigin: true,
        secure: true,
      },
      '/static': {
        target: process.env.VITE_BACKEND_URL || 'https://gammia-api-1028680563477.us-central1.run.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
