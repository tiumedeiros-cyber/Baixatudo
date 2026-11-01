'use client';
import { useMemo, useState } from 'react';
import {
  AudioLines,
  Boxes,
  Diamond,
  Film,
  KeyRound,
  Layers,
  Palette,
  Palette as PaletteIcon,
  RotateCw,
  Sliders,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react';
import { useStudio, DEFAULT_GENERATOR } from './store';
import { FontPicker } from './FontPicker';
import { cn } from '@/lib/utils';
import type { Clip, KeyframeProp, TextProps, TransitionType } from '@/lib/types';

const TRANSITIONS: TransitionType[] = ['none', 'fade', 'slide', 'zoom', 'wipe', 'glitch', 'flash'];
const FONTS = ['Inter', 'Poppins', 'Montserrat', 'Bebas Neue', 'Anton', 'Playfair Display'];
const GENERATOR_PRESETS = [
  ['aurora', 'Aurora'],
  ['waves', 'Ondas'],
  ['particles', 'Partículas'],
  ['grid', 'Grid neon'],
  ['bokeh', 'Bokeh'],
  ['sweep', 'Feixe de luz'],
  ['rays', 'Raios'],
  ['spotlight', 'Holofote'],
  ['stripes', 'Listras'],
  ['gradient', 'Gradiente'],
  ['solid', 'Cor sólida'],
] as const;
const STICKERS = [
  ['burst', 'Explosão'],
  ['tag', 'Etiqueta'],
  ['ribbon', 'Faixa'],
  ['seal', 'Selo'],
  ['star', 'Estrela'],
  ['pill', 'Pílula'],
  ['arrow', 'Seta'],
  ['rings', 'Anéis'],
  ['circle', 'Círculo'],
  ['square', 'Quadrado'],
  ['triangle', 'Triângulo'],
  ['line', 'Linha'],
  ['frame', 'Moldura'],
] as const;

type SectionId = 'transform' | 'style' | 'text' | 'object3d' | 'generator' | 'sticker' | 'audio' | 'time' | 'transitions' | 'keyframes';

const SECTIONS: { id: SectionId; label: string; icon: typeof RotateCw }[] = [
  { id: 'transform', label: 'Transformar', icon: RotateCw },
  { id: 'style', label: 'Cor & sombra', icon: Palette },
  { id: 'text', label: 'Texto', icon: Type },
  { id: 'generator', label: 'Fundo', icon: Sparkles },
  { id: 'object3d', label: '3D', icon: Boxes },
  { id: 'sticker', label: 'Forma', icon: Layers },
  { id: 'audio', label: 'Áudio', icon: AudioLines },
  { id: 'time', label: 'Tempo', icon: KeyRound },
  { id: 'transitions', label: 'Transições', icon: Sliders },
  { id: 'keyframes', label: 'Keyframes', icon: Diamond },
];

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

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {icon} {title}
      </p>
      {children}
    </section>
  );
}

export function Inspector() {
  const [section, setSection] = useState<SectionId>('transform');
  const clip = useStudio((s) => s.clips.find((c) => c.id === s.selectedId));
  const playhead = useStudio((s) => s.playhead);
  const clips = useStudio((s) => s.clips);
  const [cutType, setCutType] = useState<TransitionType>('fade');
  const [cutDuration, setCutDuration] = useState(0.5);
  const [justApplied, setJustApplied] = useState<string | null>(null);

  // seletores primitivos: referência estável (evita loop de render no React 19)
  const projectName = useStudio((s) => s.name);
  const projectWidth = useStudio((s) => s.width);
  const projectHeight = useStudio((s) => s.height);
  const projectFps = useStudio((s) => s.fps);
  const projectBackground = useStudio((s) => s.background);
  const projectDuration = useStudio((s) => s.duration);

  const keyframeProps: KeyframeProp[] = useMemo(() => ['x', 'y', 'scale', 'rotation', 'opacity', 'rotationX', 'rotationY'], []);

  if (!clip) {
    return (
      <div className="flex h-full flex-col overflow-y-auto rounded-xl border border-white/8 bg-ink-900 p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <Film className="h-3.5 w-3.5 text-brand-300" /> Projeto
        </h3>
        <div className="mt-3 space-y-2.5">
          <Row label="Nome">
            <input
              value={projectName}
              onChange={(e) => useStudio.getState().setName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white outline-none focus:border-brand-400/50"
            />
          </Row>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
            <div className="rounded-lg bg-white/5 px-2 py-1.5">
              Resolução<br /><span className="text-white">{projectWidth}×{projectHeight}</span>
            </div>
            <div className="rounded-lg bg-white/5 px-2 py-1.5">
              FPS<br /><span className="text-white">{projectFps}</span>
            </div>
          </div>
          <Row label="Cor de fundo">
            <input
              type="color"
              value={projectBackground}
              onChange={(e) => useStudio.getState().setBackground(e.target.value)}
              className="h-8 w-full rounded-lg border border-white/10 bg-black/30"
            />
          </Row>
          <Slider label="Duração" value={projectDuration} min={5} max={300} suffix="s" onChange={(v) => useStudio.getState().setDuration(v)} />
        </div>
        <p className="mt-4 rounded-lg border border-brand-400/20 bg-brand-500/10 p-2 text-[10px] leading-relaxed text-brand-100">
          Selecione um clipe na timeline para abrir os ajustes: posição, 360°, cor, sombra, texto, fundo animado e keyframes.
        </p>
        <div className="mt-4 space-y-1.5 rounded-lg border border-white/8 bg-white/[0.02] p-2 text-[10px] text-slate-400">
          <p className="font-semibold text-white">Atalhos</p>
          <p>Espaço — play/pause</p>
          <p>C / S — dividir no playhead</p>
          <p>Del — excluir clipe</p>
          <p>← → — 1 frame · Shift + ← → 1s</p>
          <p>Ctrl+Z / Ctrl+Shift+Z — undo/redo</p>
        </div>
      </div>
    );
  }

  const isAudio = ['audio', 'sfx', 'music'].includes(clip.kind);
  const isText = clip.kind === 'text';
  const isGenerator = clip.kind === 'generator';
  const isSticker = clip.kind === 'sticker';
  const is3d = clip.kind === 'object3d';
  const patch = (p: Partial<Clip>) => useStudio.getState().updateClip(clip.id, p);

  const available = SECTIONS.filter((s) => {
    if (s.id === 'audio') return ['video', 'audio', 'sfx', 'music'].includes(clip.kind);
    if (s.id === 'text') return isText && Boolean(clip.text);
    if (s.id === 'generator') return isGenerator;
    if (s.id === 'object3d') return is3d && Boolean(clip.object3d);
    if (s.id === 'sticker') return isSticker;
    if (s.id === 'style') return !isAudio && !isText;
    if (s.id === 'transform') return !isAudio;
    return true;
  });
  const current = available.some((s) => s.id === section) ? section : available[0]?.id ?? 'time';

  const shadow = clip.shadow ?? { blur: 0, color: 'rgba(0,0,0,0.65)', offsetY: 0, offsetX: 0 };
  const patchShadow = (p: Partial<typeof shadow>) => patch({ shadow: { ...shadow, ...p } });

  /** Gira 360° com dois keyframes (0 → 360). */
  function spin360(prop: 'rotation' | 'rotationX' | 'rotationY') {
    const points = [
      { id: `${prop}-0`, t: 0, prop, value: 0 },
      { id: `${prop}-1`, t: Math.max(1, clip!.duration), prop, value: 360 },
    ];
    const others = clip!.keyframes.filter((k) => k.prop !== prop);
    patch({ keyframes: [...others, ...points].sort((a, b) => a.t - b.t) });
  }

  const keyframeValue = (prop: KeyframeProp) =>
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
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-ink-900">
      {/* cabeçalho do elemento */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
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

      {/* atalho de som sempre visível para clipes de áudio e vídeo */}
      {isAudio || clip.kind === 'video' ? (
        <div className="border-b border-white/5 bg-white/[0.02] px-3 py-2">
          <div className="flex items-center gap-2">
            <AudioLines className="h-3.5 w-3.5 shrink-0 text-brand-300" />
            <input
              type="range"
              min={0}
              max={200}
              value={Math.round(clip.volume * 100)}
              onChange={(e) => patch({ volume: Number(e.target.value) / 100 })}
              className="h-1 min-w-0 flex-1 accent-brand-500"
              aria-label="Volume do clipe"
            />
            <span className="w-9 shrink-0 text-right text-[10px] font-semibold text-white">{Math.round(clip.volume * 100)}%</span>
            <button
              onClick={() => patch({ muted: !clip.muted })}
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold',
                clip.muted ? 'bg-rose-500/20 text-rose-200' : 'bg-white/8 text-slate-300 hover:bg-white/12',
              )}
            >
              {clip.muted ? 'mudo' : 'som'}
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1 text-[9px] text-slate-400">
              fade in
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={clip.fadeIn}
                onChange={(e) => patch({ fadeIn: Math.max(0, Math.min(5, Number(e.target.value))) })}
                className="w-full rounded border border-white/10 bg-black/30 px-1 py-0.5 text-[10px] text-white outline-none"
              />
            </label>
            <label className="flex items-center gap-1 text-[9px] text-slate-400">
              fade out
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={clip.fadeOut}
                onChange={(e) => patch({ fadeOut: Math.max(0, Math.min(5, Number(e.target.value))) })}
                className="w-full rounded border border-white/10 bg-black/30 px-1 py-0.5 text-[10px] text-white outline-none"
              />
            </label>
          </div>
        </div>
      ) : null}

      {/* menu lateral de ajustes */}
      <div className="flex gap-1 overflow-x-auto border-b border-white/5 p-1.5 no-scrollbar">
        {available.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition',
              current === s.id ? 'bg-brand-500/25 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
            )}
          >
            <s.icon className="h-3 w-3" /> {s.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {current === 'transform' ? (
          <>
            <Card title="Posição e escala" icon={<RotateCw className="h-3 w-3" />}>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput label="Posição X" value={clip.transform.x} onChange={(v) => useStudio.getState().patchTransform(clip.id, { x: v })} />
                <NumberInput label="Posição Y" value={clip.transform.y} onChange={(v) => useStudio.getState().patchTransform(clip.id, { y: v })} />
              </div>
              <Slider label="Escala" value={clip.transform.scale} min={0.1} max={4} step={0.01} suffix="×" onChange={(v) => useStudio.getState().patchTransform(clip.id, { scale: v })} />
              <Slider label="Opacidade" value={Math.round(clip.opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => patch({ opacity: v / 100 })} />
              <div className="grid grid-cols-2 gap-1">
                <button onClick={() => useStudio.getState().patchTransform(clip.id, { x: 0, y: 0 })} className="rounded-lg border border-white/10 py-1 text-[10px] text-slate-300 hover:bg-white/5">
                  Centralizar
                </button>
                <button
                  onClick={() => useStudio.getState().patchTransform(clip.id, { x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0 })}
                  className="rounded-lg border border-white/10 py-1 text-[10px] text-slate-300 hover:bg-white/5"
                >
                  Resetar tudo
                </button>
              </div>
            </Card>

            <Card title="Rotação 360°" icon={<RotateCw className="h-3 w-3" />}>
              <Slider label="Girar (Z)" value={clip.transform.rotation} min={-180} max={180} suffix="°" onChange={(v) => useStudio.getState().patchTransform(clip.id, { rotation: v })} />
              <Slider label="Inclinar (X)" value={clip.transform.rotationX} min={-180} max={180} suffix="°" onChange={(v) => useStudio.getState().patchTransform(clip.id, { rotationX: v })} />
              <Slider label="Virar (Y)" value={clip.transform.rotationY} min={-180} max={180} suffix="°" onChange={(v) => useStudio.getState().patchTransform(clip.id, { rotationY: v })} />
              <p className="text-[9px] leading-relaxed text-slate-500">Giro automático cria keyframes 0° → 360° durante o clipe.</p>
              <div className="grid grid-cols-3 gap-1">
                {(['rotation', 'rotationX', 'rotationY'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => spin360(p)}
                    className="rounded-lg border border-brand-400/30 bg-brand-500/10 py-1 text-[9px] font-semibold text-brand-100 hover:bg-brand-500/20"
                  >
                    Girar {p === 'rotation' ? 'Z' : p === 'rotationX' ? 'X' : 'Y'}
                  </button>
                ))}
              </div>
            </Card>
          </>
        ) : null}

        {current === 'style' ? (
          <>
            <Card title="Cor e efeitos" icon={<Palette className="h-3 w-3" />}>
              <Slider label="Brilho" value={clip.filters.brightness} min={20} max={200} suffix="%" onChange={(v) => useStudio.getState().patchFilters(clip.id, { brightness: v })} />
              <Slider label="Contraste" value={clip.filters.contrast} min={20} max={200} suffix="%" onChange={(v) => useStudio.getState().patchFilters(clip.id, { contrast: v })} />
              <Slider label="Saturação" value={clip.filters.saturation} min={0} max={250} suffix="%" onChange={(v) => useStudio.getState().patchFilters(clip.id, { saturation: v })} />
              <Slider label="Matiz" value={clip.filters.hue} min={-180} max={180} suffix="°" onChange={(v) => useStudio.getState().patchFilters(clip.id, { hue: v })} />
              <Slider label="Desfoque" value={clip.filters.blur} min={0} max={30} suffix="px" onChange={(v) => useStudio.getState().patchFilters(clip.id, { blur: v })} />
              <Slider label="Preto e branco" value={clip.filters.grayscale} min={0} max={100} suffix="%" onChange={(v) => useStudio.getState().patchFilters(clip.id, { grayscale: v })} />
              <button
                onClick={() => useStudio.getState().patchFilters(clip.id, { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0 })}
                className="w-full rounded-lg border border-white/10 py-1 text-[10px] text-slate-300 hover:bg-white/5"
              >
                Restaurar cor
              </button>
            </Card>

            <Card title="Sombra" icon={<PaletteIcon className="h-3 w-3" />}>
              <Slider label="Desfoque" value={shadow.blur} min={0} max={120} suffix="px" onChange={(v) => patchShadow({ blur: v })} />
              <Slider label="Deslocar X" value={shadow.offsetX} min={-80} max={80} suffix="px" onChange={(v) => patchShadow({ offsetX: v })} />
              <Slider label="Deslocar Y" value={shadow.offsetY} min={-80} max={80} suffix="px" onChange={(v) => patchShadow({ offsetY: v })} />
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={shadow.color.startsWith('#') ? shadow.color : '#000000'}
                  onChange={(e) => patchShadow({ color: e.target.value })}
                  className="h-8 w-14 rounded-lg border border-white/10 bg-black/30"
                />
                <button onClick={() => patchShadow({ blur: 0, offsetX: 0, offsetY: 0 })} className="flex-1 rounded-lg border border-white/10 py-1.5 text-[10px] text-slate-300 hover:bg-white/5">
                  Remover sombra
                </button>
              </div>
            </Card>
          </>
        ) : null}

        {current === 'generator' && clip.generator ? (
          <Card title="Fundo animado" icon={<Sparkles className="h-3 w-3" />}>
            <Row label="Estilo">
              <select
                value={clip.generator.preset}
                onChange={(e) => patch({ generator: { ...clip.generator!, preset: e.target.value } })}
                className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
              >
                {GENERATOR_PRESETS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Row>
            <div className="grid grid-cols-2 gap-2">
              <Row label="Cor A">
                <input type="color" value={clip.generator.colorA} onChange={(e) => patch({ generator: { ...clip.generator!, colorA: e.target.value } })} className="h-8 w-full rounded-lg border border-white/10 bg-black/30" />
              </Row>
              <Row label="Cor B">
                <input type="color" value={clip.generator.colorB} onChange={(e) => patch({ generator: { ...clip.generator!, colorB: e.target.value } })} className="h-8 w-full rounded-lg border border-white/10 bg-black/30" />
              </Row>
            </div>
            <Slider label="Velocidade" value={clip.generator.speed} min={0.1} max={4} step={0.05} suffix="×" onChange={(v) => patch({ generator: { ...clip.generator!, speed: v } })} />
            <Slider label="Intensidade" value={clip.generator.intensity} min={0.2} max={2} step={0.05} onChange={(v) => patch({ generator: { ...clip.generator!, intensity: v } })} />
            <button
              onClick={() => patch({ generator: { ...DEFAULT_GENERATOR } })}
              className="w-full rounded-lg border border-white/10 py-1 text-[10px] text-slate-300 hover:bg-white/5"
            >
              Restaurar padrão
            </button>
            <p className="text-[9px] leading-relaxed text-slate-500">
              Renderizado no próprio navegador em qualquer resolução (até 4K) — sem marca d'água e sem depender de arquivo.
            </p>
          </Card>
        ) : null}

        {current === 'sticker' && clip.sticker ? (
          <Card title="Forma / selo" icon={<Layers className="h-3 w-3" />}>
            <Row label="Formato">
              <select
                value={clip.sticker.preset}
                onChange={(e) => patch({ sticker: { ...clip.sticker!, preset: e.target.value } })}
                className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
              >
                {STICKERS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Row>
            <Row label="Cor">
              <input type="color" value={clip.sticker.color} onChange={(e) => patch({ sticker: { ...clip.sticker!, color: e.target.value } })} className="h-8 w-full rounded-lg border border-white/10 bg-black/30" />
            </Row>
          </Card>
        ) : null}

        {current === 'object3d' && clip.object3d ? (
          <Card title="Objeto 3D" icon={<Boxes className="h-3 w-3" />}>
            <Row label="Forma">
              <select
                value={clip.object3d.shape}
                onChange={(e) => patch({ object3d: { ...clip.object3d!, shape: e.target.value } })}
                className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
              >
                {['box', 'sphere', 'torus', 'knot', 'plane'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Row>
            <Row label="Cor">
              <input type="color" value={clip.object3d.color} onChange={(e) => patch({ object3d: { ...clip.object3d!, color: e.target.value } })} className="h-8 w-full rounded-lg border border-white/10 bg-black/30" />
            </Row>
            <Slider label="Metal" value={clip.object3d.metalness} min={0} max={1} step={0.05} onChange={(v) => patch({ object3d: { ...clip.object3d!, metalness: v } })} />
            <Slider label="Giro contínuo" value={clip.object3d.spin} min={0} max={3} step={0.1} onChange={(v) => patch({ object3d: { ...clip.object3d!, spin: v } })} />
          </Card>
        ) : null}

        {current === 'text' && clip.text ? (
          <Card title="Texto" icon={<Type className="h-3 w-3" />}>
            <textarea
              value={clip.text.content}
              onChange={(e) => useStudio.getState().patchText(clip.id, { content: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] text-white outline-none focus:border-brand-400/50"
            />
            <div className="grid grid-cols-2 gap-2">
              <Row label="Fonte">
                {/* Módulo 2 · Google Fonts dinâmico (CDN, sem chave e sem storage) */}
                <FontPicker
                  value={clip.text.fontFamily}
                  onChange={(family) => useStudio.getState().patchText(clip.id, { fontFamily: family })}
                />
                <select
                  aria-label="Fontes da biblioteca"
                  value={clip.text.fontFamily}
                  onChange={(e) => useStudio.getState().patchText(clip.id, { fontFamily: e.target.value })}
                  style={{ fontFamily: clip.text.fontFamily }}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
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
                  className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
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
                onChange={(e) => useStudio.getState().patchText(clip.id, { animation: e.target.value as TextProps['animation'] })}
                className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
              >
                <option value="none">Nenhuma</option>
                <option value="typewriter">Máquina de escrever</option>
                <option value="pop">Pop</option>
                <option value="fade">Fade</option>
                <option value="karaoke">Karaokê (palavra acende)</option>
                <option value="popup">Pop-up dinâmico</option>
                <option value="banner">Impacto banner</option>
              </select>
            </Row>
            {['karaoke', 'banner'].includes(clip.text.animation) ? (
              <Row label="Cor do destaque">
                <input
                  type="color"
                  value={clip.text.highlight || '#facc15'}
                  onChange={(e) => useStudio.getState().patchText(clip.id, { highlight: e.target.value })}
                  className="h-6 w-full rounded border border-white/10 bg-black/30"
                />
              </Row>
            ) : null}
            {clip.text.animation === 'popup' ? (
              <label className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5 text-[10px] text-slate-300">
                Caixa branca atrás da palavra
                <input
                  type="checkbox"
                  checked={Boolean(clip.text.wordBackground)}
                  onChange={(e) => useStudio.getState().patchText(clip.id, { wordBackground: e.target.checked ? '#111827' : '' })}
                  className="h-3.5 w-3.5 accent-brand-500"
                />
              </label>
            ) : null}
          </Card>
        ) : null}

        {current === 'audio' ? (
          <Card title="Áudio" icon={<AudioLines className="h-3 w-3" />}>
            <Slider label="Volume" value={Math.round(clip.volume * 100)} min={0} max={200} suffix="%" onChange={(v) => patch({ volume: v / 100 })} />
            <label className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5 text-[10px] text-slate-300">
              Mutar som original
              <input type="checkbox" checked={clip.muted} onChange={(e) => patch({ muted: e.target.checked })} className="h-3.5 w-3.5 accent-brand-500" />
            </label>
            <Slider label="Fade in" value={clip.fadeIn} min={0} max={3} step={0.05} suffix="s" onChange={(v) => patch({ fadeIn: v })} />
            <Slider label="Fade out" value={clip.fadeOut} min={0} max={3} step={0.05} suffix="s" onChange={(v) => patch({ fadeOut: v })} />
            {clip.kind === 'video' ? (
              <button
                onClick={() => useStudio.getState().extractAudio(clip.id)}
                className="w-full rounded-lg border border-brand-400/40 bg-brand-500/15 py-1.5 text-[10px] font-semibold text-brand-100 hover:bg-brand-500/25"
              >
                Extrair áudio para uma trilha nova
              </button>
            ) : null}

            {clip.kind === 'video' ? (
              <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                <label className="flex items-center justify-between text-[10px] font-semibold text-slate-300">
                  Remover fundo verde (chroma key)
                  <input
                    type="checkbox"
                    checked={Boolean(clip.chroma?.enabled)}
                    onChange={(e) =>
                      patch({
                        chroma: {
                          enabled: e.target.checked,
                          color: clip.chroma?.color ?? 'verde',
                          tolerance: clip.chroma?.tolerance ?? 0.42,
                          softness: clip.chroma?.softness ?? 0.18,
                          spill: clip.chroma?.spill ?? 0.6,
                        },
                      })
                    }
                    className="h-3.5 w-3.5 accent-brand-500"
                  />
                </label>
                {clip.chroma?.enabled ? (
                  <>
                    <p className="text-[9px] leading-relaxed text-slate-500">
                      Deixe um clipe de cenário embaixo na timeline: o fundo do vídeo fica transparente em tempo
                      real, no navegador.
                    </p>
                    <div className="flex gap-1">
                      {(['verde', 'azul'] as const).map((cor) => (
                        <button
                          key={cor}
                          onClick={() => patch({ chroma: { ...clip.chroma!, color: cor } })}
                          className={cn(
                            'flex-1 rounded-md border px-1.5 py-0.5 text-[9px] capitalize',
                            (clip.chroma?.color ?? 'verde') === cor
                              ? 'border-brand-400 bg-brand-500/20 text-white'
                              : 'border-white/12 text-slate-300',
                          )}
                        >
                          {cor}
                        </button>
                      ))}
                    </div>
                    <Slider
                      label="Tolerância"
                      value={Math.round((clip.chroma?.tolerance ?? 0.42) * 100)}
                      min={10}
                      max={90}
                      suffix="%"
                      onChange={(v) => patch({ chroma: { ...clip.chroma!, enabled: true, tolerance: v / 100 } })}
                    />
                    <Slider
                      label="Suavizar borda"
                      value={Math.round((clip.chroma?.softness ?? 0.18) * 100)}
                      min={1}
                      max={60}
                      suffix="%"
                      onChange={(v) => patch({ chroma: { ...clip.chroma!, enabled: true, softness: v / 100 } })}
                    />
                    <Slider
                      label="Tirar reflexo"
                      value={Math.round((clip.chroma?.spill ?? 0.6) * 100)}
                      min={0}
                      max={100}
                      suffix="%"
                      onChange={(v) => patch({ chroma: { ...clip.chroma!, enabled: true, spill: v / 100 } })}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}

        {current === 'time' ? (
          <Card title="Tempo" icon={<KeyRound className="h-3 w-3" />}>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="Início (s)" value={clip.start} step={0.1} onChange={(v) => patch({ start: Math.max(0, v) })} />
              <NumberInput label="Duração (s)" value={clip.duration} step={0.1} onChange={(v) => patch({ duration: Math.max(0.1, v) })} />
              <NumberInput label="Trim início" value={clip.trimStart} step={0.1} onChange={(v) => patch({ trimStart: Math.max(0, v) })} />
              <NumberInput label="Velocidade" value={clip.speed} step={0.05} onChange={(v) => patch({ speed: Math.min(4, Math.max(0.25, v)) })} />
            </div>
            <Slider label="Fade in" value={clip.fadeIn} min={0} max={3} step={0.05} suffix="s" onChange={(v) => patch({ fadeIn: v })} />
            <Slider label="Fade out" value={clip.fadeOut} min={0} max={3} step={0.05} suffix="s" onChange={(v) => patch({ fadeOut: v })} />
          </Card>
        ) : null}

        {current === 'transitions' ? (
          <Card title="Transições" icon={<Sliders className="h-3 w-3" />}>
            {(() => {
              const sameTrack = clips.filter((c) => c.trackId === clip.trackId && c.id !== clip.id);
              const next = sameTrack.find((c) => Math.abs(c.start - (clip.start + clip.duration)) < 0.25);
              const prev = sameTrack.find((c) => Math.abs(c.start + c.duration - clip.start) < 0.25);
              const neighbor = next ?? prev;
              if (!neighbor) return null;
              return (
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-2">
                  <p className="text-[10px] font-semibold text-amber-200">Transição no corte</p>
                  <p className="mt-0.5 text-[9px] leading-snug text-amber-100/70">
                    {next ? 'Aplicar entre este clipe e o próximo' : 'Aplicar entre o clipe anterior e este'}
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <select
                      value={cutType}
                      onChange={(e) => setCutType(e.target.value as TransitionType)}
                      className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[10px] text-white outline-none"
                    >
                      {TRANSITIONS.filter((t) => t !== 'none').map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0.1}
                      max={2}
                      step={0.1}
                      value={cutDuration}
                      onChange={(e) => setCutDuration(Number(e.target.value) || 0.5)}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-white outline-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const ok = useStudio.getState().applyCutTransition(clip.id, cutType, cutDuration);
                      if (ok) {
                        setJustApplied('Transição aplicada no corte.');
                        setTimeout(() => setJustApplied(null), 2500);
                      }
                    }}
                    className="mt-1.5 w-full rounded-lg bg-amber-500/90 py-1 text-[10px] font-bold text-black hover:bg-amber-400"
                  >
                    Aplicar no corte
                  </button>
                  {justApplied ? <p className="mt-1 text-[9px] text-emerald-300">{justApplied}</p> : null}
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-2">
              <Row label="Entrada">
                <select
                  value={clip.transitionIn.type}
                  onChange={(e) => patch({ transitionIn: { ...clip.transitionIn, type: e.target.value as TransitionType } })}
                  className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
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
                  className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
                >
                  {TRANSITIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Row>
            </div>
            <Slider label="Duração entrada" value={clip.transitionIn.duration} min={0.1} max={2} step={0.05} suffix="s" onChange={(v) => patch({ transitionIn: { ...clip.transitionIn, duration: v } })} />
            <Slider label="Duração saída" value={clip.transitionOut.duration} min={0.1} max={2} step={0.05} suffix="s" onChange={(v) => patch({ transitionOut: { ...clip.transitionOut, duration: v } })} />
          </Card>
        ) : null}

        {current === 'keyframes' ? (
          <Card title="Keyframes" icon={<Diamond className="h-3 w-3" />}>
            <p className="text-[9px] text-slate-500">Playhead em {playhead.toFixed(2)}s — grave o valor atual de cada propriedade.</p>
            <div className="grid grid-cols-2 gap-1">
              {keyframeProps.map((prop) => (
                <button
                  key={prop}
                  onClick={() => useStudio.getState().addKeyframe(clip.id, prop, keyframeValue(prop))}
                  className="rounded-lg border border-white/10 py-1 text-[9px] text-slate-300 hover:border-amber-400/40 hover:text-amber-200"
                >
                  + {prop}
                </button>
              ))}
            </div>
            {clip.keyframes.length ? (
              <ul className="space-y-1">
                {clip.keyframes.map((k) => (
                  <li key={k.id} className="flex items-center gap-2 rounded bg-black/30 px-1.5 py-1 text-[9px] text-slate-300">
                    <span className="font-mono text-amber-300">{k.prop}</span>
                    <span>{k.t.toFixed(2)}s</span>
                    <span className="ml-auto">{Math.round(k.value * 100) / 100}</span>
                    <button onClick={() => useStudio.getState().removeKeyframe(clip.id, k.id)} className="text-slate-500 hover:text-rose-300">
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[9px] text-slate-600">Nenhum keyframe — use os botões acima ou “Girar 360°”.</p>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
