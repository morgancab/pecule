import type { Plugin, Connect } from 'vite';
import { nodeHandler, type Env } from './core.js';

/** En local (npm run dev / preview) : mêmes routes /api que sur Vercel, configurées par .env.local. */
export function apiPlugin(env: Env): Plugin {
  const mw: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/')) return next();
    nodeHandler(req, res, env).catch(next);
  };
  return {
    name: 'pecule-api',
    configureServer: (s) => void s.middlewares.use(mw),
    configurePreviewServer: (s) => void s.middlewares.use(mw),
  };
}
