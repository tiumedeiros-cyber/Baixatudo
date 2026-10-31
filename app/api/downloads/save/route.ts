import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_BYTES = 220 * 1024 * 1024; // 220 MB por arquivo
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

type Item = { url?: string; type?: string; name?: string; thumb?: string };

function extFor(type: string | undefined, name: string | undefined, contentType: string) {
  const fromName = name?.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (type === 'audio') return 'mp3';
  if (type === 'photo') return 'jpg';
  if (type === 'gif') return 'gif';
  if (contentType.includes('audio')) return 'mp3';
  if (contentType.includes('image/png')) return 'png';
  if (contentType.includes('image/')) return 'jpg';
  if (contentType.includes('webm')) return 'webm';
  return 'mp4';
}

function safeName(value: string) {
  return (value || 'arquivo')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[^\w.\-\s]+/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 70) || 'arquivo';
}

async function tryFetch(url: string) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false as const, status: res.status };
    const type = res.headers.get('content-type') ?? '';
    // alguns motores devolvem HTML de erro com 200 — descarta
    if (type.includes('text/html')) return { ok: false as const, status: 200 };
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared && declared > MAX_BYTES) return { ok: false as const, status: 413, tooBig: true as const };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return { ok: false as const, status: 0 };
    if (buf.length > MAX_BYTES) return { ok: false as const, status: 413, tooBig: true as const };
    return { ok: true as const, buffer: buf, contentType: type };
  } catch {
    return { ok: false as const, status: 0 };
  }
}

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
    .select('id,user_id,result,service,media_type')
    .eq('id', id)
    .maybeSingle();

  if (!record || record.user_id !== user.id) {
    return NextResponse.json({ error: 'Download não encontrado.' }, { status: 404 });
  }

  const result = (record.result ?? {}) as {
    items?: Item[];
    tunnel?: string[];
    saved?: { index: number; url: string }[];
  };
  const items = Array.isArray(result.items) ? result.items : [];
  const item = items[index];
  if (!item?.url) return NextResponse.json({ error: 'Esse item não tem arquivo para salvar.' }, { status: 422 });

  // candidatos: o próprio item e os túneis do motor (funcionam de qualquer IP)
  const candidates = [item.url, ...(Array.isArray(result.tunnel) ? result.tunnel : [])].filter(Boolean) as string[];
  let fetched: Awaited<ReturnType<typeof tryFetch>> | null = null;
  let tooBig = false;
  for (const candidate of candidates) {
    fetched = await tryFetch(candidate);
    if (fetched.ok) break;
    if ('tooBig' in fetched && fetched.tooBig) tooBig = true;
  }

  if (!fetched || !fetched.ok) {
    const message = tooBig
      ? 'Arquivo maior que 220 MB — baixe no dispositivo e envie em “Meus arquivos”.'
      : 'O servidor da origem não liberou o arquivo. Tente novamente em instantes ou use “Baixar” no dispositivo.';
    await admin.from('es_downloads').update({ status: 'error', result: { ...result, save_error: message } }).eq('id', id);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const type = item.type === 'audio' ? 'audio' : item.type === 'photo' || item.type === 'gif' ? 'image' : 'video';
  const ext = extFor(item.type, item.name, fetched.contentType);
  const base = safeName(item.name || `${record.service ?? 'baixa-tudo'}-${index + 1}`).replace(/\.[a-z0-9]{2,5}$/i, '');
  const path = `${user.id}/downloads/${Date.now()}-${base}.${ext}`;

  const { error: upErr } = await admin.storage.from('media').upload(path, fetched.buffer, {
    contentType: fetched.contentType && !fetched.contentType.includes('octet-stream') ? fetched.contentType : item.type === 'audio' ? 'audio/mpeg' : 'video/mp4',
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json(
      { error: `Não foi possível guardar o arquivo (${upErr.message}).` },
      { status: 500 },
    );
  }

  const { data: pub } = admin.storage.from('media').getPublicUrl(path);
  const { data: asset, error: insErr } = await admin
    .from('es_user_assets')
    .insert({
      user_id: user.id,
      name: `${base}.${ext}`,
      type,
      url: pub.publicUrl,
      storage_path: path,
      size_bytes: fetched.buffer.length,
      metadata: { origin: record.service ?? 'baixa-tudo', download_id: id, source_type: item.type ?? 'video' },
    })
    .select('id,name,type,url')
    .single();

  if (insErr) {
    return NextResponse.json({ error: `Arquivo salvo, mas o registro falhou: ${insErr.message}` }, { status: 500 });
  }

  const saved = Array.isArray(result.saved) ? result.saved.filter((s) => s.index !== index) : [];
  saved.push({ index, url: pub.publicUrl });
  await admin.from('es_downloads').update({ result: { ...result, saved } }).eq('id', id);

  return NextResponse.json({
    ok: true,
    asset,
    size_bytes: fetched.buffer.length,
    path,
    url: pub.publicUrl,
  });
}
