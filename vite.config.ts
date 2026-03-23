import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts'))     return 'vendor-recharts';
          if (id.includes('node_modules/lucide-react')) return 'vendor-lucide';
          if (id.includes('node_modules/dexie'))        return 'vendor-dexie';
          if (id.includes('node_modules/date-fns'))     return 'vendor-misc';
          if (id.includes('node_modules/uuid'))         return 'vendor-misc';
          if (id.includes('node_modules/react'))        return 'vendor-react';
        },
      },
    },
  },
})

