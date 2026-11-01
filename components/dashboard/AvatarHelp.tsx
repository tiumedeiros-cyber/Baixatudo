'use client';
import { useEffect, useState } from 'react';
import { HelpCircle, Lightbulb, Sparkles, UserRound, Video, X } from 'lucide-react';

const STEPS = [
  {
    icon: UserRound,
    title: 'Passo 1 · Escolha seu Apresentador',
    text: 'Selecione um avatar fotorrealista na galeria — ou envie uma foto sua para virar avatar.',
  },
  {
    icon: Video,
    title: 'Passo 2 · Defina o Ambiente',
    text: 'Escolha um cenário de fundo. O sistema recorta o fundo do avatar automaticamente.',
  },
  {
    icon: Sparkles,
    title: 'Passo 3 · Dê voz ao Avatar',
    text: 'Escreva o roteiro e escolha o timbre. A inteligência artificial fará a sincronização labial completa.',
  },
];

/**
 * Botão "Como usar" do módulo de Avatares falantes.
 * Componente isolado: só abre/fecha um modal — não toca na timeline nem no player.
 */
export function AvatarHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Como usar os avatares falantes"
        aria-label="Como usar os avatares falantes"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-slate-300 transition hover:border-brand-400/60 hover:text-white"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="avatar-help-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-white/10 bg-ink-900 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-brand-500/15 to-transparent px-5 py-4">
              <div>
                <h2 id="avatar-help-title" className="font-display text-base font-bold text-white">
                  Como usar os avatares falantes
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-400">Três passos e o vídeo sai pronto na timeline.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
              {STEPS.map((step) => (
                <div key={step.title} className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-200">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-white">{step.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{step.text}</p>
                  </div>
                </div>
              ))}

              <div className="flex gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-200">
                  <Lightbulb className="h-4 w-4" />
                </span>
                <p className="text-[11px] leading-relaxed text-amber-100/90">
                  <strong className="text-amber-100">Dica:</strong> o processo de sincronização por IA leva alguns minutos
                  devido à alta qualidade. Se o serviço gratuito estiver ocupado, o sistema gera na hora com o motor
                  interno e você não fica sem o vídeo. Depois de pronto, o vídeo abre direto na sua timeline, com o cenário
                  por baixo — pronto para cortes.
                </p>
              </div>
            </div>

            <div className="flex justify-end border-t border-white/10 px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-400"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
