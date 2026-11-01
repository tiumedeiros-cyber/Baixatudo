import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { isAllowedFreeUrl } from '@/lib/free-media';
import { craiyon } from '@/lib/craiyon';
import { diagnoseDrive } from '@/lib/import-url';
import { searchArtic, searchMet } from '@/lib/free-media';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/health/tools — testa de verdade as ferramentas do servidor
 * (QR Code e proxy de mídia grátis) e devolve o erro real quando falham.
 */
export async function GET(request: Request) {
  // rota de diagnóstico pesada (bate em vários serviços): limite por IP
  const limit = rateLimit(`health-tools:${clientIp(request.headers)}`, 8, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos. Aguarde um minuto.' }, { status: 429 });
  const results: Record<string, { ok: boolean; ms: number; detail?: string; bytes?: number }> = {};

  let t0 = Date.now();
  try {
    const png = await QRCode.toBuffer('https://editor-studio-one.vercel.app', {
      type: 'png',
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    results.qr = { ok: png.length > 500, ms: Date.now() - t0, bytes: png.length };
  } catch (err) {
    results.qr = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  t0 = Date.now();
  const iconUrl = 'https://api.iconify.design/mdi/home.svg?height=256&color=%23000000';
  try {
    const allowed = isAllowedFreeUrl(iconUrl);
    if (!allowed) throw new Error('URL fora da lista branca');
    const res = await fetch(iconUrl, { signal: AbortSignal.timeout(9_000), headers: { 'User-Agent': 'EditorStudio/1.0' } });
    const buf = Buffer.from(await res.arrayBuffer());
    results.proxyIconify = {
      ok: res.ok && buf.length > 100,
      ms: Date.now() - t0,
      bytes: buf.length,
      detail: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    results.proxyIconify = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  t0 = Date.now();
  try {
    const res = await fetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=coffee&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=400', {
      signal: AbortSignal.timeout(9_000),
      headers: { 'User-Agent': 'EditorStudio/1.0 (contato@editorstudio.app)' },
    });
    const data = (await res.json()) as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string }[] }> } };
    const page = Object.values(data.query?.pages ?? {})[0];
    const thumb = page?.imageinfo?.[0]?.thumburl;
    results.wikimedia = { ok: Boolean(thumb), ms: Date.now() - t0, detail: thumb?.slice(0, 120) };
  } catch (err) {
    results.wikimedia = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  t0 = Date.now();
  try {
    const prompt = encodeURIComponent('red apple on a wooden table, photo, studio light');
    const res = await fetch(`https://image.pollinations.ai/prompt/${prompt}?width=512&height=512&nologo=true&model=sana&seed=11`, {
      signal: AbortSignal.timeout(35_000),
      headers: { 'User-Agent': 'EditorStudio/1.0' },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    results.pollinations = {
      ok: res.ok && buf.length > 1000 && (res.headers.get('content-type') ?? '').startsWith('image'),
      ms: Date.now() - t0,
      bytes: buf.length,
      detail: res.ok ? res.headers.get('content-type') ?? undefined : `HTTP ${res.status} ${buf.toString('utf8').slice(0, 80)}`,
    };
  } catch (err) {
    results.pollinations = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  t0 = Date.now();
  try {
    const res = await fetch('https://archive.org/advancedsearch.php?q=collection%3Aaudio_music&fl%5B%5D=identifier&rows=1&page=1&output=json', {
      signal: AbortSignal.timeout(9_000),
      headers: { 'User-Agent': 'EditorStudio/1.0' },
    });
    const data = (await res.json()) as { response?: { numFound?: number } };
    results.internetArchive = { ok: Boolean(data.response?.numFound), ms: Date.now() - t0, detail: `${data.response?.numFound ?? 0} itens` };
  } catch (err) {
    results.internetArchive = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  // remoção de fundo (sharp + flood fill) — testa com uma imagem sintética
  t0 = Date.now();
  try {
    const sharp = (await import('sharp')).default;
    const { removeBackground } = await import('@/lib/cutout');
    const w = 180;
    const h = 180;
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        const inside = (x - 90) ** 2 + (y - 90) ** 2 < 55 ** 2;
        raw[i] = inside ? 200 : 250;
        raw[i + 1] = inside ? 60 : 250;
        raw[i + 2] = inside ? 40 : 250;
      }
    }
    const rgba = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const cut = removeBackground(Buffer.from(rgba), w, h, 4, 42);
    const corner = cut.data[3];
    const center = cut.data[(90 * w + 90) * 4 + 3];
    results.cutout = {
      ok: corner === 0 && center > 200,
      ms: Date.now() - t0,
      detail: `canto=${corner} centro=${center}`,
    };
  } catch (err) {
    results.cutout = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  // voz neural (Edge TTS) — sintetiza uma frase curta de verdade
  t0 = Date.now();
  try {
    const { edgeSynthesize } = await import('@/lib/edge-tts');
    const mp3 = await edgeSynthesize({ text: 'Teste de voz do Editor Studio.', voice: 'pt-BR-FranciscaNeural' });
    results.tts = { ok: mp3.length > 3000, ms: Date.now() - t0, bytes: mp3.length };
  } catch (err) {
    results.tts = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  t0 = Date.now();
  try {
    const artic = await searchArtic('sunset', 3);
    results.artic = { ok: artic.length > 0, ms: Date.now() - t0, detail: `${artic.length} obras` };
  } catch (err) {
    results.artic = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  t0 = Date.now();
  try {
    const met = await searchMet('flower', 3);
    results.met = { ok: met.length > 0, ms: Date.now() - t0, detail: `${met.length} obras` };
  } catch (err) {
    results.met = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  t0 = Date.now();
  try {
    const image = await craiyon('red apple');
    results.craiyon = { ok: Boolean(image), ms: Date.now() - t0, bytes: image?.length ?? 0 };
  } catch (err) {
    results.craiyon = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  // diagnóstico sob demanda do Google Drive: /api/health/tools?drive=<id ou link>
  const drive = new URL(request.url).searchParams.get('drive');
  let driveReport: unknown;
  if (drive) {
    const target = /^https?:/i.test(drive) ? drive : `https://drive.google.com/file/d/${drive}/view`;
    try {
      driveReport = await diagnoseDrive(target);
    } catch (err) {
      driveReport = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json(
    { ok: Object.values(results).every((r) => r.ok), results, ...(drive ? { drive: driveReport } : {}) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
