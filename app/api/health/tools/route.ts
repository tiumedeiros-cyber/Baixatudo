import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { isAllowedFreeUrl } from '@/lib/free-media';
import { craiyon } from '@/lib/craiyon';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/health/tools — testa de verdade as ferramentas do servidor
 * (QR Code e proxy de mídia grátis) e devolve o erro real quando falham.
 */
export async function GET() {
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

  t0 = Date.now();
  try {
    const image = await craiyon('red apple');
    results.craiyon = { ok: Boolean(image), ms: Date.now() - t0, bytes: image?.length ?? 0 };
  } catch (err) {
    results.craiyon = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  return NextResponse.json(
    { ok: Object.values(results).every((r) => r.ok), results },
    { headers: { 'cache-control': 'no-store' } },
  );
}
