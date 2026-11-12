// Génère une paire de clés VAPID (notifications) et un CRON_SECRET, à coller dans Vercel → Environment Variables.
import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jp = publicKey.export({ format: 'jwk' });
const jk = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jp.x, 'base64url'), Buffer.from(jp.y, 'base64url')]).toString('base64url');
console.log(`VAPID_PUBLIC_KEY=${raw}`);
console.log(`VAPID_PRIVATE_KEY=${jk.d}`);
console.log(`CRON_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
