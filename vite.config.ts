import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import api from './server';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), {
      name: 'signtalk-api',
      configureServer(server) { server.middlewares.use(api); },
      configurePreviewServer(server) { server.middlewares.use(api); },
    }],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
