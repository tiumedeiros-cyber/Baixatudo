import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Baixa o arquivo de um item do Baixa Tudo e guarda na biblioteca do usuário.
 *
 * Roda sempre no servidor da Vercel: sem CORS, sem `blob()` no celular e sem
 * depender das permissões do navegador. Usado por `/api/downloads/save` e pelo
 * autoteste `/api/downloads/selftest`.
 */
export const MAX_BYTES = 220 * 1024 * 1024; // 220 MB por arquivo

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export type MediaItem = { url?: string; type?: string; name?: string; thumb?: string };

/** Capa real do vídeo quando a origem é o YouTube (imagem pública, sem marca d'água). */
export function thumbnailFor(sourceUrl?: string | null, itemThumb?: string | null) {
  if (itemThumb) return itemThumb;
  const url = sourceUrl ?? '';
  const id =
    url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/)?.[1] ?? null;
  if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return null;
}

export type SaveOutcome =
  | { ok: true; asset: { id: string; name: string; type: string; url: string }; url: string; path: string; bytes: number }
  | { ok: false; error: string; tooBig?: boolean };

export function extFor(type: string | undefined, name: string | undefined, contentType: string) {
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

export function safeName(value: string) {
  return (
    (value || 'arquivo')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/[^\w.\-\s]+/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 70) || 'arquivo'
  );
}

async function tryFetch(url: string, maxBytes = MAX_BYTES) {
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
    if (declared && declared > maxBytes) return { ok: false as const, status: 413, tooBig: true as const };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return { ok: false as const, status: 0 };
    if (buf.length > maxBytes) return { ok: false as const, status: 413, tooBig: true as const };
    return { ok: true as const, buffer: buf, contentType: type };
  } catch {
    return { ok: false as const, status: 0 };
  }
}

export async function saveDownloadToLibrary(opts: {
  admin: SupabaseClient;
  userId: string;
  item: MediaItem;
  tunnels?: string[];
  service?: string | null;
  downloadId?: string;
  sourceUrl?: string | null;
  maxBytes?: number;
}): Promise<SaveOutcome> {
  const { admin, userId, item, service, downloadId } = opts;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  if (!item?.url) return { ok: false, error: 'Esse item não tem arquivo para salvar.' };

  // candidatos: o próprio item e os túneis do motor (funcionam de qualquer IP)
  const candidates = [item.url, ...(opts.tunnels ?? [])].filter(Boolean) as string[];
  let fetched: Awaited<ReturnType<typeof tryFetch>> | null = null;
  let tooBig = false;
  for (const candidate of candidates) {
    fetched = await tryFetch(candidate, maxBytes);
    if (fetched.ok) break;
    if ('tooBig' in fetched && fetched.tooBig) tooBig = true;
  }

  if (!fetched || !fetched.ok) {
    return {
      ok: false,
      tooBig,
      error: tooBig
        ? 'Arquivo maior que 220 MB — baixe no dispositivo e envie em “Meus arquivos”.'
        : 'O servidor da origem não liberou o arquivo. Tente novamente em instantes ou use “Baixar” no dispositivo.',
    };
  }

  const type = item.type === 'audio' ? 'audio' : item.type === 'photo' || item.type === 'gif' ? 'image' : 'video';
  const ext = extFor(item.type, item.name, fetched.contentType);
  const base = safeName(item.name || `${service ?? 'baixa-tudo'}-${Date.now()}`).replace(/\.[a-z0-9]{2,5}$/i, '');
  const path = `${userId}/downloads/${Date.now()}-${base}.${ext}`;

  const { error: upErr } = await admin.storage.from('media').upload(path, fetched.buffer, {
    contentType:
      fetched.contentType && !fetched.contentType.includes('octet-stream')
        ? fetched.contentType
        : item.type === 'audio'
          ? 'audio/mpeg'
          : 'video/mp4',
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Não foi possível guardar o arquivo (${upErr.message}).` };

  const { data: pub } = admin.storage.from('media').getPublicUrl(path);
  const { data: asset, error: insErr } = await admin
    .from('es_user_assets')
    .insert({
      user_id: userId,
      name: `${base}.${ext}`,
      type,
      url: pub.publicUrl,
      storage_path: path,
      size_bytes: fetched.buffer.length,
      metadata: {
        origin: service ?? 'baixa-tudo',
        download_id: downloadId ?? null,
        source_type: item.type ?? 'video',
        thumbnail: thumbnailFor(opts.sourceUrl, item.thumb),
        source_url: opts.sourceUrl ?? null,
      },
    })
    .select('id,name,type,url')
    .single();

  if (insErr) return { ok: false, error: `Arquivo salvo, mas o registro falhou: ${insErr.message}` };

  return {
    ok: true,
    asset: asset as { id: string; name: string; type: string; url: string },
    url: pub.publicUrl,
    path,
    bytes: fetched.buffer.length,
  };
}
