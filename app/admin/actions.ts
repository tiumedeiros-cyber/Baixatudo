'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { grantTime } from '@/lib/time';

async function admin() {
  await requireAdmin();
  return createAdminClient();
}

export async function setUserStatus(userId: string, status: 'active' | 'blocked') {
  const db = await admin();
  await db.from('es_profiles').update({ status }).eq('id', userId);
  revalidatePath('/admin/usuarios');
}

export async function setUserRole(userId: string, role: 'client' | 'admin') {
  const db = await admin();
  await db.from('es_profiles').update({ role }).eq('id', userId);
  revalidatePath('/admin/usuarios');
}

export async function sendPasswordReset(email: string) {
  const db = await admin();
  const { data } = await db.auth.admin.generateLink({ type: 'recovery', email });
  revalidatePath('/admin/usuarios');
  return { link: data?.properties?.action_link ?? null };
}

export async function grantSubscription(userId: string, planId: string, days: number) {
  const db = await admin();
  const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await db
    .from('es_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['trial', 'active', 'past_due'])
    .maybeSingle();
  if (existing?.id) {
    await db.from('es_subscriptions').update({ plan_id: planId, status: 'active', current_period_end: end, gateway: 'manual' }).eq('id', existing.id);
  } else {
    await db.from('es_subscriptions').insert({ user_id: userId, plan_id: planId, status: 'active', current_period_end: end, gateway: 'manual' });
  }
  revalidatePath('/admin/usuarios');
}

export async function upsertPlan(formData: FormData) {
  const db = await admin();
  const id = String(formData.get('id') || '');
  const payload = {
    name: String(formData.get('name') || ''),
    slug: String(formData.get('slug') || ''),
    price_monthly: Number(formData.get('price_monthly') || 0),
    price_yearly: Number(formData.get('price_yearly') || 0),
    description: String(formData.get('description') || ''),
    features: String(formData.get('features') || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    limits: {
      projects: Number(formData.get('projects') || 5),
      storage_gb: Number(formData.get('storage_gb') || 5),
      max_quality: Number(formData.get('max_quality') || 1080),
      export_4k: Number(formData.get('max_quality') || 1080) >= 2160,
      premium_library: formData.get('premium_library') === 'on',
      tts_minutes: Number(formData.get('tts_minutes') || 30),
      downloads_per_day: Number(formData.get('downloads_per_day') || 20),
      unlimited: formData.get('unlimited') === 'on',
    },
    trial_days: Number(formData.get('trial_days') || 0),
    is_active: formData.get('is_active') === 'on',
    sort_order: Number(formData.get('sort_order') || 0),
  };
  if (id) await db.from('es_plans').update(payload).eq('id', id);
  else await db.from('es_plans').insert(payload);
  revalidatePath('/admin/planos');
  revalidatePath('/');
}

export async function togglePlanActive(id: string, isActive: boolean) {
  const db = await admin();
  await db.from('es_plans').update({ is_active: isActive }).eq('id', id);
  revalidatePath('/admin/planos');
}

export async function setPaymentStatus(id: string, status: 'approved' | 'refunded' | 'pending' | 'refused') {
  const db = await admin();
  const { data: payment } = await db.from('es_payments').update({ status, paid_at: status === 'approved' ? new Date().toISOString() : null }).eq('id', id).select('*').single();
  if (payment && status === 'approved') {
    const { data: plan } = await db.from('es_plans').select('*').eq('id', payment.plan_id).maybeSingle();
    if (plan) {
      const days = 30;
      const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const { data: sub } = await db.from('es_subscriptions').select('id').eq('user_id', payment.user_id).in('status', ['trial', 'active', 'past_due']).maybeSingle();
      if (sub?.id) {
        await db.from('es_subscriptions').update({ plan_id: payment.plan_id, status: 'active', current_period_end: end, gateway: 'manual' }).eq('id', sub.id);
      } else {
        await db.from('es_subscriptions').insert({ user_id: payment.user_id, plan_id: payment.plan_id, status: 'active', current_period_end: end, gateway: 'manual' });
      }
    }
  }
  if (payment && status === 'refunded') {
    await db.from('es_subscriptions').update({ status: 'canceled' }).eq('user_id', payment.user_id).in('status', ['active', 'past_due']);
  }
  revalidatePath('/admin/pagamentos');
  revalidatePath('/dashboard/assinatura');
}

export async function saveAsset(formData: FormData) {
  const db = await admin();
  const id = String(formData.get('id') || '');
  const payload = {
    name: String(formData.get('name') || ''),
    type: String(formData.get('type') || 'image'),
    category: String(formData.get('category') || 'geral'),
    url: String(formData.get('url') || ''),
    premium: formData.get('premium') === 'on',
    tags: String(formData.get('tags') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    is_active: formData.get('is_active') === 'on',
  };
  if (id) await db.from('es_assets').update(payload).eq('id', id);
  else await db.from('es_assets').insert(payload);
  revalidatePath('/admin/biblioteca');
}

export async function deleteAsset(id: string) {
  const db = await admin();
  await db.from('es_assets').delete().eq('id', id);
  revalidatePath('/admin/biblioteca');
}

export async function saveSetting(key: string, value: Record<string, unknown>) {
  const db = await admin();
  await db.from('es_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  revalidatePath('/admin/configuracoes');
}

/* --------------------------- Plano por hora (admin) --------------------------- */

/**
 * Libera tempo de teste/cortesia para um usuário.
 * Tudo é registrado em `es_time_credits` (com `granted_by`) e em `es_audit_logs`.
 */
export async function grantUserTime(formData: FormData) {
  const { user } = await requireAdmin();
  const db = createAdminClient();

  const userId = String(formData.get('userId') || '');
  const hours = Number(formData.get('hours') || 0);
  const note = String(formData.get('note') || '').trim();
  if (!userId || !Number.isFinite(hours) || hours <= 0 || hours > 100) {
    redirect('/admin/horas?erro=horas');
  }

  const { data: target } = await db.from('es_profiles').select('id, email').eq('id', userId).maybeSingle();
  if (!target?.id) redirect('/admin/horas?erro=usuario');

  const balance = await grantTime({
    userId,
    hours,
    kind: note.toLowerCase().includes('bônus') || note.toLowerCase().includes('bonus') ? 'bonus' : 'trial',
    note: note || `Tempo liberado pelo admin (${hours}h)`,
    grantedBy: user!.id,
  });

  await db.from('es_audit_logs').insert({
    user_id: userId,
    actor_email: user!.email,
    action: 'time_granted',
    entity: 'time_credit',
    entity_id: userId,
    meta: { hours, note, remaining_seconds: balance.remaining, by: 'admin' },
  });

  revalidatePath('/admin/horas');
  redirect('/admin/horas?ok=1');
}

/** Libera tempo de teste em lote para todos os clientes sem saldo. */
export async function grantTimeToAll(formData: FormData) {
  const { user } = await requireAdmin();
  const db = createAdminClient();
  const hours = Number(formData.get('hours') || 0);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 10) redirect('/admin/horas?erro=horas');

  const { data: profiles } = await db.from('es_profiles').select('id').eq('role', 'client').limit(500);
  for (const profile of profiles ?? []) {
    await grantTime({
      userId: profile.id,
      hours,
      kind: 'bonus',
      note: `Bônus de ${hours}h liberado para todos`,
      grantedBy: user!.id,
      reference: `lote:${new Date().toISOString().slice(0, 10)}:${hours}`,
    });
  }

  await db.from('es_audit_logs').insert({
    actor_email: user!.email,
    action: 'time_granted_bulk',
    entity: 'time_credit',
    meta: { hours, users: profiles?.length ?? 0 },
  });

  revalidatePath('/admin/horas');
  redirect(`/admin/horas?ok=lote&qtd=${profiles?.length ?? 0}`);
}

/* ----------------------- Configurações da plataforma ----------------------- */

export async function saveGeneralSettings(formData: FormData) {
  await requireAdmin();
  const db = createAdminClient();
  const { getSettingsFresh } = await import('@/lib/settings');
  const current = (await getSettingsFresh()).general;
  const value = {
    site_name: String(formData.get('site_name') || current.site_name).slice(0, 60),
    support_email: String(formData.get('support_email') || '').trim(),
    whatsapp: String(formData.get('whatsapp') || '').trim(),
    support_mode: String(formData.get('support_mode') || 'email'),
    whatsapp_message: String(formData.get('whatsapp_message') || '').slice(0, 300),
    max_upload_mb: Math.min(Math.max(Number(formData.get('max_upload_mb') || current.max_upload_mb), 5), 2048),
    provider_file_limit_mb: Math.min(Math.max(Number(formData.get('provider_file_limit_mb') || current.provider_file_limit_mb), 5), 5120),
    storage_capacity_gb: Math.min(Math.max(Number(formData.get('storage_capacity_gb') || current.storage_capacity_gb), 1), 100000),
  };
  await db.from('es_settings').upsert({ key: 'general', value, updated_at: new Date().toISOString() });
  const { revalidateTag } = await import('next/cache');
  revalidateTag('settings');
  revalidatePath('/');
  revalidatePath('/admin/configuracoes');
}

export async function saveLandingSettings(formData: FormData) {
  await requireAdmin();
  const db = createAdminClient();
  const value = {
    headline: String(formData.get('headline') || '').slice(0, 160),
    subheadline: String(formData.get('subheadline') || '').slice(0, 400),
    cta_label: String(formData.get('cta_label') || 'Criar minha conta').slice(0, 40),
    announcement: String(formData.get('announcement') || '').slice(0, 200),
    show_pricing: formData.get('show_pricing') === 'on',
    show_support: formData.get('show_support') === 'on',
  };
  await db.from('es_settings').upsert({ key: 'landing', value, updated_at: new Date().toISOString() });
  const { revalidateTag } = await import('next/cache');
  revalidateTag('settings');
  revalidatePath('/');
  revalidatePath('/admin/configuracoes');
}

export async function savePaymentSettings(formData: FormData) {
  await requireAdmin();
  const db = createAdminClient();
  const { getSettingsFresh } = await import('@/lib/settings');
  const { encryptSecret } = await import('@/lib/crypto');
  const current = (await getSettingsFresh()).payments;

  const stripeSecretInput = String(formData.get('stripe_secret') || '').trim();
  const mpTokenInput = String(formData.get('mp_token') || '').trim();
  const clearStripe = formData.get('clear_stripe') === 'on';
  const clearMp = formData.get('clear_mp') === 'on';

  const value = {
    mode: String(formData.get('mode') || 'manual'),
    currency: String(formData.get('currency') || 'BRL').slice(0, 8),
    manual_instructions: String(formData.get('manual_instructions') || '').slice(0, 1200),
    pix_key: String(formData.get('pix_key') || '').trim().slice(0, 200),
    pix_holder: String(formData.get('pix_holder') || '').trim().slice(0, 120),
    receipt_whatsapp: String(formData.get('receipt_whatsapp') || '').trim().slice(0, 40),
    stripe_public: String(formData.get('stripe_public') || '').trim().slice(0, 200),
    stripe_secret: clearStripe ? '' : stripeSecretInput ? encryptSecret(stripeSecretInput) : current.stripe_secret,
    mp_public: String(formData.get('mp_public') || '').trim().slice(0, 200),
    mp_token: clearMp ? '' : mpTokenInput ? encryptSecret(mpTokenInput) : current.mp_token,
    diligence_note: String(formData.get('diligence_note') || '').slice(0, 600),
  };
  await db.from('es_settings').upsert({ key: 'payments', value, updated_at: new Date().toISOString() });
  const { revalidateTag } = await import('next/cache');
  revalidateTag('settings');
  revalidatePath('/');
  revalidatePath('/admin/configuracoes');
  revalidatePath('/admin/pagamentos');
}

export async function saveIntegrationSettings(formData: FormData) {
  await requireAdmin();
  const db = createAdminClient();
  const { getSettingsFresh } = await import('@/lib/settings');
  const { encryptSecret } = await import('@/lib/crypto');
  const current = (await getSettingsFresh()).integrations;

  const kieInput = String(formData.get('kie_key') || '').trim();
  const postizInput = String(formData.get('postiz_key') || '').trim();
  const value = {
    kie_key: formData.get('clear_kie') === 'on' ? '' : kieInput ? encryptSecret(kieInput) : current.kie_key,
    postiz_key:
      formData.get('clear_postiz') === 'on' ? '' : postizInput ? encryptSecret(postizInput) : current.postiz_key,
    postiz_tiktok: String(formData.get('postiz_tiktok') || '').trim().slice(0, 120),
    admin_kie_enabled: formData.get('admin_kie_enabled') === 'on',
    admin_postiz_enabled: formData.get('admin_postiz_enabled') === 'on',
    allow_user_kie: formData.get('allow_user_kie') === 'on',
    allow_user_postiz: formData.get('allow_user_postiz') === 'on',
  };
  await db.from('es_settings').upsert({ key: 'integrations', value, updated_at: new Date().toISOString() });
  const { revalidateTag } = await import('next/cache');
  revalidateTag('settings');
  revalidatePath('/admin/configuracoes');
  revalidatePath('/dashboard/animacao');
  revalidatePath('/dashboard/integracoes');
}

/* --------------------- Biblioteca: upload e import por link --------------------- */

function catalogType(contentType: string, name: string): 'video' | 'image' | 'audio' {
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('image/')) return 'image';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio';
  return 'image';
}

/** Upload direto do computador/celular do admin para a biblioteca do sistema. */
export async function uploadCatalogMedia(formData: FormData) {
  const db = await admin();
  const file = formData.get('file');
  if (!(file instanceof File) || !file.size) return;

  const category = String(formData.get('category') || 'geral');
  const tags = String(formData.get('tags') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const type = catalogType(file.type, file.name);
  const { safeFileName } = await import('@/lib/import-url');
  const ext = file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() || (type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'jpg');
  const path = `catalog/${Date.now()}-${safeFileName(file.name).replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 50)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from('media').upload(path, buffer, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) return;

  const { data: pub } = db.storage.from('media').getPublicUrl(path);
  await db.from('es_assets').insert({
    name: file.name.replace(/\.[a-z0-9]{2,5}$/i, ''),
    type,
    category,
    url: pub.publicUrl,
    premium: formData.get('premium') === 'on',
    tags,
    is_active: true,
  });
  revalidatePath('/admin/biblioteca');
  const { revalidateTag } = await import('next/cache');
  revalidateTag('assets');
}

/** Importa um arquivo (ou pasta pública do Drive) para a biblioteca do sistema. */
export async function importCatalogUrl(formData: FormData) {
  const db = await admin();
  const url = String(formData.get('url') || '').trim();
  if (!/^https?:\/\//i.test(url)) return;

  const category = String(formData.get('category') || 'geral');
  const tags = String(formData.get('tags') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const { fetchMedia, listDriveFolder, mediaTypeOf, safeFileName, driveFileId } = await import('@/lib/import-url');

  const targets: string[] = [];
  if (/\/folders\//.test(url)) {
    const listing = await listDriveFolder(url);
    for (const file of listing.files.slice(0, 25)) targets.push(`https://drive.google.com/file/d/${file.id}/view`);
    if (!targets.length) {
      targets.push(url);
    }
  } else {
    targets.push(url);
  }

  for (const target of targets) {
    const fetched = await fetchMedia(target, 300 * 1024 * 1024);
    if (!fetched.ok) continue;
    const type = mediaTypeOf(fetched.contentType, fetched.filename);
    if (!type) continue;
    const ext = fetched.filename.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() || (type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'jpg');
    const base = safeFileName(fetched.filename).replace(/\.[a-z0-9]{2,5}$/i, '');
    const path = `catalog/${Date.now()}-${base.slice(0, 50)}.${ext}`;
    const { error } = await db.storage.from('media').upload(path, fetched.buffer, { contentType: fetched.contentType });
    if (error) continue;
    const { data: pub } = db.storage.from('media').getPublicUrl(path);
    const id = driveFileId(target);
    await db.from('es_assets').insert({
      name: base,
      type,
      category,
      url: pub.publicUrl,
      premium: formData.get('premium') === 'on',
      tags,
      is_active: true,
      metadata: { origin: 'import-url', source_url: target, thumbnail: id ? `https://drive.google.com/thumbnail?id=${id}&sz=w800` : null },
    });
  }

  revalidatePath('/admin/biblioteca');
  const { revalidateTag } = await import('next/cache');
  revalidateTag('assets');
}


/* ------------------------- Manutenção do storage ------------------------- */

/**
 * Remove do bucket `media` os arquivos órfãos (não referenciados por nenhum
 * asset, projeto ou TTS). A lista vem da função `es_storage_orphans`, que só
 * devolve objetos com mais de 2 dias — nada é apagado em uso.
 */
export async function cleanOrphanStorage(): Promise<{ removed: number; bytes: number; error?: string }> {
  const db = await admin();
  try {
    const { data, error } = await db.rpc('es_storage_orphans', { limit_rows: 200, min_age_days: 2 });
    if (error) return { removed: 0, bytes: 0, error: error.message };
    const rows = (data ?? []) as { name: string; size: number }[];
    if (!rows.length) return { removed: 0, bytes: 0 };
    const { error: delErr } = await db.storage.from('media').remove(rows.map((r) => r.name));
    if (delErr) return { removed: 0, bytes: 0, error: delErr.message };
    revalidatePath('/admin/biblioteca');
    return { removed: rows.length, bytes: rows.reduce((acc, r) => acc + Number(r.size || 0), 0) };
  } catch (err) {
    return { removed: 0, bytes: 0, error: err instanceof Error ? err.message : 'erro' };
  }
}
