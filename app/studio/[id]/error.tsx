'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, TriangleAlert } from 'lucide-react';

/** Rede de segurança: qualquer falha inesperada no editor mostra recuperação amigável. */
export default function StudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[studio] erro:', error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-rose-400/25 bg-ink-900 p-6">
        <div className="flex items-center gap-2 text-rose-300">
          <TriangleAlert className="h-5 w-5" />
          <h1 className="font-display text-lg font-bold text-white">Não foi possível abrir o editor</h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Seu projeto está salvo. Tente recarregar o editor — se o problema continuar, abra um novo projeto pela lista.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" /> Recarregar
          </button>
          <Link href="/dashboard/projetos" className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white">
            Meus projetos
          </Link>
        </div>
      </div>
    </div>
  );
}
