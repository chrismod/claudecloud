// Startpunkt des Servers: node server/index.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';

const app = await buildApp({
  dbFile: process.env.DB_FILE || path.join(root, 'data', 'glide.db'),
  staticDir: path.join(root, 'dist'),
  logger: { level: process.env.LOG_LEVEL || 'info' },
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.close().then(() => process.exit(0)));
await app.listen({ port, host });
