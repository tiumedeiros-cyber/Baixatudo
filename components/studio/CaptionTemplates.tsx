'use client';

/**
 * CaptionTemplates — seletor visual dos templates de legenda animada.
 *
 * Aparece na aba "Texto" da biblioteca e logo abaixo do "Áudio → Texto"
 * (ditado/narração), como o usuário pediu: opções visuais ao gerar legendas.
 *
 * Não cria clipe novo nem muda a estrutura: só aplica um `Partial<TextProps>`
 * nos clipes de texto que já existem (selecionado, todos, ou o último criado).
 */

import { useMemo, useState } from 'react';
import { Captions, Check, Wand2 } from 'lucide-react';
import { useStudio } from './store';
import { CAPTION_TEMPLATES, applyCaptionTemplate, type CaptionTemplateId } from './caption-presets';
import { cn } from '@/lib/utils';

export function CaptionTemplates({ onApplied }: { onApplied?: (message: string) => void }) {
  const clips = useStudio((s) => s.clips);
  const selectedId = useStudio((s) => s.selectedId);
  const updateClip = useStudio((s) => s.updateClip);
  const [applied, setApplied] = useState<CaptionTemplateId | null>(null);

  const textClips = useMemo(() => clips.filter((c) => c.kind === 'text' && c.text), [clips]);
  const selectedText = textClips.find((c) => c.id === selectedId) ?? null;

  function apply(id: CaptionTemplateId, scope: 'one' | 'all') {
    const targets = scope === 'all' ? textClips : selectedText ? [selectedText] : textClips.slice(-1);
    if (!targets.length) {
      onApplied?.('Adicione um texto (ou dite a narração) antes de aplicar o template.');
      return;
    }
    targets.forEach((clip) => {
      updateClip(clip.id, { text: { ...clip.text!, ...applyCaptionTemplate(clip, id) } });
    });
    setApplied(id);
    onApplied?.(`Template “${CAPTION_TEMPLATES.find((t) => t.id === id)?.name}” aplicado em ${targets.length} legenda(s).`);
  }

  return (
    <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-200">
        <Captions className="h-3 w-3 text-brand-300" /> Legendas animadas
        <span className="ml-auto text-[9px] font-normal text-slate-500">{textClips.length} clipe(s) de texto</span>
      </p>

      <div className="grid grid-cols-3 gap-1">
        {CAPTION_TEMPLATES.map((template) => {
          const active = applied === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => apply(template.id, selectedText ? 'one' : 'all')}
              className={cn(
                'group flex flex-col gap-1 rounded-lg border p-1.5 text-left transition',
                active ? 'border-brand-400/70 bg-brand-500/15' : 'border-white/10 bg-black/25 hover:border-white/25',
              )}
            >
              <span className="flex h-9 items-center justify-center overflow-hidden rounded bg-gradient-to-br from-slate-800 to-slate-950 px-1">
                <Preview id={template.id} />
              </span>
              <span className="text-[9px] font-semibold text-white">{template.name}</span>
              <span className="text-[8px] leading-tight text-slate-500">{template.hint}</span>
              {active ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : null}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => apply('karaoke', 'all')}
        disabled={!textClips.length}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 py-1 text-[9px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40"
      >
        <Wand2 className="h-2.5 w-2.5" /> Karaokê em todas as legendas
      </button>
    </div>
  );
}

/** Prévia em CSS puro (sem canvas), só para o usuário ver o estilo. */
function Preview({ id }: { id: CaptionTemplateId }) {
  if (id === 'karaoke') {
    return (
      <span className="text-[11px] font-black leading-none tracking-tight">
        <span className="text-white/45">VOCÊ</span> <span className="animate-pulse text-yellow-300">VAI</span>{' '}
        <span className="text-white/45">AMAR</span>
      </span>
    );
  }
  if (id === 'popup') {
    return (
      <span className="text-[12px] font-black uppercase leading-none text-white [text-shadow:0_0_2px_#000,0_2px_0_#000]">
        ISSO <span className="inline-block -rotate-2 text-emerald-300">É</span> TOP
      </span>
    );
  }
  return (
    <span className="flex w-full flex-col items-center gap-0.5">
      <span className="w-full bg-black/80 px-1 text-center text-[11px] font-black uppercase leading-tight text-white">IMPACTO</span>
      <span className="h-0.5 w-full bg-yellow-400" />
    </span>
  );
}
