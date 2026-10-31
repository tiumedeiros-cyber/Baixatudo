'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, Trash2 } from 'lucide-react';
import { deleteProject, duplicateProject } from '@/app/dashboard/actions';

export function ProjectActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => start(() => duplicateProject(id))}
        title="Duplicar"
        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"
        disabled={pending}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => {
          if (confirm('Excluir este projeto? Essa ação não pode ser desfeita.')) {
            start(async () => {
              await deleteProject(id);
              router.refresh();
            });
          }
        }}
        title="Excluir"
        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
