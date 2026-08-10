import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { apiMiddleware } from './server/http.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'luck-local-api',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          void apiMiddleware(request, response, next, { allowLocalProviders: true });
        });
      },
    },
  ],
  build: { sourcemap: false },
  worker: { format: 'es' },
  server: { port: 5174, strictPort: true },
});
