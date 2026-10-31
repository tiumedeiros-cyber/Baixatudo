import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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
  if (profile?.role !== 'admin') redirect('/dashboard');
  return { user, profile };
}
