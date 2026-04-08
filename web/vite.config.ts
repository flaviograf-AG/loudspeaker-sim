import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import path from 'path';

export default defineConfig({
  plugins: [react(), wasm()],
  build: {
    target: 'esnext',
  },
  server: {
    fs: {
      allow: [
        // Allow serving from web/ (default)
        '.',
        // Allow serving WASM from solver/pkg/
        path.resolve(__dirname, '../solver/pkg'),
        // Allow design system
        path.resolve(__dirname, '../../new-graf-design-system'),
      ],
    },
  },
});
