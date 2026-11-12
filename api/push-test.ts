import type { IncomingMessage, ServerResponse } from 'node:http';
import { envFromProcess, nodeHandler } from '../server/core.js';

// Fonction Vercel : /api/push-test
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await nodeHandler(req, res, envFromProcess(), '/api/push-test');
}
