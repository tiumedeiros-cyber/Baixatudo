'use client';
import { useMemo } from 'react';
import { Diamond, Film, KeyRound, Palette, RotateCw, Sliders, Spline, Trash2, Type, Volume2 } from 'lucide-react';
import { useStudio } from './store';
import { cn } from '@/lib/utils';
import type { Clip, KeyframeProp, TransitionType } from '@/lib/types';

const TRANSITIONS: TransitionType[] = ['none', 'fade', 'slide', 'zoom', 'wipe', 'glitch', 'flash'];
const FONTS = ['Inter', 'Poppins', 'Bebas Neue', 'Playfair Display', 'Montserrat', 'Anton'];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="rounded bg-white/5 px-1 font-mono text-[10px] text-slate-300">
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-1 w-full accent-brand-500"
      />
    </div>
  );
}

function NumberInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Row label={label}>
      <input
        type="number"
        step={step}
        value={Number(value.toFixed(2))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white outline-none focus:border-brand-400/50"
      />
    </Row>
  );
}

export function Inspector() {
  const selectedId = useStudio((s) => s.selectedId);
  const clip = useStudio((s) => s.clips.find((c) => c.id === s.selectedId));
  const playhead = useStudio((s) => s.playhead);
  // Atenção: seletores do zustand/React 19 precisam de referência estável.
  // Retornar um objeto novo a cada render causa loop infinito (tela de erro no editor).
  const projectName = useStudio((s) => s.name);
  const projectWidth = useStudio((s) => s.width);
  const projectHeight = useStudio((s) => s.height);
  const projectFps = useStudio((s) => s.fps);
  const projectBackground = useStudio((s) => s.background);
  const projectDuration = useStudio((s) => s.duration);
  const project = {
    name: projectName,
    width: projectWidth,
    height: projectHeight,
    fps: projectFps,
    background: projectBackground,
    duration: projectDuration,
  };

  const keyframeProps: KeyframeProp[] = useMemo(() => ['x', 'y', 'scale', 'rotation', 'opacity', 'rotationX', 'rotationY'], []);

  if (!clip) {
    return (
      <div className="flex h-full flex-col rounded-xl border border-white/8 bg-ink-900/60 p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-white"><Film className="h-3.5 w-3.5 text-brand-300" /> Projeto</h3>
        <div className="mt-3 space-y-2.5">
          <Row label="Nome">
            <input
              value={project.name}
              onChange={(e) => useStudio.getState().setName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white outline-none focus:border-brand-400/50"
            />
          </Row>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
            <div className="rounded-lg bg-white/5 px-2 py-1.5">Resolução<br /><span className="text-white">{project.width}×{project.height}</span></div>
            <div className="rounded-lg bg-white/5 px-2 py-1.5">FPS<br /><span className="text-white">{project.fps}</span></div>
          </div>
          <Row label="Cor de fundo">
            <input type="color" value={project.background} onChange={(e) => useStudio.getState().setBackground(e.target.value)} className="h-8 w-full rounded-lg border border-white/10 bg-black/30" />
          </Row>
          <Slider label="Duração" value={project.duration} min={5} max={300} suffix="s" onChange={(v) => useStudio.getState().setDuration(v)} />
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-slate-500">
          Selecione um clipe na timeline para editar posição, efeitos, texto, transições e keyframes.
        </p>
        <div className="mt-4 space-y-1.5 rounded-lg border border-white/8 bg-white/[0.02] p-2 text-[10px] text-slate-400">
          <p className="font-semibold text-white">Atalhos</p>
          <p>Espaço — play/pause</p>
          <p>C / S — dividir no playhead</p>
          <p>Del — excluir clipe</p>
          <p>← → — 1 frame · Shift + ← → 1s</p>
          <p>Ctrl+Z / Ctrl+Shift+Z — undo/redo</p>
          <p>Ctrl + rolagem — zoom da régua</p>
        </div>
      </div>
    );
  }

  const isAudio = ['audio', 'sfx', 'music'].includes(clip.kind);
  const isText = clip.kind === 'text';
  const patch = (p: Partial<Clip>) => useStudio.getState().updateClip(clip.id, p);

  return (
    <div className="h-full overflow-y-auto rounded-xl border border-white/8 bg-ink-900/60">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/5 bg-ink-900/95 px-3 py-2 backdrop-blur">
        <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-200">{clip.kind}</span>
        <input
          value={clip.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-white outline-none"
        />
        <button onClick={() => useStudio.getState().removeClip(clip.id)} className="rounded p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        {/* tempo */}
        <section className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><KeyRound className="h-3 w-3" /> Tempo</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Início (s)" value={clip.start} step={0.1} onChange={(v) => patch({ start: Math.max(0, v) })} />
            <NumberInput label="Duração (s)" value={clip.duration} step={0.1} onChange={(v) => patch({ duration: Math.max(0.1, v) })} />
            <NumberInput label="Trim início" value={clip.trimStart} step={0.1} onChange={(v) => patch({ trimStart: Math.max(0, v) })} />
            <NumberInput label="Velocidade" value={clip.speed} step={0.05} onChange={(v) => patch({ speed: Math.min(4, Math.max(0.25, v)) })} />
          </div>
          <Slider label="Fade in" value={clip.fadeIn} min={0} max={3} step={0.05} suffix="s" onChange={(v) => patch({ fadeIn: v })} />
          <Slider label="Fade out" value={clip.fadeOut} min={0} max={3} step={0.05} suffix="s" onChange={(v) => patch({ fadeOut: v })} />
        </section>

        {/* aparência */}
        {!isAudio ? (
          <section className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><RotateCw className="h-3 w-3" /> Transformação</p>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="Posição X" value={clip.transform.x} onChange={(v) => useStudio.getState().patchTransform(clip.id, { x: v })} />
              <NumberInput label="Posição Y" value={clip.transform.y} onChange={(v) => useStudio.getState().patchTransform(clip.id, { y: v })} />
            </div>
            <Slider label="Escala" value={clip.transform.scale} min={0.1} max={4} step={0.01} suffix="×" onChange={(v) => useStudio.getState().patchTransform(clip.id, { scale: v })} />
            <Slider label="Rotação (Z)" value={clip.transform.rotation} min={-180} max={180} onChange={(v) => useStudio.getState().patchTransform(clip.id, { rotation: v })} suffix="°" />
            <Slider label="Rotação 3D (X)" value={clip.transform.rotationX} min={-180} max={180} onChange={(v) => useStudio.getState().patchTransform(clip.id, { rotationX: v })} suffix="°" />
            <Slider label="Rotação 3D (Y)" value={clip.transform.rotationY} min={-180} max={180} onChange={(v) => useStudio.getState().patchTransform(clip.id, { rotationY: v })} suffix="°" />
            <Slider label="Opacidade" value={Math.round(clip.opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => patch({ opacity: v / 100 })} />
            <button
              onClick={() => useStudio.getState().patchTransform(clip.id, { x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0 })}
              className="w-full rounded-lg border border-white/10 py-1 text-[10px] text-slate-300 hover:bg-white/5"
            >
              Centralizar e resetar
            </button>
          </section>
        ) : null}

        {/* áudio */}
        {['video', 'audio', 'sfx', 'music'].includes(clip.kind) ? (
          <section className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Volume2 className="h-3 w-3" /> Áudio</p>
            <Slider label="Volume" value={Math.round(clip.volume * 100)} min={0} max={200} suffix="%" onChange={(v) => patch({ volume: v / 100 })} />
            <label className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5 text-[10px] text-slate-300">
              Mutar som original
              <input type="checkbox" checked={clip.muted} onChange={(e) => patch({ muted: e.target.checked })} className="h-3.5 w-3.5 accent-brand-500" />
            </label>
          </section>
        ) : null}

        {/* texto */}
        {isText && clip.text ? (
          <section className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Type className="h-3 w-3" /> Texto</p>
            <textarea
              value={clip.text.content}
              onChange={(e) => useStudio.getState().patchText(clip.id, { content: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] text-white outline-none focus:border-brand-400/50"
            />
            <div className="grid grid-cols-2 gap-2">
              <Row label="Fonte">
                <select
                  value={clip.text.fontFamily}
                  onChange={(e) => useStudio.getState().patchText(clip.id, { fontFamily: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-ink-900 px-1.5 py-1 text-[11px] text-white outline-none"
                >
                  {FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </Row>
              <NumberInput label="Tamanho" value={clip.text.fontSize} onChange={(v) => useStudio.getState().patchText(clip.id, { fontSize: v })} />
              <Row label="Cor">
                <input type="color" value={clip.text.color} onChange={(e) => useStudio.getState().patchText(clip.id, { color: e.target.value })} className="h-8 w-full rounded-lg border border-white/10 bg-black/30" />
              </Row>
              <Row label="Peso">
                <select
                  value={clip.text.weight}
                  onChange={(e) => useStudio.getState().patchText(clip.id, { weight: Number(e.target.value) })}
                  className="w-full rounded-lg border border-white/10 bg-ink-900 px-1.5 py-1 text-[11px] text-white outline-none"
                >
                  {[400, 500, 600, 700, 800, 900].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </Row>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => useStudio.getState().patchText(clip.id, { align: a })}
                  className={cn('rounded-lg border py-1 text-[10px]', clip.text!.align === a ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 text-slate-400')}
                >
                  {a === 'left' ? 'Esq' : a === 'center' ? 'Centro' : 'Dir'}
                </button>
              ))}
            </div>
            <Slider label="Espaçamento" value={clip.text.letterSpacing} min={-5} max={30} suffix="px" onChange={(v) => useStudio.getState().patchText(clip.id, { letterSpacing: v })} />
            <Slider label="Altura da linha" value={clip.text.lineHeight} min={0.8} max={2} step={0.05} onChange={(v) => useStudio.getState().patchText(clip.id, { lineHeight: v })} />
            <Slider label="Contorno" value={clip.text.stroke} min={0} max={20} suffix="px" onChange={(v) => useStudio.getState().patchText(clip.id, { stroke: v })} />
            <div className="grid grid-cols-2 gap-2">
              <Row label="Contorno cor">
                <input type="color" value={clip.text.strokeColor} onChange={(e) => useStudio.getState().patchText(clip.id, { strokeColor: e.target.value })} className="h-8 w-full rounded-lg border border-white/10 bg-black/30" />
              </Row>
              <Row label="Fundo">
                <input type="color" value={clip.text.background.startsWith('#') ? clip.text.background : '#000000'} onChange={(e) => useStudio.getState().patchText(clip.id, { background: e.target.value })} className="h-8 w-full rounded-lg border border-white/10 bg-black/30" />
              </Row>
            </div>
            <label className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5 text-[10px] text-slate-300">
              Sombra
              <input type="checkbox" checked={clip.text.shadow} onChange={(e) => useStudio.getState().patchText(clip.id, { shadow: e.target.checked })} className="h-3.5 w-3.5 accent-brand-500" />
            </label>
            <Row label="Gradiente (cor1,cor2)">
              <input
                value={clip.text.gradient}
                onChange={(e) => useStudio.getState().patchText(clip.id, { gradient: e.target.value })}
                placeholder="#a5b4fc,#22d3ee"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white outline-none"
              />
            </Row>
            <Row label="Animação">
              <select
                value={clip.text.animation}
                onChange={(e) => useStudio.getState().patchText(clip.id, { animation: e.target.value as 'none' | 'typewriter' | 'pop' | 'fade' })}
                className="w-full rounded-lg border border-white/10 bg-ink-900 px-1.5 py-1 text-[11px] text-white outline-none"
              >
                <option value="none">Nenhuma</option>
                <option value="typewriter">Máquina de escrever</option>
                <option value="pop">Pop</option>
                <option value="fade">Fade</option>
              </select>
            </Row>
          </section>
        ) : null}

        {/* 3D */}
        {clip.kind === 'object3d' && clip.object3d ? (
          <section className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Spline className="h-3 w-3" /> Objeto 3D</p>
            <Row label="Forma">
              <select
                value={clip.object3d.shape}
                onChange={(e) => patch({ object3d: { ...clip.object3d!, shape: e.target.value } })}
                className="w-full rounded-lg border border-white/10 bg-ink-900 px-1.5 py-1 text-[11px] text-white outline-none"
              >
                {['box', 'sphere', 'torus', 'knot', 'plane'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Row>
            <Row label="Cor">
              <input type="color" value={clip.object3d.color} onChange={(e) => patch({ object3d: { ...clip.object3d!, color: e.target.value } })} className="h-8 w-full rounded-lg border border-white/10 bg-black/30" />
            </Row>
            <Slider label="Giro" value={clip.object3d.spin} min={0} max={3} step={0.1} onChange={(v) => patch({ object3d: { ...clip.object3d!, spin: v } })} />
          </section>
        ) : null}

        {/* cor */}
        {!isAudio && !isText ? (
          <section className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Palette className="h-3 w-3" /> Cor e efeitos</p>
            <Slider label="Brilho" value={clip.filters.brightness} min={20} max={200} suffix="%" onChange={(v) => useStudio.getState().patchFilters(clip.id, { brightness: v })} />
            <Slider label="Contraste" value={clip.filters.contrast} min={20} max={200} suffix="%" onChange={(v) => useStudio.getState().patchFilters(clip.id, { contrast: v })} />
            <Slider label="Saturação" value={clip.filters.saturation} min={0} max={250} suffix="%" onChange={(v) => useStudio.getState().patchFilters(clip.id, { saturation: v })} />
            <Slider label="Matiz" value={clip.filters.hue} min={-180} max={180} onChange={(v) => useStudio.getState().patchFilters(clip.id, { hue: v })} suffix="°" />
            <Slider label="Desfoque" value={clip.filters.blur} min={0} max={30} suffix="px" onChange={(v) => useStudio.getState().patchFilters(clip.id, { blur: v })} />
            <Slider label="Preto e branco" value={clip.filters.grayscale} min={0} max={100} suffix="%" onChange={(v) => useStudio.getState().patchFilters(clip.id, { grayscale: v })} />
          </section>
        ) : null}

        {/* transições */}
        <section className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Sliders className="h-3 w-3" /> Transições</p>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Entrada">
              <select
                value={clip.transitionIn.type}
                onChange={(e) => patch({ transitionIn: { ...clip.transitionIn, type: e.target.value as TransitionType } })}
                className="w-full rounded-lg border border-white/10 bg-ink-900 px-1.5 py-1 text-[11px] text-white outline-none"
              >
                {TRANSITIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Row>
            <Row label="Saída">
              <select
                value={clip.transitionOut.type}
                onChange={(e) => patch({ transitionOut: { ...clip.transitionOut, type: e.target.value as TransitionType } })}
                className="w-full rounded-lg border border-white/10 bg-ink-900 px-1.5 py-1 text-[11px] text-white outline-none"
              >
                {TRANSITIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Row>
          </div>
          <Slider label="Duração entrada" value={clip.transitionIn.duration} min={0.1} max={2} step={0.05} suffix="s" onChange={(v) => patch({ transitionIn: { ...clip.transitionIn, duration: v } })} />
          <Slider label="Duração saída" value={clip.transitionOut.duration} min={0.1} max={2} step={0.05} suffix="s" onChange={(v) => patch({ transitionOut: { ...clip.transitionOut, duration: v } })} />
        </section>

        {/* keyframes */}
        <section className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Diamond className="h-3 w-3" /> Keyframes</p>
          <p className="text-[9px] text-slate-500">Posicione o playhead e clique para gravar o valor atual.</p>
          <div className="grid grid-cols-2 gap-1">
            {keyframeProps.map((prop) => {
              const value =
                prop === 'opacity'
                  ? clip.opacity
                  : prop === 'x'
                    ? clip.transform.x
                    : prop === 'y'
                      ? clip.transform.y
                      : prop === 'scale'
                        ? clip.transform.scale
                        : prop === 'rotation'
                          ? clip.transform.rotation
                          : prop === 'rotationX'
                            ? clip.transform.rotationX
                            : clip.transform.rotationY;
              return (
                <button
                  key={prop}
                  onClick={() => useStudio.getState().addKeyframe(clip.id, prop, value)}
                  className="rounded-lg border border-white/10 py-1 text-[9px] text-slate-300 hover:border-amber-400/40 hover:text-amber-200"
                >
                  + {prop}
                </button>
              );
            })}
          </div>
          {clip.keyframes.length ? (
            <ul className="space-y-1">
              {clip.keyframes.map((k) => (
                <li key={k.id} className="flex items-center gap-2 rounded bg-black/30 px-1.5 py-1 text-[9px] text-slate-300">
                  <span className="font-mono text-amber-300">{k.prop}</span>
                  <span className="text-slate-500">@ {k.t.toFixed(2)}s</span>
                  <span className="ml-auto">{k.value.toFixed(2)}</span>
                  <button onClick={() => useStudio.getState().removeKeyframe(clip.id, k.id)} className="text-slate-500 hover:text-rose-300">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[9px] text-slate-600">Playhead: {playhead.toFixed(2)}s</p>
        </section>
      </div>
    </div>
  );
}
