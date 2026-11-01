import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSessionUser, getActiveSubscription } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSettings } from '@/lib/settings';
import { storageS3Config } from '@/lib/storage';
import { s3PublicUrl } from '@/lib/s3';
import { getQuota, formatBytes } from '@/lib/quota';

export const runtime = 'nodejs';

/**
 * POST /api/upload/complete
 * { path, name, size, type, contentType } → registra o arquivo já enviado ao bucket.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  let body: { path?: string; name?: string; size?: number; type?: string; contentType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const path = String(body.path || '');
  // nada de gravar em pasta de outro usuário
  if (!path.startsWith(`${user.id}/`)) return NextResponse.json({ error: 'Caminho inválido.' }, { status: 400 });

  const settings = await getSettings();
  const config = storageS3Config(settings);
  if (!config) return NextResponse.json({ error: 'Storage externo não está ligado.' }, { status: 400 });

  const size = Math.max(0, Number(body.size || 0));
  const admin = createAdminClient();
  const sub = await getActiveSubscription();
  const quota = await getQuota(admin, user.id, Number(sub?.plans?.limits?.storage_gb ?? 5));
  if (size > quota.freeBytes) {
    return NextResponse.json({ error: `Sem espaço no plano (${formatBytes(quota.freeBytes)} livres).` }, { status: 413 });
  }

  const contentType = String(body.contentType || '');
  const type: 'video' | 'image' | 'audio' = contentType.startsWith('video')
    ? 'video'
    : contentType.startsWith('audio')
      ? 'audio'
      : 'image';

  const { data: asset, error } = await admin
    .from('es_user_assets')
    .insert({
      user_id: user.id,
      name: body.name || path.split('/').pop() || 'arquivo',
      type: body.type === 'audio' || body.type === 'video' ? body.type : type,
      url: s3PublicUrl(config, path),
      storage_path: path,
      size_bytes: size,
      metadata: { storage: 's3' },
    })
    .select('id,name,type,url')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/dashboard/arquivos');
  return NextResponse.json({ ok: true, asset });
}
