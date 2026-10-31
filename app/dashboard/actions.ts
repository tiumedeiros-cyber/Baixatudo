'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveSubscription, getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TimelineData } from '@/lib/types';

const NEW_TIMELINE: TimelineData = {
  tracks: [
    { id: 'v1', name: 'Vídeo 1', kind: 'visual', muted: false, hidden: false },
    { id: 't1', name: 'Texto', kind: 'visual', muted: false, hidden: false },
    { id: 'a1', name: 'Áudio 1', kind: 'audio', muted: false, hidden: false },
  ],
  clips: [],
};

export async function createProject(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const name = String(formData.get('name') || '').trim() || 'Novo projeto';
  const ratio = String(formData.get('ratio') || '16:9');
  const type = (String(formData.get('type') || 'video') as 'video' | 'image') || 'video';
  const sizes: Record<string, [number, number]> = {
    '16:9': [1920, 1080],
    '9:16': [1080, 1920],
    '1:1': [1080, 1080],
    '4:5': [1080, 1350],
    '4:3': [1440, 1080],
  };
  const [width, height] = sizes[ratio] ?? sizes['16:9'];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('es_projects')
    .insert({ user_id: user.id, name, type, width, height, timeline: NEW_TIMELINE })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/projetos');
  redirect(`/studio/${data.id}`);
}

export async function duplicateProject(id: string) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from('es_projects').select('*').eq('id', id).single();
  if (!project) return;
  const { data } = await supabase
    .from('es_projects')
    .insert({
      user_id: user.id,
      name: `${project.name} (cópia)`,
      type: project.type,
      width: project.width,
      height: project.height,
      fps: project.fps,
      duration: project.duration,
      timeline: project.timeline,
      thumb_url: project.thumb_url,
    })
    .select('id')
    .single();
  revalidatePath('/dashboard/projetos');
  if (data?.id) redirect(`/studio/${data.id}`);
}

export async function deleteProject(id: string) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const supabase = await createSupabaseServerClient();
  await supabase.from('es_projects').delete().eq('id', id);
  revalidatePath('/dashboard/projetos');
}

export async function renameProject(id: string, name: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from('es_projects').update({ name }).eq('id', id);
  revalidatePath('/dashboard/projetos');
}

export async function deleteUserAsset(id: string, storagePath?: string | null) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();

  // confirma que o arquivo é do usuário antes de apagar (nada de IDOR)
  const { data: asset } = await admin
    .from('es_user_assets')
    .select('id,user_id,storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!asset || asset.user_id !== user.id) return;

  // apaga o binário do storage e a linha — o contador de cota volta pelo trigger
  const path = asset.storage_path || storagePath;
  if (path) await admin.storage.from('media').remove([path]);
  await admin.from('es_user_assets').delete().eq('id', id);
  revalidatePath('/dashboard/arquivos');
}

/**
 * Fallback de upload: envia pelo servidor (service role) quando o upload direto
 * para o Storage falha no navegador (ex.: rede móvel instável, política de RLS).
 * Aceita arquivos até 25 MB.
 */
export async function uploadUserAssetFallback(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Arquivo inválido.' };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: 'Arquivo acima de 25 MB — tente novamente com conexão estável.' };

  const admin = createAdminClient();

  // cota do plano: checagem no servidor (o cliente pode mentir)
  const { getActiveSubscription } = await import('@/lib/auth');
  const { getQuota, formatBytes } = await import('@/lib/quota');
  const sub = await getActiveSubscription();
  const planGb = Number(sub?.plans?.limits?.storage_gb ?? 5);
  const quota = await getQuota(admin, user.id, planGb);
  if (file.size > quota.freeBytes) {
    return {
      ok: false,
      error: `Sem espaço no plano (${formatBytes(quota.freeBytes)} livres de ${formatBytes(quota.limitBytes)}). Apague arquivos ou faça upgrade.`,
    };
  }

  const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image';
  const safe = (file.name || 'arquivo').replace(/[^\w.\-]+/g, '_');
  const path = `${user.id}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage
    .from('media')
    .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) return { ok: false, error: error.message };

  const { data: pub } = admin.storage.from('media').getPublicUrl(path);
  const { error: insErr } = await admin.from('es_user_assets').insert({
    user_id: user.id,
    name: file.name || safe,
    type,
    url: pub.publicUrl,
    storage_path: path,
    size_bytes: file.size,
    metadata: {},
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath('/dashboard/arquivos');
  return { ok: true };
}

export async function updateProfile(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const fullName = String(formData.get('full_name') || '').trim();
  const supabase = await createSupabaseServerClient();
  await supabase.from('es_profiles').update({ full_name: fullName }).eq('id', user.id);
  revalidatePath('/dashboard/perfil');
  revalidatePath('/dashboard');
}

export async function cancelSubscription() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const supabase = await createSupabaseServerClient();
  await supabase
    .from('es_subscriptions')
    .update({ cancel_at_period_end: true })
    .eq('user_id', user.id)
    .in('status', ['trial', 'active', 'past_due']);
  revalidatePath('/dashboard/assinatura');
}

export async function reactivateSubscription() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const supabase = await createSupabaseServerClient();
  await supabase
    .from('es_subscriptions')
    .update({ cancel_at_period_end: false })
    .eq('user_id', user.id)
    .in('status', ['trial', 'active']);
  revalidatePath('/dashboard/assinatura');
}

export async function createSupportTicket(formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;
  const message = String(formData.get('message') || '').slice(0, 4000);
  const subject = String(formData.get('subject') || 'Suporte').slice(0, 140);
  const admin = createAdminClient();
  await admin.from('es_audit_logs').insert({
    user_id: user.id,
    actor_email: user.email,
    action: 'support_ticket',
    entity: 'support',
    meta: { subject, message },
  });
  revalidatePath('/dashboard/suporte');
}

export async function changePassword(formData: FormData) {
  const password = String(formData.get('password') || '');
  if (password.length < 6) return;
  const supabase = await createSupabaseServerClient();
  await supabase.auth.updateUser({ password });
  revalidatePath('/dashboard/perfil');
}

export async function saveProjectThumb(projectId: string, thumbDataUrl: string) {
  const user = await getSessionUser();
  if (!user) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from('es_projects').update({ thumb_url: thumbDataUrl.slice(0, 500_000) }).eq('id', projectId);
}

export async function planLimits() {
  const sub = await getActiveSubscription();
  return sub?.plans?.limits ?? null;
}
