import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { apiPlugin } from './server/devPlugin';

// En local, les secrets viennent de .env.local (jamais versionné). Sur Vercel : variables d'environnement du projet.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      apiPlugin({ APP_PASSWORD: env.APP_PASSWORD, SESSION_SECRET: env.SESSION_SECRET, GSHEET_URL: env.GSHEET_URL, GSHEET_TOKEN: env.GSHEET_TOKEN }),
    ],
    server: { host: '127.0.0.1', port: 5180 },
    preview: { host: '127.0.0.1', port: 5181 },
    build: { chunkSizeWarningLimit: 1500 },
  };
});
