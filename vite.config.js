import { defineConfig } from 'vite';

// base './' keeps asset URLs relative so dist/ works under any subpath.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
