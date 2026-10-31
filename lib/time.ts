import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { findHourPack, formatDuration, HOUR_PACKS, type HourPack } from '@/lib/hour-packs';

export { HOUR_PACKS, findHourPack, formatDuration };
export type { HourPack };

/**
 * Plano por hora (créditos de tempo de edição).
 *
 * Regras de negócio:
 * - Assinaturas ativas/trial liberam o editor sem consumir créditos.
 * - Sem assinatura, o editor funciona enquanto houver saldo em `es_time_credits`.
 * - O consumo é feito no servidor, em `es_consume_time`, com trava por usuário e
 *   limite de tempo decorrido (evita inflar/duplicar tempo com várias abas).
 */

export type TimeBalance = {
  total: number;
  used: number;
  remaining: number;
};

const EMPTY: TimeBalance = { total: 0, used: 0, remaining: 0 };

/** Saldo somado de todos os lotes de créditos do usuário. */
export async function getTimeBalance(userId: string): Promise<TimeBalance> {
  if (!userId) return EMPTY;
  try {
    const db = createAdminClient();
    const { data } = await db.from('es_time_credits').select('seconds_total, seconds_used').eq('user_id', userId);
    if (!data?.length) return EMPTY;
    const total = data.reduce((acc, row) => acc + Number(row.seconds_total || 0), 0);
    const used = data.reduce((acc, row) => acc + Number(row.seconds_used || 0), 0);
    return { total, used, remaining: Math.max(0, total - used) };
  } catch {
    return EMPTY;
  }
}

/** Libera tempo (admin → cliente). `grantedBy` fica registrado para auditoria. */
export async function grantTime(opts: {
  userId: string;
  hours: number;
  kind?: 'trial' | 'purchase' | 'bonus';
  note?: string | null;
  grantedBy?: string | null;
  /** idempotência: não duplica o mesmo pagamento/referência */
  reference?: string | null;
}): Promise<TimeBalance> {
  const db = createAdminClient();
  const seconds = Math.max(60, Math.round(opts.hours * 3600));
  const note = opts.reference ? `${opts.note ?? ''} [${opts.reference}]`.trim() : opts.note ?? null;

  if (opts.reference) {
    const { data: existing } = await db
      .from('es_time_credits')
      .select('id')
      .eq('user_id', opts.userId)
      .ilike('note', `%[${opts.reference}]%`)
      .maybeSingle();
    if (existing?.id) return getTimeBalance(opts.userId);
  }

  await db.from('es_time_credits').insert({
    user_id: opts.userId,
    seconds_total: seconds,
    kind: opts.kind ?? 'trial',
    note,
    granted_by: opts.grantedBy ?? null,
  });

  return getTimeBalance(opts.userId);
}

/**
 * Consome tempo do usuário logado (heartbeat do editor).
 *
 * Usa a RPC `es_consume_time` com a sessão do próprio usuário: é atômica,
 * trava a linha do perfil (`for update`) + advisory lock por usuário e nunca
 * desconta mais do que o tempo realmente decorrido desde o último tick —
 * abrir duas abas ou recarregar a página não gera consumo dobrado.
 */
export async function consumeTime(seconds: number): Promise<TimeBalance> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('es_consume_time', { p_seconds: Math.round(seconds) });
    if (!error && Array.isArray(data) && data[0]) {
      const row = data[0] as { total_seconds: number; used_seconds: number; remaining_seconds: number };
      return {
        total: Number(row.total_seconds) || 0,
        used: Number(row.used_seconds) || 0,
        remaining: Math.max(0, Number(row.remaining_seconds) || 0),
      };
    }
  } catch {
    // nunca derruba o editor por falha de contabilização
  }
  return EMPTY;
}

export function hasActivePlan(status?: string | null) {
  return status === 'active' || status === 'trial' || status === 'past_due';
}

/**
 * O editor está liberado?
 * - plano ativo/trial → sim (sem consumir créditos)
 * - sem plano, mas com tempo comprado/liberado → sim
 */
export function canUseEditor(planStatus: string | null | undefined, balance: TimeBalance) {
  return hasActivePlan(planStatus) || balance.remaining > 0;
}
