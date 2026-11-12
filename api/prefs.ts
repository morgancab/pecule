import type { IncomingMessage, ServerResponse } from 'node:http';
import { envFromProcess, nodeHandler } from '../server/core.js';

// Fonction Vercel : /api/prefs
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await nodeHandler(req, res, envFromProcess(), '/api/prefs');
}
