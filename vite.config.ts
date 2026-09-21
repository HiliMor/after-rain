import { defineConfig } from 'vite';
// GitHub Pages serves a project site from a subpath, so the build is based there while dev
// and the tests keep serving from the root. Anything referencing an asset by an absolute
// path must go through import.meta.env.BASE_URL, or it resolves above the site and 404s.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/after-rain/' : '/',
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
}));
