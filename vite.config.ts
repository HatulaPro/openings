import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from Capacitor's local file server.
  base: './',
  plugins: [react()],
  // The bundle carries the opening catalogue and is loaded from local storage, not over a network.
  build: { chunkSizeWarningLimit: 2000 },
  server: { port: 5173, strictPort: true },
});
