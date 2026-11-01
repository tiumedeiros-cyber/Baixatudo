'use client';
import { useState, useTransition } from 'react';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import { cleanOrphanStorage } from '@/app/admin/actions';

function fmt(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 || i <= 1 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** Manutenção do storage: mostra o uso real e limpa arquivos órfãos. */
export function StorageCleanup({ usedBytes, files, users }: { usedBytes: number; files: number; users: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-2 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Em uso</p>
          <p className="text-sm font-bold text-white">{fmt(usedBytes)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-2 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Arquivos</p>
          <p className="text-sm font-bold text-white">{files}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-2 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Clientes</p>
          <p className="text-sm font-bold text-white">{users}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            setError(null);
            const result = await cleanOrphanStorage();
            if (result.error) setError(result.error);
            else if (!result.removed) setMessage('Nenhum arquivo órfão encontrado — storage em ordem.');
            else setMessage(`${result.removed} arquivo(s) removido(s) · ${fmt(result.bytes)} liberados.`);
          })
        }
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/5 py-2 text-[11px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Limpar arquivos órfãos
      </button>
      {message ? (
        <p className="flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-200">
          <Sparkles className="h-3 w-3" /> {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">{error}</p>
      ) : null}
      <p className="text-[10px] leading-relaxed text-slate-500">
        Só apaga o que não está em nenhum asset, projeto ou narração e tem mais de 2 dias — nunca remove arquivo em uso.
      </p>
    </div>
  );
}
