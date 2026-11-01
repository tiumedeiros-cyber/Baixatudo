import { NextResponse } from 'next/server';
import { getSessionUser, getActiveSubscription } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { formatBytes, getQuota } from '@/lib/quota';
import { providerRoom, effectiveFileLimitBytes } from '@/lib/storage-capacity';
import {
  archiveAudioFile,
  isAllowedFreeUrl,
  qrUrl,
  searchArchive,
  searchCommons,
  searchIcons,
} from '@/lib/free-media';

export const runtime = 'nodejs';

/** GET /api/free?check=fundo — diagnóstico público das fontes abertas (sem login). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('check') || 'fundo').slice(0, 60);
  const limit = rateLimit(`free-check:${clientIp(request.headers)}`, 12, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos.' }, { status: 429 });
  const [images, audio, icons] = await Promise.all([
    searchCommons(q, 3),
    searchArchive(q, 3),
    searchIcons(q, 3),
  ]);
  return NextResponse.json({
    ok: true,
    query: q,
    sources: {
      wikimedia: { ok: images.length > 0, itens: images.length, exemplo: images[0]?.url ?? '' },
      archive: { ok: audio.length > 0, itens: audio.length, exemplo: audio[0]?.thumb ?? '' },
      iconify: { ok: icons.length > 0, itens: icons.length, exemplo: icons[0]?.url ?? '' },
    },
  });
}
export const maxDuration = 120;

/**
 * POST /api/free
 *  { action: 'search', source: 'images'|'audio'|'icons', q }
 *  { action: 'save', url, name, kind, archiveId? } → baixa e guarda em Meus arquivos
 *  { action: 'qr', text, name? }
 *
 * Tudo com fontes gratuitas e sem chave: Wikimedia Commons, Internet Archive,
 * Iconify, Pollinations e QR Server.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`free:${user.id}:${clientIp(request.headers)}`, 40, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos. Aguarde um minuto.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const action = String(body.action ?? 'search');

  if (action === 'search') {
    const q = String(body.q ?? '').trim().slice(0, 120);
    if (!q) return NextResponse.json({ error: 'Digite o que você procura.' }, { status: 400 });
    const source = String(body.source ?? 'images');
    const items =
      source === 'audio' ? await searchArchive(q) : source === 'icons' ? await searchIcons(q) : await searchCommons(q);
    if (!items.length) {
      return NextResponse.json({
        ok: true,
        items: [],
        warning: 'Nenhum resultado nessa fonte agora. Tente outra palavra ou outra aba.',
      });
    }
    return NextResponse.json({ ok: true, items });
  }

  if (action === 'qr') {
    const text = String(body.text ?? '').trim();
    if (!text) return NextResponse.json({ error: 'Cole o link ou texto do QR Code.' }, { status: 400 });
    const saved = await saveToLibrary(user.id, qrUrl(text), String(body.name || 'qr-code'), 'image');
    return NextResponse.json(saved, { status: saved.error ? 422 : 200 });
  }

  if (action === 'save') {
    let url = String(body.url ?? '').trim();
    const kind = String(body.kind ?? 'image') as 'image' | 'audio' | 'video' | 'icon';
    const name = String(body.name ?? 'arquivo-gratis').slice(0, 80);
    const archiveId = String(body.archiveId ?? '').trim();

    if (archiveId && url.includes('/download/')) {
      const file = await archiveAudioFile(archiveId);
      if (!file) return NextResponse.json({ error: 'Esse item do Archive não tem áudio disponível para download.' }, { status: 422 });
      url = file;
    }
    if (!isAllowedFreeUrl(url)) {
      return NextResponse.json({ error: 'Endereço não permitido para esta fonte.' }, { status: 400 });
    }
    const saved = await saveToLibrary(user.id, url, name, kind);
    return NextResponse.json(saved, { status: saved.error ? 422 : 200 });
  }

  return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

async function saveToLibrary(userId: string, url: string, rawName: string, kind: string) {
  const admin = createAdminClient();
  const settings = await getSettings();
  const sub = await getActiveSubscription();
  const planGb = Number(sub?.plans?.limits?.storage_gb ?? 5);
  const quota = await getQuota(admin, userId, planGb);
  if (quota.freeBytes <= 0) {
    return { error: `Seu plano está cheio (${formatBytes(quota.usedBytes)} de ${formatBytes(quota.limitBytes)}).` };
  }

  const maxBytes = Math.min(effectiveFileLimitBytes(settings), quota.freeBytes, 60 * 1024 * 1024);
  const room = await providerRoom(admin, settings, 1024 * 1024);
  if (!room.ok) return { error: room.message };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'EditorStudio/1.0', Accept: 'image/*,audio/*,video/*,*/*' },
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } catch {
    return { error: 'Não foi possível baixar o arquivo agora. Tente outro item.' };
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return { error: `A fonte respondeu ${res.status}. Tente outro item.` };

  const declared = Number(res.headers.get('content-length') || 0);
  if (declared && declared > maxBytes) {
    return { error: `Arquivo de ${formatBytes(declared)} acima do limite de ${formatBytes(maxBytes)} do seu plano/provedor.` };
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) return { error: 'A fonte devolveu um arquivo vazio.' };
  if (buffer.length > maxBytes) {
    return { error: `Arquivo de ${formatBytes(buffer.length)} acima do limite de ${formatBytes(maxBytes)}.` };
  }

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = MIME_EXT[contentType] || (kind === 'audio' ? 'mp3' : kind === 'icon' ? 'svg' : 'jpg');
  const assetType: 'video' | 'image' | 'audio' =
    contentType.startsWith('audio/') || kind === 'audio'
      ? 'audio'
      : contentType.startsWith('video/')
        ? 'video'
        : 'image';
  const safeName = rawName.replace(/[^\p{L}\p{N}\-_. ]/gu, '').trim().slice(0, 60) || 'arquivo-gratis';
  const path = `${userId}/livre/${Date.now()}-${safeName.replace(/\s+/g, '-').toLowerCase()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from('media')
    .upload(path, buffer, { contentType: contentType || 'application/octet-stream', upsert: false });
  if (upErr) return { error: `Falha ao guardar o arquivo (${upErr.message}).` };

  const { data: pub } = admin.storage.from('media').getPublicUrl(path);
  const { error: dbErr } = await admin.from('es_user_assets').insert({
    user_id: userId,
    name: `${safeName}.${ext}`,
    type: assetType,
    url: pub.publicUrl,
    storage_path: path,
    size_bytes: buffer.length,
    metadata: { source: 'free-media', source_url: url, license_note: 'Conteúdo de biblioteca aberta/IA gratuita' },
  });
  if (dbErr) {
    await admin.storage.from('media').remove([path]);
    return { error: `Falha ao registrar o arquivo (${dbErr.message}).` };
  }

  return { ok: true, url: pub.publicUrl, bytes: buffer.length, type: assetType };
}
