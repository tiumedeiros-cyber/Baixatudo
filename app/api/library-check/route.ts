import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIBRARY = [
  'bg-marketplace.webp',
  'bg-flashsale.webp',
  'bg-delivery.webp',
  'bg-podium.webp',
  'bg-blackfriday.webp',
  'bg-gradientmesh.webp',
];

/** Fundos fotorrealistas dos avatares (usados no desenho e na exportação). */
const SCENES = ['estudio', 'escritorio', 'praia', 'cidade', 'neon', 'sala', 'podcast', 'floresta'];

const FILES = [
  ...LIBRARY.map((f) => ({ path: `/library/${f}`, key: f, min: 1000 })),
  ...SCENES.map((s) => ({ path: `/scenes/${s}.jpg`, key: `scenes/${s}.jpg`, min: 5000 })),
];

/** Confere, em produção, se os fundos da biblioteca estão sendo servidos pelo site. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const results: Record<string, { status: number; bytes: number; type: string }> = {};
  await Promise.all(
    FILES.map(async (file) => {
      try {
        const res = await fetch(`${origin}${file.path}`, { cache: 'no-store' });
        const buf = Buffer.from(await res.arrayBuffer());
        results[file.key] = { status: res.status, bytes: buf.length, type: res.headers.get('content-type') ?? '' };
      } catch (err) {
        results[file.key] = { status: 0, bytes: 0, type: err instanceof Error ? err.message : 'erro' };
      }
    }),
  );
  const ok = FILES.every((f) => results[f.key]?.status === 200 && results[f.key].bytes > f.min);
  return NextResponse.json({ ok, results }, { headers: { 'cache-control': 'no-store' } });
}
