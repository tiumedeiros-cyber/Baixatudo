import Link from 'next/link';
import { Clock, Database, Hourglass } from 'lucide-react';
import { formatBytes } from '@/lib/quota';

function validityLabel(date: string | null) {
  if (!date) return 'sem data';
  const diff = new Date(date).getTime() - Date.now();
  if (diff <= 0) return 'expirado';
  const hours = Math.floor(diff / 3600000);
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return `${days} dia${days > 1 ? 's' : ''}${rest ? ` e ${rest}h` : ''}`;
  }
  if (hours >= 1) {
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  }
  return `${Math.max(1, Math.floor(diff / 60000))} min`;
}

/**
 * Barra superior do painel: plano, validade (dias/horas), tempo de edição e
 * armazenamento — sempre com números reais do banco, sem mensagem fixa.
 */
export function PlanStatusBar({
  planName,
  status,
  periodEnd,
  timeRemaining,
  hasCreditPlan,
  usedBytes,
  limitBytes,
  planGb,
}: {
  planName: string | null;
  status: string | null;
  periodEnd: string | null;
  timeRemaining: number;
  hasCreditPlan: boolean;
  usedBytes: number;
  limitBytes: number;
  planGb: number;
}) {
  const pct = limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;
  const warning = pct >= 85;
  const tone = warning ? 'text-amber-300' : pct >= 60 ? 'text-brand-200' : 'text-emerald-300';
  const barTone = warning ? 'bg-amber-400' : pct >= 60 ? 'bg-brand-400' : 'bg-emerald-400';

  return (
    <div className="border-b border-white/8 bg-ink-850/80 px-4 py-2 backdrop-blur lg:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-brand-300" />
          <span className="font-semibold text-white">{planName ?? 'Sem plano'}</span>
          <span className="text-slate-500">·</span>
          <span className={status === 'active' || status === 'trial' ? 'text-emerald-300' : 'text-amber-300'}>
            {status === 'trial' ? 'teste' : status === 'active' ? 'ativo' : status ?? 'inativo'}
          </span>
          <span className="text-slate-500">·</span>
          <span title={periodEnd ? new Date(periodEnd).toLocaleString('pt-BR') : ''}>
            {status === 'trial' ? 'expira em ' : 'renova em '}
            <strong className="text-slate-200">{validityLabel(periodEnd)}</strong>
          </span>
        </span>

        {hasCreditPlan || timeRemaining > 0 ? (
          <span className="flex items-center gap-1.5">
            <Hourglass className="h-3.5 w-3.5 text-brand-300" />
            tempo de edição: <strong className="text-slate-200">
              {Math.floor(timeRemaining / 3600)}h {String(Math.floor((timeRemaining % 3600) / 60)).padStart(2, '0')}min
            </strong>
          </span>
        ) : null}

        <span className="flex min-w-[190px] flex-1 items-center gap-2">
          <Database className="h-3.5 w-3.5 text-brand-300" />
          <span className="flex-1">
            <span className="flex items-center justify-between">
              <span>
                armazenamento: <strong className={tone}>{formatBytes(usedBytes)}</strong> de {formatBytes(limitBytes)} ({planGb} GB)
              </span>
              <span className={tone}>{Math.round(pct)}%</span>
            </span>
            <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-white/10">
              <span className={`block h-full ${barTone}`} style={{ width: `${Math.max(2, pct)}%` }} />
            </span>
          </span>
        </span>

        <Link href="/dashboard/arquivos" className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/5">
          gerenciar
        </Link>
        <Link href="/dashboard/assinatura" className="rounded-lg border border-brand-400/30 bg-brand-500/10 px-2 py-1 text-[10px] font-semibold text-brand-200 hover:bg-brand-500/20">
          planos
        </Link>
      </div>
      {warning ? (
        <p className="mt-1 text-[10px] text-amber-300">
          Seu armazenamento está em {Math.round(pct)}% — apague arquivos em Meus arquivos para liberar espaço.
        </p>
      ) : null}
    </div>
  );
}
