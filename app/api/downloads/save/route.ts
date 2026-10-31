import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { saveDownloadToLibrary, type MediaItem } from '@/lib/download-save';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/downloads/save — guarda no storage e na biblioteca do usuário o
 * arquivo apontado por um item do histórico do Baixa Tudo.
 *
 * Feito no servidor: sem CORS, sem estourar a memória do celular e sem
 * depender das permissões do navegador.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Faça login para salvar na biblioteca.' }, { status: 401 });

  const limit = rateLimit(`dlsave:${user.id}:${clientIp(request.headers)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos. Aguarde um minuto.' }, { status: 429 });

  let body: { id?: string; index?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const id = String(body.id ?? '');
  const index = Number.isFinite(body.index) ? Number(body.index) : 0;
  if (!id) return NextResponse.json({ error: 'Download não informado.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: record } = await admin
    .from('es_downloads')
    .select('id,user_id,result,service,media_type,source_url')
    .eq('id', id)
    .maybeSingle();

  if (!record || record.user_id !== user.id) {
    return NextResponse.json({ error: 'Download não encontrado.' }, { status: 404 });
  }

  const result = (record.result ?? {}) as {
    items?: MediaItem[];
    tunnel?: string[];
    saved?: { index: number; url: string }[];
  };
  const items = Array.isArray(result.items) ? result.items : [];
  const item = items[index];
  if (!item?.url) return NextResponse.json({ error: 'Esse item não tem arquivo para salvar.' }, { status: 422 });

  const outcome = await saveDownloadToLibrary({
    admin,
    userId: user.id,
    item,
    tunnels: Array.isArray(result.tunnel) ? result.tunnel : [],
    service: record.service,
    downloadId: id,
    sourceUrl: (record as { source_url?: string | null }).source_url ?? null,
  });

  if (!outcome.ok) {
    await admin
      .from('es_downloads')
      .update({ status: 'error', result: { ...result, save_error: outcome.error } })
      .eq('id', id);
    return NextResponse.json({ error: outcome.error }, { status: outcome.tooBig ? 413 : 502 });
  }

  const saved = Array.isArray(result.saved) ? result.saved.filter((s) => s.index !== index) : [];
  saved.push({ index, url: outcome.url });
  await admin.from('es_downloads').update({ result: { ...result, saved } }).eq('id', id);

  return NextResponse.json({
    ok: true,
    asset: outcome.asset,
    size_bytes: outcome.bytes,
    path: outcome.path,
    url: outcome.url,
  });
}
