'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { clearAuditLogs, deleteAuditLog } from '@/app/admin/actions';

export function LogToolbar() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => router.refresh()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Atualizar
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm('Apagar TODOS os registros de auditoria? Isso não pode ser desfeito.')) return;
          start(async () => {
            await clearAuditLogs();
            router.refresh();
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Apagar tudo
      </button>
    </div>
  );
}

export function LogDelete({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteAuditLog(id);
          router.refresh();
        })
      }
      title="Apagar este registro"
      className="rounded-md p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
