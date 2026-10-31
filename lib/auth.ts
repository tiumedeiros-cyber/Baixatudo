import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Plan, Profile, Subscription } from '@/lib/types';

export const getSessionUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('es_profiles').select('*').eq('id', user.id).maybeSingle();
  return (data as Profile) ?? null;
});

/**
 * O e-mail definido em ADMIN_EMAIL é administrador por definição — não depende
 * da linha em `es_profiles` existir ou estar com `role` correto. Era isso que
 * barrava o acesso ao painel quando o perfil não era criado no cadastro.
 */
export function isAdminEmail(email?: string | null) {
  const admin = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const value = (email || '').toLowerCase().trim();
  return Boolean(admin) && Boolean(value) && admin === value;
}

/** Garante que o perfil do usuário exista e, se for o admin do ambiente, com role admin. */
export async function ensureProfile(user: { id: string; email?: string | null }) {
  const admin = createAdminClient();
  const { data: existing } = await admin.from('es_profiles').select('*').eq('id', user.id).maybeSingle();
  const shouldBeAdmin = isAdminEmail(user.email);
  if (!existing) {
    const { data } = await admin
      .from('es_profiles')
      .insert({
        id: user.id,
        email: user.email ?? null,
        full_name: user.email?.split('@')[0] ?? null,
        role: shouldBeAdmin ? 'admin' : 'client',
        status: 'active',
      })
      .select('*')
      .maybeSingle();
    return (data as Profile) ?? null;
  }
  if (shouldBeAdmin && existing.role !== 'admin') {
    const { data } = await admin.from('es_profiles').update({ role: 'admin', status: 'active' }).eq('id', user.id).select('*').maybeSingle();
    return (data as Profile) ?? (existing as Profile);
  }
  return existing as Profile;
}

export const isAdmin = cache(async () => {
  const user = await getSessionUser();
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;
  const profile = await getCurrentProfile();
  return profile?.role === 'admin';
});

export const getActiveSubscription = cache(async (): Promise<(Subscription & { plans: Plan | null }) | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('es_subscriptions')
    .select('*, plans:es_plans(*)')
    .eq('user_id', user.id)
    .in('status', ['trial', 'active', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as (Subscription & { plans: Plan | null }) | null) ?? null;
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const profile = await getCurrentProfile();
  if (profile?.status === 'blocked') redirect('/bloqueado');
  return { user, profile };
}

export async function requireAdmin() {
  const { user, profile } = await requireUser();
  if (isAdminEmail(user?.email)) return { user, profile: profile ?? (user ? await ensureProfile(user) : null) };
  if (profile?.role !== 'admin') redirect('/dashboard?semPermissao=1');
  return { user, profile };
}
