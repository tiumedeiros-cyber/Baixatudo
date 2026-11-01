'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteDownloadHistory } from '@/app/dashboard/actions';

/** Botão de apagar o item do histórico (some da lista sem sair da tela). */
export function HistoryDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      title="Apagar do histórico"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteDownloadHistory(id);
          router.refresh();
        })
      }
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-400 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
