'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

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
