import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILES = [
  'bg-marketplace.webp',
  'bg-flashsale.webp',
  'bg-delivery.webp',
  'bg-podium.webp',
  'bg-blackfriday.webp',
  'bg-gradientmesh.webp',
];

/** Confere, em produção, se os fundos da biblioteca estão sendo servidos pelo site. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const results: Record<string, { status: number; bytes: number; type: string }> = {};
  await Promise.all(
    FILES.map(async (file) => {
      try {
        const res = await fetch(`${origin}/library/${file}`, { cache: 'no-store' });
        const buf = Buffer.from(await res.arrayBuffer());
        results[file] = { status: res.status, bytes: buf.length, type: res.headers.get('content-type') ?? '' };
      } catch (err) {
        results[file] = { status: 0, bytes: 0, type: err instanceof Error ? err.message : 'erro' };
      }
    }),
  );
  const ok = FILES.every((f) => results[f]?.status === 200 && results[f].bytes > 1000);
  return NextResponse.json({ ok, results }, { headers: { 'cache-control': 'no-store' } });
}
