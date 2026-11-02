import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Garante banco populado antes de carregar o app (cold start serverless).
const { ensureSeeded } = await import('../server/src/db.js');
await ensureSeeded();

const { default: app } = await import('../server/src/index.js');

export default app;
