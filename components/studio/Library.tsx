'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  Clock,
  Download,
  Image as ImageIcon,
  Lock,
  Mic,
  Music4,
  Plus,
  Search,
  Sparkles,
  Type,
  Wand2,
  Zap,
} from 'lucide-react';
import { useStudio } from './store';
import { DEFAULT_TEXT } from './store';
import { cn } from '@/lib/utils';
import { presetDuration } from './audio';
import { TtsPanel } from './TtsPanel';
import type { Asset, Clip, UserAsset } from '@/lib/types';

const TEXT_PRESETS: { name: string; text: Partial<Clip['text']> }[] = [
  { name: 'Título', text: { content: 'TÍTULO IMPACTANTE', fontSize: 96, weight: 900, fontFamily: 'Bebas Neue', color: '#ffffff', letterSpacing: 1 } },
  { name: 'Legenda', text: { content: 'Sua legenda aqui', fontSize: 52, weight: 600, background: 'rgba(0,0,0,0.55)', color: '#ffffff' } },
  { name: 'Lower third', text: { content: 'Nome\nCargo ou @perfil', fontSize: 44, weight: 700, align: 'left', color: '#ffffff', background: 'rgba(99,102,241,0.75)' } },
  { name: 'CTA', text: { content: 'SIGA PARA MAIS', fontSize: 64, weight: 800, gradient: '#a5b4fc,#22d3ee', animation: 'pop' } },
  { name: 'Neon', text: { content: 'NEON', fontSize: 110, weight: 900, color: '#22d3ee', shadow: true, stroke: 0, animation: 'pop' } },
  { name: 'Data', text: { content: '2026', fontSize: 160, weight: 900, fontFamily: 'Anton', color: '#ffffff', letterSpacing: 6 } },
];

const TABS = [
  { id: 'files', label: 'Arquivos', icon: ImageIcon },
  { id: 'library', label: 'Biblioteca', icon: Sparkles },
  { id: 'text', label: 'Texto', icon: Type },
  { id: 'transitions', label: 'Transições', icon: Wand2 },
  { id: 'sounds', label: 'Sons', icon: Music4 },
  { id: 'object3d', label: '3D', icon: Boxes },
  { id: 'voice', label: 'Voz IA', icon: Mic },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function Library({
  assets,
  userAssets,
  premiumAllowed,
  projectId,
}: {
  assets: Asset[];
  userAssets: UserAsset[];
  premiumAllowed: boolean;
  projectId: string;
}) {
  const [tab, setTab] = useState<TabId>('files');
  const [query, setQuery] = useState('');
  const [warn, setWarn] = useState<string | null>(null);
  const router = useRouter();

  const byType = useMemo(() => {
    const map = new Map<string, Asset[]>();
    assets.forEach((a) => {
      const list = map.get(a.type) ?? [];
      list.push(a);
      map.set(a.type, list);
    });
    return map;
  }, [assets]);

  function targetTrack(preferAudio: boolean) {
    const s = useStudio.getState();
    const kind = preferAudio ? 'audio' : 'visual';
    const existing = s.tracks.find((t) => t.kind === kind);
    if (existing) return existing.id;
    s.addTrack(kind);
    const updated = useStudio.getState().tracks.filter((t) => t.kind === kind);
    return updated[updated.length - 1]?.id ?? s.tracks[0]?.id ?? '';
  }

  function addToTimeline(partial: Partial<Clip> & { kind: Clip['kind']; src: string; name: string; duration: number }) {
    const s = useStudio.getState();
    const isAudio = ['audio', 'sfx', 'music'].includes(partial.kind);
    const trackId = targetTrack(isAudio);
    const start = partial.kind === 'text' || partial.kind === 'sticker' || partial.kind === 'object3d' || partial.kind === 'overlay' ? s.playhead : s.playhead;
    s.addClip({ ...partial, trackId, start, duration: partial.duration } as never);
  }

  function addUserAsset(asset: UserAsset) {
    addToTimeline({
      kind: asset.type === 'audio' ? 'audio' : asset.type === 'video' ? 'video' : 'image',
      src: asset.url,
      name: asset.name,
      duration: asset.type === 'image' ? 5 : Math.min(asset.metadata?.duration || 6, 600),
      sourceDuration: asset.metadata?.duration,
    });
  }

  function addBuiltin(asset: Asset) {
    if (asset.premium && !premiumAllowed) {
      setWarn('Esse item é exclusivo dos planos Pro e Studio.');
      setTimeout(() => setWarn(null), 3200);
      return;
    }
    const url = asset.url ?? '';
    if (asset.type === 'transition') {
      const selected = useStudio.getState().selectedId;
      if (!selected) {
        setWarn('Selecione um clipe na timeline para aplicar a transição.');
        setTimeout(() => setWarn(null), 3200);
        return;
      }
      const preset = url.replace('builtin:', '') as Clip['transitionIn']['type'];
      useStudio.getState().updateClip(selected, { transitionIn: { type: preset, duration: Math.min(1, 0.6) } });
      return;
    }
    if (asset.type === 'font') {
      const selected = useStudio.getState().clips.find((c) => c.id === useStudio.getState().selectedId);
      if (selected?.kind === 'text') {
        useStudio.getState().patchText(selected.id, { fontFamily: url.replace('font:', '') });
      } else {
        setWarn('Selecione um texto para aplicar a fonte.');
        setTimeout(() => setWarn(null), 2500);
      }
      return;
    }
    if (asset.type === 'sfx' || asset.type === 'music') {
      addToTimeline({ kind: asset.type, src: url, name: asset.name, duration: presetDuration(url.replace('builtin:', '')), volume: asset.type === 'music' ? 0.6 : 0.9 });
      return;
    }
    if (asset.type === 'object3d') {
      const shape = String(asset.metadata?.shape ?? 'box');
      addToTimeline({ kind: 'object3d', src: url, name: asset.name, duration: 5, object3d: { shape, color: '#818cf8', metalness: 0.45, spin: 0.7 } });
      return;
    }
    if (asset.type === 'overlay') {
      addToTimeline({ kind: 'overlay', src: url, name: asset.name, duration: Math.max(5, useStudio.getState().duration), overlay: { preset: url.replace('builtin:', '') } });
      return;
    }
    if (asset.type === 'sticker') {
      addToTimeline({ kind: 'sticker', src: url, name: asset.name, duration: 5, sticker: { preset: url.replace('builtin:', ''), color: '#818cf8' } });
    }
  }

  function dragPayload(e: React.DragEvent, partial: Partial<Clip> & { kind: Clip['kind']; src: string; name: string; duration: number }) {
    e.dataTransfer.setData('application/x-studio-clip', JSON.stringify(partial));
    e.dataTransfer.effectAllowed = 'copy';
  }

  const filteredAssets = (types: string[]) =>
    assets.filter((a) => types.includes(a.type) && (!query || a.name.toLowerCase().includes(query.toLowerCase())));

  const filteredFiles = userAssets.filter(
    (a) => !query || a.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-white/8 bg-ink-900/60">
      <div className="flex gap-1 overflow-x-auto border-b border-white/5 p-1.5 no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition',
              tab === t.id ? 'bg-brand-500/20 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="border-b border-white/5 p-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou tag…"
            className="w-full bg-transparent py-1.5 text-[11px] text-white outline-none placeholder:text-slate-600"
          />
        </div>
      </div>

      {warn ? <div className="mx-2 mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">{warn}</div> : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === 'files' ? (
          filteredFiles.length === 0 ? (
            <EmptyHint text="Envie arquivos em “Meus arquivos” ou baixe mídia no Baixa Tudo." />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredFiles.map((f) => (
                <button
                  key={f.id}
                  draggable
                  onDragStart={(e) => dragPayload(e, { kind: f.type === 'audio' ? 'audio' : f.type === 'video' ? 'video' : 'image', src: f.url, name: f.name, duration: f.type === 'image' ? 5 : Math.min(f.metadata?.duration || 6, 600) })}
                  onClick={() => addUserAsset(f)}
                  className="group overflow-hidden rounded-lg border border-white/8 bg-white/[0.03] text-left transition hover:border-brand-400/40"
                >
                  <div className="relative aspect-video bg-ink-950">
                    {f.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-[10px] uppercase text-slate-500">{f.type}</div>
                    )}
                    <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white/80">
                      {f.type === 'image' ? 'IMG' : f.type === 'audio' ? 'AUD' : 'VID'}
                    </span>
                  </div>
                  <p className="truncate px-1.5 py-1 text-[10px] text-slate-300">{f.name}</p>
                </button>
              ))}
            </div>
          )
        ) : null}

        {tab === 'library' ? (
          <div className="space-y-2">
            {['video', 'image', 'audio'].map((type) =>
              (byType.get(type) ?? []).length ? (
                <div key={type}>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{type}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(byType.get(type) ?? []).map((a) => (
                      <button key={a.id} onClick={() => addBuiltin(a)} className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-left text-[11px] text-slate-300 hover:border-brand-400/40">
                        {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
            <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[10px] leading-relaxed text-slate-500">
              A biblioteca cresce com o que você baixa e envia. Baixa Tudo alimenta esta aba.
            </div>
          </div>
        ) : null}

        {tab === 'text' ? (
          <div className="grid grid-cols-2 gap-2">
            {TEXT_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() =>
                  addToTimeline({
                    kind: 'text',
                    src: 'text',
                    name: p.name,
                    duration: 4,
                    text: { ...DEFAULT_TEXT, ...p.text } as Clip['text'],
                  })
                }
                className="rounded-lg border border-white/8 bg-gradient-to-br from-fuchsia-500/15 to-transparent p-2 text-left text-[11px] font-semibold text-white hover:border-fuchsia-400/40"
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={() =>
                addToTimeline({
                  kind: 'sticker',
                  src: 'builtin:shapes',
                  name: 'Forma',
                  duration: 4,
                  sticker: { preset: 'circle', color: '#f472b6' },
                })
              }
              className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-left text-[11px] text-slate-300 hover:border-brand-400/40"
            >
              + Forma
            </button>
            <button
              onClick={() =>
                addToTimeline({
                  kind: 'overlay',
                  src: 'builtin:vignette',
                  name: 'Vinheta',
                  duration: Math.max(5, useStudio.getState().duration),
                  overlay: { preset: 'vignette' },
                })
              }
              className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-left text-[11px] text-slate-300 hover:border-brand-400/40"
            >
              + Vinheta
            </button>
          </div>
        ) : null}

        {tab === 'transitions' ? (
          <div className="space-y-2">
            <p className="text-[10px] leading-relaxed text-slate-500">Selecione um clipe e clique para aplicar.</p>
            {filteredAssets(['transition']).map((a) => (
              <AssetRow key={a.id} asset={a} locked={a.premium && !premiumAllowed} onClick={() => addBuiltin(a)} />
            ))}
          </div>
        ) : null}

        {tab === 'sounds' ? (
          <div className="space-y-2">
            {(byType.get('sfx') ?? []).length ? <p className="text-[10px] uppercase tracking-wider text-slate-500">Efeitos</p> : null}
            {filteredAssets(['sfx']).map((a) => (
              <AssetRow key={a.id} asset={a} locked={a.premium && !premiumAllowed} onClick={() => addBuiltin(a)} icon={<Zap className="h-3.5 w-3.5" />} />
            ))}
            {(byType.get('music') ?? []).length ? <p className="pt-2 text-[10px] uppercase tracking-wider text-slate-500">Trilhas</p> : null}
            {filteredAssets(['music']).map((a) => (
              <AssetRow key={a.id} asset={a} locked={a.premium && !premiumAllowed} onClick={() => addBuiltin(a)} icon={<Music4 className="h-3.5 w-3.5" />} />
            ))}
            <button
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*';
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  const objectUrl = URL.createObjectURL(file);
                  addToTimeline({ kind: 'audio', src: objectUrl, name: file.name, duration: 10, volume: 0.8 });
                  setWarn('Áudio importado como prévia local. Envie em “Meus arquivos” para salvar no projeto.');
                  setTimeout(() => setWarn(null), 4000);
                };
                input.click();
              }}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-white/12 py-2 text-[11px] text-slate-400 hover:border-brand-400/40 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" /> Importar áudio rápido
            </button>
          </div>
        ) : null}

        {tab === 'object3d' ? (
          <div className="space-y-2">
            {filteredAssets(['object3d']).map((a) => (
              <AssetRow
                key={a.id}
                asset={a}
                locked={a.premium && !premiumAllowed}
                onClick={() => addBuiltin(a)}
                icon={<Boxes className="h-3.5 w-3.5" />}
                hint={String(a.metadata?.shape ?? '')}
              />
            ))}
            <p className="pt-2 text-[10px] leading-relaxed text-slate-500">
              Objetos renderizados em WebGL com rotação em X, Y e Z. Ajuste giro e keyframes no inspetor.
            </p>
          </div>
        ) : null}

        {tab === 'voice' ? <TtsPanel projectId={projectId} onAdded={() => router.refresh()} /> : null}
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  onClick,
  locked,
  icon,
  hint,
}: {
  asset: Asset;
  onClick: () => void;
  locked?: boolean;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2 py-2 text-left text-[11px] text-slate-200 transition hover:border-brand-400/40"
    >
      <span className="grid h-6 w-6 place-items-center rounded bg-white/8 text-slate-300">{icon ?? <Sparkles className="h-3.5 w-3.5" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{asset.name}</span>
        {hint ? <span className="block text-[9px] text-slate-500">{hint}</span> : null}
      </span>
      {locked ? <Lock className="h-3 w-3 text-amber-300" /> : <Plus className="h-3.5 w-3.5 text-slate-400" />}
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-[11px] leading-relaxed text-slate-500">
      <Clock className="mx-auto mb-2 h-4 w-4" />
      {text}
    </div>
  );
}
