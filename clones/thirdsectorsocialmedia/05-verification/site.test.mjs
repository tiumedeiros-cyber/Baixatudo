// Teste de superfície: sobe o site local e confere páginas, assets e âncoras (node --test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../04-build/site/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let server, base;

before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      const file = join(ROOT, path === '/' ? 'index.html' : path);
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end('nope'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const get = async p => { const r = await fetch(base + p); return { status: r.status, text: await r.text() }; };

test('index responde 200 e tem todas as seções P0', async () => {
  const { status, text } = await get('/');
  assert.equal(status, 200);
  for (const needle of ['Seu acesso inclui', 'Um arsenal, seis frentes', 'Bônus inclusos', 'Dúvidas frequentes',
    'garantia', 'checkout.html', 'data-marquee', '<details>', 'lang="pt-BR"']) {
    assert.ok(text.includes(needle), `faltando: ${needle}`);
  }
  assert.equal((text.match(/<details>/g) || []).length, 9, 'FAQ deve ter 9 perguntas');
});

test('CTAs da home levam ao checkout', async () => {
  const { text } = await get('/');
  const links = [...text.matchAll(/href="(checkout[^"]*)"/g)].map(m => m[1]);
  assert.ok(links.length >= 4, `esperava 4+ CTAs, achei ${links.length}`);
  assert.ok(links.every(l => l === 'checkout.html'));
});

test('checkout tem 2 passos + sucesso e scripts', async () => {
  const { status, text } = await get('/checkout.html');
  assert.equal(status, 200);
  for (const id of ['id="step1"', 'id="step2"', 'id="step3"', 'f-name', 'f-email', 'f-cpf', 'f-phone',
    'btn-coupon', 'btn-pay', 'countdown', 'Ir para Pagamento', 'Cupom (opcional)', '5% de desconto',
    'Políticas de Privacidade', 'faça login']) {
    assert.ok(text.includes(id), `faltando: ${id}`);
  }
});

test('assets essenciais servem com 200', async () => {
  for (const p of ['/assets/css/style.css', '/assets/js/logic.js', '/assets/js/main.js',
    '/assets/js/checkout.js', '/assets/img/logomark.svg', '/assets/fonts/sora-latin-700-normal.woff2']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
  }
});

test('CSS não referencia hosts externos', async () => {
  const { text } = await get('/assets/css/style.css');
  assert.ok(!/https?:\/\//.test(text), 'estilo deve ser 100% local');
});
