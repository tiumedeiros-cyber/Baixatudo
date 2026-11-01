'use client';
import { useState, useTransition } from 'react';
import { Loader2, PlugZap } from 'lucide-react';
import { testExternalStorage } from '@/app/admin/actions';

/** Botão que realmente envia, lê pela URL pública e apaga — prova que o bucket funciona. */
export function StorageTest() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await testExternalStorage()))}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />} Testar conexão
      </button>
      {result ? (
        <p
          className={`break-all rounded-lg border px-2 py-1.5 text-[10px] leading-relaxed ${
            result.ok
              ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-400/25 bg-rose-500/10 text-rose-200'
          }`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
