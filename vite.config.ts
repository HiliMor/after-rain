import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: '127.0.0.1', port: 4187, strictPort: true },
  preview: { host: '127.0.0.1', port: 4187, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('/node_modules/three/') ? 'three' : undefined),
      },
    },
  },
});
