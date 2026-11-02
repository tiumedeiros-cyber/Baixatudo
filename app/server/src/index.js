import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from './db.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import appointmentRoutes from './routes/appointments.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import reportRoutes from './routes/reports.js';
import reviewRoutes from './routes/reviews.js';
import notificationRoutes from './routes/notifications.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, '..', '..', 'web', 'dist');
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Cabeçalhos de segurança + CSP compatível com PWA.
// O app precisa poder ser embutido em iframe por previews/hosts de hospedagem
// (Arena, Vercel previews), portanto NÃO enviamos X-Frame-Options e
// liberamos frame-ancestors via EMBED_ALLOWLIST (padrão: https + self).
const FRAME_ANCESTORS =
  process.env.FRAME_ANCESTORS || "'self' https: http://localhost:* http://127.0.0.1:*";

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; frame-ancestors ${FRAME_ANCESTORS}`
  );
  next();
});

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
  next();
});

// Rate limit simples em memória (proteção básica de auth)
const hits = new Map();
app.use('/api/auth', (req, res, next) => {
  const key = req.ip;
  const now = Date.now();
  const entry = hits.get(key) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 60000;
  }
  entry.count += 1;
  hits.set(key, entry);
  if (entry.count > 120) return res.status(429).json({ error: 'muitas tentativas, aguarde um minuto' });
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'navalha-api',
    time: new Date().toISOString(),
    db: !!get('SELECT 1'),
    version: '1.0.0',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'endpoint não encontrado' }));

// Front-end (PWA) servido pelo mesmo processo; fallback SPA
if (existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(readFileSync(join(webDist, 'index.html'), 'utf8'));
  });
}

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'erro interno', detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
});

// Em ambientes serverless (Vercel) o app é exportado; localmente escutamos a porta.
export default app;

if (!process.env.VERCEL && process.env.SERVE_LISTEN !== 'false') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`💈 Navalha API + PWA em http://0.0.0.0:${PORT}`);
  });
}
