import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { detectService, isSupportedUrl, proxyUrl, requestDownload } from '@/lib/downloader';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Faça login para baixar.' }, { status: 401 });

  const ip = clientIp(request.headers);
  const limit = rateLimit(`dl:${user.id}:${ip}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'Muitos downloads em pouco tempo. Aguarde um minuto.' }, { status: 429 });
  }

  let payload: { url?: string; audio?: boolean; quality?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const url = String(payload.url || '').trim();
  if (!url || url.length > 2048 || !isSupportedUrl(url)) {
    return NextResponse.json({ error: 'Informe um link válido começando com http:// ou https://' }, { status: 400 });
  }

  const result = await requestDownload(url, { audio: Boolean(payload.audio), quality: payload.quality });
  const service = detectService(url);
  const admin = createAdminClient();

  if (!result.ok) {
    await admin.from('es_downloads').insert({
      user_id: user.id,
      source_url: url,
      service,
      media_type: payload.audio ? 'audio' : 'video',
      status: 'error',
      result: { error: result.error },
    });
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  const items = result.items.map((item, index) => {
    const fallbackName = `${result.filename || 'baixa-tudo'}-${index + 1}`;
    const name = item.name || fallbackName;
    return {
      ...item,
      name,
      downloadUrl: proxyUrl(item.url, name, item.type),
    };
  });

  if (items.length === 0) {
    return NextResponse.json({ error: 'O motor não retornou arquivos para esse link.' }, { status: 422 });
  }

  const { data } = await admin
    .from('es_downloads')
    .insert({
      user_id: user.id,
      source_url: url,
      service,
      media_type: payload.audio ? 'audio' : 'video',
      status: 'ready',
      result: { status: result.status, filename: result.filename, items: items.map(({ downloadUrl, ...rest }) => rest) },
    })
    .select('id')
    .single();

  return NextResponse.json({
    id: data?.id,
    status: result.status,
    filename: result.filename,
    service,
    items,
  });
}
