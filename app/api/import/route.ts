import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { driveFileId, extensionFor, fetchMedia, listDriveFolder, mediaTypeOf, safeFileName } from '@/lib/import-url';
import { getActiveSubscription } from '@/lib/auth';
import { formatBytes, getQuota } from '@/lib/quota';
import { providerRoom, effectiveFileLimitBytes } from '@/lib/storage-capacity';
import { storeFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/import
 *  { url }            → baixa (Drive/Dropbox/link direto) e guarda em "Meus arquivos"
 *  { url, list:true } → lista os arquivos de uma pasta pública do Drive
 *
 * O download é feito no servidor: funciona no celular, sem CORS e sem
 * estourar a memória do navegador.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta para importar.' }, { status: 401 });

  const limit = rateLimit(`import:${user.id}:${clientIp(request.headers)}`, 15, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos. Aguarde um minuto.' }, { status: 429 });

  let body: { url?: string; list?: boolean; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const url = String(body.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Cole um link válido (começando com https://).' }, { status: 400 });
  }

  if (body.list) {
    const listing = await listDriveFolder(url);
    return NextResponse.json(listing, { status: listing.error ? 422 : 200 });
  }

  const settings = await getSettings();
  const maxBytes = Math.min(effectiveFileLimitBytes(settings), 800 * 1024 * 1024);
  const maxMb = Math.round(maxBytes / (1024 * 1024));

  const admin = createAdminClient();
  const room = await providerRoom(admin, settings, 1024 * 1024);
  if (!room.ok) return NextResponse.json({ error: room.message }, { status: 507 });
  const sub = await getActiveSubscription();
  const quota = await getQuota(admin, user.id, Number(sub?.plans?.limits?.storage_gb ?? 5));
  if (quota.freeBytes < 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: `Sem espaço no plano (${formatBytes(quota.freeBytes)} livres de ${formatBytes(quota.limitBytes)}).` },
      { status: 413 },
    );
  }

  const fetched = await fetchMedia(url, maxBytes);
  if (!fetched.ok) return NextResponse.json({ error: fetched.error }, { status: 422 });

  // tipo detectado pelo conteúdo (PDF/DOCX do Drive vêm como octet-stream)
  const type = fetched.mediaType ?? mediaTypeOf(fetched.contentType, fetched.filename);
  if (!type) return NextResponse.json({ error: 'Formato não suportado.' }, { status: 422 });
  if (fetched.buffer.length > quota.freeBytes) {
    return NextResponse.json(
      { error: `Arquivo de ${formatBytes(fetched.buffer.length)} não cabe: ${formatBytes(quota.freeBytes)} livres no plano.` },
      { status: 413 },
    );
  }

  const base = safeFileName(body.name || fetched.filename).replace(/\.[a-z0-9]{2,5}$/i, '') || 'importado';
  const ext = extensionFor(type, fetched.contentType, fetched.filename);
  const path = `${user.id}/imports/${Date.now()}-${base.slice(0, 50)}.${ext}`;

  const stored = await storeFile(admin, settings, path, fetched.buffer, fetched.contentType || 'application/octet-stream');
  if ('error' in stored) return NextResponse.json({ error: `Não foi possível guardar o arquivo (${stored.error}).` }, { status: 500 });
  const pub = { publicUrl: stored.url };
  const driveId = driveFileId(url);
  const thumbnail = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w800` : null;

  const { data: asset, error: insErr } = await admin
    .from('es_user_assets')
    .insert({
      user_id: user.id,
      name: `${base}.${ext}`,
      type,
      url: pub.publicUrl,
      storage_path: path,
      size_bytes: fetched.buffer.length,
      metadata: { origin: 'import-link', source_url: url, thumbnail },
    })
    .select('id,name,type,url')
    .single();

  if (insErr) return NextResponse.json({ error: `Arquivo salvo, mas o registro falhou: ${insErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, asset, bytes: fetched.buffer.length, name: `${base}.${ext}` });
}
