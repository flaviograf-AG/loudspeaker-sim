import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import path from 'path';

export default defineConfig({
  plugins: [react(), wasm()],
  build: {
    target: 'esnext',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-echarts',
              test: /node_modules[\\/](echarts|zrender|echarts-for-react)/,
            },
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|zustand)/,
            },
            {
              name: 'catalogue-first-party',
              test: /first_party_catalogue_db/,
            },
            {
              name: 'catalogue-driver-base',
              test: /driver_base_db/,
            },
          ],
        },
      },
    },
  },
  server: {
    fs: {
      allow: [
        // Allow serving from web/ (default)
        '.',
        // Allow serving WASM from solver/pkg/
        path.resolve(import.meta.dirname, '../solver/pkg'),
        // Allow design system
        path.resolve(import.meta.dirname, '../../new-graf-design-system'),
      ],
    },
  },
});
