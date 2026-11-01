'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  Check,
  Clock,
  Download,
  FileCode2,
  FileUp,
  Globe,
  Image as ImageIcon,
  Layers,
  Lock,
  Mic,
  Music4,
  Plus,
  Search,
  Sparkles,
  Type,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react';
import { useStudio, DEFAULT_TEXT, DEFAULT_GENERATOR } from './store';
import { cn } from '@/lib/utils';
import { useProGate, useSubscription } from '@/components/billing/SubscriptionContext';
import { presetDuration } from './audio';
import { TtsPanel } from './TtsPanel';
import { parseTimelineFile } from '@/lib/timeline-io';
import { AssetThumb } from '@/components/media/AssetThumb';
import { probeMediaDuration, resolveInsertStart } from '@/lib/media-probe';
import { LibraryStock } from './LibraryStock';
import { CaptionTemplates } from './CaptionTemplates';
import { CAPTION_TEMPLATES } from './caption-presets';
import type { Asset, Clip, UserAsset } from '@/lib/types';

const TEXT_PRESETS: { name: string; text: Partial<Clip['text']> }[] = [
  { name: 'Título', text: { content: 'TÍTULO IMPACTANTE', fontSize: 96, weight: 900, fontFamily: 'Bebas Neue', color: '#ffffff', letterSpacing: 1 } },
  { name: 'Legenda', text: { content: 'Sua legenda aqui', fontSize: 52, weight: 600, background: 'rgba(0,0,0,0.55)', color: '#ffffff' } },
  { name: 'Lower third', text: { content: 'Nome\nCargo ou @perfil', fontSize: 44, weight: 700, align: 'left', color: '#ffffff', background: 'rgba(99,102,241,0.75)' } },
  { name: 'CTA', text: { content: 'SIGA PARA MAIS', fontSize: 64, weight: 800, gradient: '#a5b4fc,#22d3ee', animation: 'pop' } },
  { name: 'Neon', text: { content: 'NEON', fontSize: 110, weight: 900, color: '#22d3ee', shadow: true, stroke: 0, animation: 'pop' } },
  { name: 'Data', text: { content: '2026', fontSize: 160, weight: 900, fontFamily: 'Anton', color: '#ffffff', letterSpacing: 6 } },
  { name: 'Legenda forte', text: { content: 'ELE JOGA DEMAIS', fontSize: 84, weight: 900, fontFamily: 'Anton', color: '#22c55e', stroke: 6, strokeColor: '#0b0f0a', letterSpacing: 1, animation: 'pop' } },
  { name: 'Legenda branca', text: { content: 'ASSISTA ATÉ O FIM', fontSize: 76, weight: 900, fontFamily: 'Anton', color: '#ffffff', stroke: 7, strokeColor: '#111827', animation: 'fade' } },
];

/** Copy de propaganda pronta — sem marcas registradas, no estilo de vitrine/oferta. */
const AD_TEXT: { name: string; text: Partial<Clip['text']> }[] = [
  { name: '50% OFF', text: { content: '50% OFF', fontSize: 150, weight: 900, fontFamily: 'Anton', color: '#ffffff', stroke: 8, strokeColor: '#ef4444', letterSpacing: 2, animation: 'pop' } },
  { name: 'FRETE GRÁTIS', text: { content: 'FRETE GRÁTIS', fontSize: 92, weight: 800, fontFamily: 'Montserrat', color: '#ffffff', background: 'rgba(16,185,129,0.92)', animation: 'pop' } },
  { name: 'Só hoje', text: { content: 'SÓ HOJE', fontSize: 104, weight: 900, fontFamily: 'Bebas Neue', color: '#111827', background: 'rgba(250,204,21,0.95)', letterSpacing: 3 } },
  { name: 'Preço', text: { content: 'R$ 99,90', fontSize: 128, weight: 900, fontFamily: 'Anton', color: '#ffffff', stroke: 10, strokeColor: '#0ea5e9' } },
  { name: 'De/Por', text: { content: 'DE R$ 199\nPOR R$ 99,90', fontSize: 78, weight: 800, fontFamily: 'Montserrat', color: '#ffffff', gradient: '#fbbf24,#f97316', align: 'center' } },
  { name: 'Avaliação', text: { content: '★★★★★ 4,9', fontSize: 76, weight: 700, color: '#fbbf24', background: 'rgba(0,0,0,0.55)' } },
  { name: 'Cupom', text: { content: 'CUPOM: BEMVINDO10', fontSize: 62, weight: 800, fontFamily: 'Montserrat', color: '#111827', background: 'rgba(255,255,255,0.95)', letterSpacing: 1 } },
  { name: 'Últimas unidades', text: { content: 'ÚLTIMAS UNIDADES', fontSize: 66, weight: 800, fontFamily: 'Anton', color: '#fecaca', background: 'rgba(153,27,27,0.92)', animation: 'fade' } },
  { name: 'Entrega rápida', text: { content: 'ENTREGA RÁPIDA', fontSize: 64, weight: 700, fontFamily: 'Montserrat', color: '#ffffff', background: 'rgba(220,38,38,0.9)' } },
  { name: 'Chamada', text: { content: 'COMPRE AGORA', fontSize: 84, weight: 900, fontFamily: 'Anton', color: '#ffffff', gradient: '#f472b6,#f97316', animation: 'pop' } },
];

const TABS = [
  { id: 'elements', label: 'Elementos', icon: Sparkles },
  { id: 'files', label: 'Arquivos', icon: ImageIcon },
  { id: 'text', label: 'Texto', icon: Type },
  { id: 'object3d', label: '3D', icon: Boxes },
  { id: 'sounds', label: 'Sons', icon: Music4 },
  { id: 'transitions', label: 'Efeitos', icon: Wand2 },
  { id: 'voice', label: 'Voz IA', icon: Mic },
  { id: 'stock', label: 'Bancos', icon: Globe },
  { id: 'import', label: 'Importar', icon: FileUp },
] as const;

type TabId = (typeof TABS)[number]['id'];

const CATEGORIES = [
  { id: 'all', label: 'Tudo' },
  { id: 'fundos', label: 'Fundos' },
  { id: 'promo', label: 'Promo / vitrine' },
  { id: 'imagens', label: 'Imagens' },
  { id: 'animados', label: 'Fundos animados' },
  { id: 'stickers', label: 'Formas' },
  { id: 'fontes', label: 'Fontes' },
  { id: 'overlays', label: 'Efeitos de tela' },
] as const;

function assetKind(a: Asset): Clip['kind'] {
  if (a.type === 'generator') return 'generator';
  if (a.type === 'sticker') return 'sticker';
  if (a.type === 'object3d') return 'object3d';
  if (a.type === 'overlay') return 'overlay';
  if (a.type === 'sfx') return 'sfx';
  if (a.type === 'music') return 'music';
  if (a.type === 'audio') return 'audio';
  if (a.type === 'image') return 'image';
  return 'video';
}

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
  // Free/Pro vem do contexto global (com fallback no prop do servidor)
  const requirePro = useProGate();
  const { isPro } = useSubscription();
  const proUnlocked = premiumAllowed || isPro;

  const [tab, setTab] = useState<TabId>('elements');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [warn, setWarn] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  function flash(message: string) {
    setWarn(message);
    setTimeout(() => setWarn(null), 3600);
  }

  function targetTrack(kind: Clip['kind']) {
    const s = useStudio.getState();
    const isAudio = ['audio', 'sfx', 'music'].includes(kind);
    const existing = s.tracks.find((t) => t.kind === (isAudio ? 'audio' : 'visual'));
    if (existing) return existing.id;
    s.addTrack(isAudio ? 'audio' : 'visual');
    const updated = useStudio.getState().tracks.filter((t) => t.kind === (isAudio ? 'audio' : 'visual'));
    return updated[updated.length - 1]?.id ?? s.tracks[0]?.id ?? '';
  }

  function addToTimeline(partial: Partial<Clip> & { kind: Clip['kind']; src: string; name: string; duration: number }) {
    const s = useStudio.getState();
    const trackId = targetTrack(partial.kind);
    // Módulo 1 · bug da timeline: todo elemento novo entra no INÍCIO (0).
    // Arrastar direto na régua continua respeitando o ponto onde foi solto.
    const start = resolveInsertStart(s);
    s.addClip({ ...partial, trackId, start, duration: partial.duration } as never);
    useStudio.getState().select(useStudio.getState().clips[useStudio.getState().clips.length - 1]?.id ?? null);
  }

  async function addUserAsset(asset: UserAsset) {
    const kind = asset.type === 'audio' ? 'audio' : asset.type === 'video' ? 'video' : 'image';
    const known = Number(asset.metadata?.duration ?? 0) || null;
    // vídeo/áudio baixado não guarda duração no storage: lemos do próprio arquivo
    const real =
      kind === 'image'
        ? null
        : known || (await probeMediaDuration(asset.url, kind === 'audio' ? 'audio' : 'video'));
    addToTimeline({
      kind,
      src: asset.url,
      name: asset.name,
      duration: kind === 'image' ? 5 : Math.min(real || 6, 600),
      sourceDuration: real || known || undefined,
    });
  }

  async function addBuiltin(asset: Asset) {
    // Item com cadeado abre o modal de upgrade (checkout real) em vez de
    // simplesmente recusar — mesmo comportamento em desktop e mobile.
    if (!requirePro(asset, asset.premium ? proUnlocked : true)) return;
    const url = asset.url ?? '';
    if (asset.type === 'transition') {
      const selected = useStudio.getState().selectedId;
      if (!selected) {
        flash('Selecione um clipe na timeline para aplicar a transição.');
        return;
      }
      const preset = url.replace('builtin:', '') as Clip['transitionIn']['type'];
      useStudio.getState().updateClip(selected, { transitionIn: { type: preset, duration: 0.6 } });
      return;
    }
    if (asset.type === 'font') {
      const selected = useStudio.getState().clips.find((c) => c.id === useStudio.getState().selectedId);
      if (selected?.kind === 'text') {
        useStudio.getState().patchText(selected.id, { fontFamily: url.replace('font:', '') });
      } else {
        flash('Selecione um texto na timeline para aplicar a fonte.');
      }
      return;
    }
    if (asset.type === 'sfx' || asset.type === 'music') {
      addToTimeline({
        kind: asset.type,
        src: url,
        name: asset.name,
        duration: presetDuration(url.replace('builtin:', '')),
        volume: asset.type === 'music' ? 0.6 : 0.9,
      });
      return;
    }
    if (asset.type === 'generator') {
      const meta = (asset.metadata ?? {}) as { preset?: string; colorA?: string; colorB?: string };
      addToTimeline({
        kind: 'generator',
        src: url,
        name: asset.name,
        duration: Math.max(6, useStudio.getState().duration),
        generator: {
          ...DEFAULT_GENERATOR,
          preset: meta.preset ?? 'aurora',
          colorA: meta.colorA ?? '#4f46e5',
          colorB: meta.colorB ?? '#22d3ee',
        },
      });
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
      addToTimeline({ kind: 'sticker', src: url, name: asset.name, duration: 4, sticker: { preset: url.replace('builtin:', ''), color: '#f97316' } });
      return;
    }
    // imagens e vídeos da biblioteca (duração real quando for vídeo)
    if (asset.type === 'image') {
      addToTimeline({ kind: 'image', src: url, name: asset.name, duration: 5 });
      return;
    }
    const known = Number(asset.metadata?.duration ?? 0) || null;
    const real = known || (await probeMediaDuration(url, 'video'));
    addToTimeline({
      kind: 'video',
      src: url,
      name: asset.name,
      duration: Math.min(real ?? 8, 600),
      sourceDuration: real ?? undefined,
    });
  }



  function dragPayload(e: React.DragEvent, asset: Asset) {
    const kind = assetKind(asset);
    const meta = (asset.metadata ?? {}) as { preset?: string; colorA?: string; colorB?: string; shape?: string };
    const payload: Record<string, unknown> = {
      kind,
      src: asset.url ?? '',
      name: asset.name,
      duration: kind === 'image' || kind === 'object3d' || kind === 'sticker' ? 5 : kind === 'generator' ? Math.max(6, useStudio.getState().duration) : Number(asset.metadata?.duration ?? 8),
    };
    if (kind === 'generator') payload.generator = { ...DEFAULT_GENERATOR, preset: meta.preset ?? 'aurora', colorA: meta.colorA ?? '#4f46e5', colorB: meta.colorB ?? '#22d3ee' };
    if (kind === 'object3d') payload.object3d = { shape: meta.shape ?? 'box', color: '#818cf8', metalness: 0.45, spin: 0.7 };
    if (kind === 'sticker') payload.sticker = { preset: (asset.url ?? '').replace('builtin:', ''), color: '#f97316' };
    if (kind === 'overlay') payload.overlay = { preset: (asset.url ?? '').replace('builtin:', '') };
    if (kind === 'sfx' || kind === 'music') payload.duration = presetDuration((asset.url ?? '').replace('builtin:', ''));
    e.dataTransfer.setData('application/x-studio-clip', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const parsed = parseTimelineFile(text, file.name);
      const s = useStudio.getState();
      const existing = new Set(s.tracks.map((t) => t.id));
      const tracks = [...s.tracks, ...parsed.tracks.filter((t) => !existing.has(t.id))];
      const clips = [...s.clips, ...parsed.clips];
      useStudio.setState({
        tracks,
        clips,
        duration: Math.max(s.duration, Math.ceil(parsed.duration)),
        playhead: 0,
        selectedId: parsed.clips[0]?.id ?? null,
        dirty: true,
      });
      setNote(
        `${file.name}: ${parsed.clips.length} clipe(s) e ${parsed.tracks.length} trilha(s) adicionados na timeline.` +
          (parsed.warnings.length ? ` ${parsed.warnings[0]}` : ''),
      );
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.');
    }
  }

  const matches = (a: Asset) => {
    if (query && !`${a.name} ${a.category} ${a.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (category === 'all') return true;
    if (category === 'animados') return a.type === 'generator';
    if (category === 'fundos') return a.category === 'fundos';
    if (category === 'promo') return a.category === 'promo';
    if (category === 'imagens') return a.type === 'image';
    if (category === 'stickers') return a.type === 'sticker';
    if (category === 'fontes') return a.type === 'font';
    if (category === 'overlays') return a.type === 'overlay';
    return true;
  };

  const visualAssets = assets.filter((a) => ['image', 'video', 'generator'].includes(a.type) && matches(a));
  const stickerAssets = assets.filter((a) => a.type === 'sticker' && matches(a));
  const fontAssets = assets.filter((a) => a.type === 'font' && matches(a));
  const overlayAssets = assets.filter((a) => a.type === 'overlay' && matches(a));

  const filteredAssets = (types: string[]) =>
    assets.filter((a) => types.includes(a.type) && (!query || `${a.name} ${a.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())));

  const filteredFiles = userAssets.filter((a) => !query || a.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-ink-900">
      <div className="flex gap-1 overflow-x-auto border-b border-white/5 p-1.5 no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition',
              tab === t.id ? 'bg-brand-500/25 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab !== 'import' && tab !== 'voice' ? (
        <div className="border-b border-white/5 p-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar elemento, fundo, fonte…"
              className="w-full bg-transparent py-1.5 text-[11px] text-white outline-none placeholder:text-slate-600"
            />
          </div>
        </div>
      ) : null}

      {warn ? <div className="mx-2 mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">{warn}</div> : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {/* ELEMENTOS */}
        {tab === 'elements' ? (
          <div className="space-y-3">
            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition',
                    category === c.id ? 'border-brand-400/50 bg-brand-500/20 text-white' : 'border-white/10 text-slate-400 hover:text-white',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <p className="px-1 text-[10px] leading-relaxed text-slate-500">
              Toque para adicionar no playhead ou arraste para a timeline. Tudo editável no painel da direita.
            </p>

            {(category === 'all' || category === 'fundos' || category === 'promo' || category === 'imagens' || category === 'animados') && visualAssets.length ? (
              <div className="grid grid-cols-2 gap-2">
                {visualAssets.map((a) => (
                  <button
                    key={a.id}
                    draggable
                    onDragStart={(e) => dragPayload(e, a)}
                    onClick={() => void addBuiltin(a)}
                    className="group overflow-hidden rounded-lg border border-white/8 bg-white/[0.03] text-left transition hover:border-brand-400/50"
                  >
                    <div className="relative aspect-video overflow-hidden bg-ink-950">
                      {a.url && a.type === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                      ) : a.type === 'generator' ? (
                        <div
                          className="h-full w-full"
                          style={{
                            background: `radial-gradient(circle at 30% 30%, ${String(a.metadata?.colorB ?? '#22d3ee')}, ${String(a.metadata?.colorA ?? '#4f46e5')} 65%, #05060a)`,
                          }}
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-[10px] uppercase text-slate-500">{a.type}</div>
                      )}
                      {a.type === 'generator' ? (
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[8px] font-bold uppercase text-cyan-200">animado</span>
                      ) : null}
                      {a.premium && !proUnlocked ? (
                        <span className="absolute right-1 top-1 rounded bg-black/70 p-0.5 text-amber-300"><Lock className="h-2.5 w-2.5" /></span>
                      ) : null}
                    </div>
                    <p className="truncate px-1.5 py-1 text-[10px] font-medium text-slate-200">{a.name}</p>
                  </button>
                ))}
              </div>
            ) : null}

            {(category === 'all' || category === 'stickers') && stickerAssets.length ? (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Formas & selos de oferta</p>
                <div className="grid grid-cols-3 gap-2">
                  {stickerAssets.map((a) => (
                    <button
                      key={a.id}
                      draggable
                      onDragStart={(e) => dragPayload(e, a)}
                      onClick={() => void addBuiltin(a)}
                      className="rounded-lg border border-white/8 bg-white/[0.03] px-1 py-2 text-[9px] font-semibold text-slate-200 hover:border-brand-400/50"
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {(category === 'all' || category === 'fontes') && fontAssets.length ? (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Fontes</p>
                <div className="grid grid-cols-2 gap-2">
                  {fontAssets.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => void addBuiltin(a)}
                      style={{ fontFamily: (a.url ?? '').replace('font:', '') }}
                      className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-2 text-left text-[12px] text-white hover:border-brand-400/50"
                    >
                      {a.name}
                      <span className="block text-[8px] font-normal text-slate-500">Aa Bb 123</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {(category === 'all' || category === 'overlays') && overlayAssets.length ? (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Efeitos de tela</p>
                <div className="grid grid-cols-2 gap-2">
                  {overlayAssets.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => void addBuiltin(a)}
                      className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-2 text-[10px] text-slate-200 hover:border-brand-400/50"
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {!visualAssets.length && !stickerAssets.length && !fontAssets.length && !overlayAssets.length ? (
              <EmptyHint text="Nenhum elemento com esse filtro. Limpe a busca ou escolha outro tipo." />
            ) : null}
          </div>
        ) : null}

        {/* ARQUIVOS */}
        {tab === 'files' ? (
          filteredFiles.length === 0 ? (
            <EmptyHint text="Envie arquivos em “Meus arquivos” ou traga mídia com o Baixa Tudo." />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredFiles.map((f) => (
                <button
                  key={f.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      'application/x-studio-clip',
                      JSON.stringify({ kind: f.type === 'audio' ? 'audio' : f.type === 'video' ? 'video' : 'image', src: f.url, name: f.name, duration: f.type === 'image' ? 5 : Math.min(f.metadata?.duration || 6, 600) }),
                    )
                  }
                  onClick={() => void addUserAsset(f)}
                  className="group overflow-hidden rounded-lg border border-white/8 bg-white/[0.03] text-left transition hover:border-brand-400/40"
                >
                  <AssetThumb
                    type={f.type}
                    url={f.url}
                    thumbnail={(f.metadata as { thumbnail?: string } | null)?.thumbnail ?? null}
                    className="aspect-video w-full"
                  />
                  <p className="truncate px-1.5 py-1 text-[10px] text-slate-300">{f.name}</p>
                </button>
              ))}
            </div>
          )
        ) : null}

        {tab === 'text' ? (
          <div className="space-y-3">
            {/* Legendas animadas (Karaokê / Pop-up / Impacto Banner) */}
            <CaptionTemplates onApplied={(msg) => flash(msg)} />

            <p className="text-[10px] uppercase tracking-wider text-slate-500">Modelos de legenda animada</p>
            <div className="grid grid-cols-3 gap-1.5">
              {CAPTION_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() =>
                    addToTimeline({
                      kind: 'text',
                      src: 'text',
                      name: template.name,
                      duration: 4,
                      text: {
                        ...DEFAULT_TEXT,
                        content: template.id === 'banner' ? 'IMPACTO BANNER' : 'ESSA LEGENDA ACENDE',
                        ...template.text,
                      } as Clip['text'],
                    })
                  }
                  className="rounded-lg border border-white/8 bg-gradient-to-br from-brand-500/15 to-transparent p-2 text-left text-[10px] font-semibold text-white hover:border-brand-400/50"
                >
                  {template.name}
                  <span className="mt-0.5 block text-[8px] font-normal leading-tight text-slate-400">{template.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Copy de propaganda</p>
            <div className="grid grid-cols-2 gap-2">
              {AD_TEXT.map((p) => (
                <button
                  key={p.name}
                  onClick={() =>
                    addToTimeline({ kind: 'text', src: 'text', name: p.name, duration: 4, text: { ...DEFAULT_TEXT, ...p.text } as Clip['text'] })
                  }
                  className="rounded-lg border border-white/8 bg-gradient-to-br from-orange-500/15 to-transparent p-2 text-left text-[11px] font-semibold text-white hover:border-orange-400/50"
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="pt-1 text-[10px] uppercase tracking-wider text-slate-500">Títulos e legendas</p>
            <div className="grid grid-cols-2 gap-2">
              {TEXT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() =>
                    addToTimeline({ kind: 'text', src: 'text', name: p.name, duration: 4, text: { ...DEFAULT_TEXT, ...p.text } as Clip['text'] })
                  }
                  className="rounded-lg border border-white/8 bg-gradient-to-br from-fuchsia-500/15 to-transparent p-2 text-left text-[11px] font-semibold text-white hover:border-fuchsia-400/40"
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="pt-1 text-[10px] uppercase tracking-wider text-slate-500">Formas & efeitos</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => addToTimeline({ kind: 'sticker', src: 'builtin:burst', name: 'Explosão', duration: 4, sticker: { preset: 'burst', color: '#f97316' } })}
                className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-left text-[11px] text-slate-300 hover:border-brand-400/40"
              >
                + Explosão de oferta
              </button>
              <button
                onClick={() => addToTimeline({ kind: 'overlay', src: 'builtin:vignette', name: 'Vinheta', duration: Math.max(5, useStudio.getState().duration), overlay: { preset: 'vignette' } })}
                className="rounded-lg border border-white/8 bg-white/[0.03] p-2 text-left text-[11px] text-slate-300 hover:border-brand-400/40"
              >
                + Vinheta
              </button>
            </div>
          </div>
        ) : null}

        {/* 3D */}
        {tab === 'object3d' ? (
          <div className="space-y-2">
            <p className="text-[10px] leading-relaxed text-slate-500">
              Objetos WebGL com giro em X, Y e Z (360°). Ajuste rotação, cor, metal e sombra no inspetor.
            </p>
            {filteredAssets(['object3d']).map((a) => (
              <AssetRow key={a.id} asset={a} locked={a.premium && !proUnlocked} onClick={() => void addBuiltin(a)} icon={<Boxes className="h-3.5 w-3.5" />} hint={String(a.metadata?.shape ?? '')} />
            ))}
          </div>
        ) : null}

        {/* SONS */}
        {tab === 'sounds' ? (
          <div className="space-y-2">
            {(byType.get('sfx') ?? []).length ? <p className="text-[10px] uppercase tracking-wider text-slate-500">Efeitos</p> : null}
            {filteredAssets(['sfx']).map((a) => (
              <AssetRow key={a.id} asset={a} locked={a.premium && !proUnlocked} onClick={() => void addBuiltin(a)} icon={<Zap className="h-3.5 w-3.5" />} />
            ))}
            {(byType.get('music') ?? []).length ? <p className="pt-2 text-[10px] uppercase tracking-wider text-slate-500">Trilhas</p> : null}
            {filteredAssets(['music']).map((a) => (
              <AssetRow key={a.id} asset={a} locked={a.premium && !proUnlocked} onClick={() => void addBuiltin(a)} icon={<Music4 className="h-3.5 w-3.5" />} />
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
                  setNote('Áudio importado como prévia local. Envie em “Meus arquivos” para salvar no projeto.');
                };
                input.click();
              }}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-white/12 py-2 text-[11px] text-slate-400 hover:border-brand-400/40 hover:text-white"
            >
              <Upload className="h-3.5 w-3.5" /> Importar áudio rápido
            </button>
          </div>
        ) : null}

        {/* EFEITOS / TRANSIÇÕES */}
        {tab === 'transitions' ? (
          <div className="space-y-2">
            <p className="text-[10px] leading-relaxed text-slate-500">Selecione um clipe e toque para aplicar a transição.</p>
            {filteredAssets(['transition']).map((a) => (
              <AssetRow key={a.id} asset={a} locked={a.premium && !proUnlocked} onClick={() => void addBuiltin(a)} />
            ))}
          </div>
        ) : null}

        {/* VOZ IA */}
        {tab === 'voice' ? <TtsPanel projectId={projectId} onAdded={() => router.refresh()} /> : null}

        {/* IMPORTAR */}
        {tab === 'stock' ? (
          <LibraryStock
            onPick={async (item) => {
              // salva no storage do usuário e entra na timeline com a duração real
              const res = await fetch('/api/stock/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: item.url, name: item.title || item.kind, kind: item.kind }),
              });
              const data = (await res.json()) as { asset?: { url: string; name: string }; error?: string };
              if (!res.ok || !data.asset) {
                flash(data.error || 'Não foi possível salvar este arquivo.');
                return;
              }
              const kind = item.kind === 'audio' ? 'audio' : item.kind === 'video' ? 'video' : 'image';
              const real = kind === 'image' ? null : await probeMediaDuration(data.asset.url, kind === 'audio' ? 'audio' : 'video');
              addToTimeline({
                kind,
                src: data.asset.url,
                name: data.asset.name,
                duration: kind === 'image' ? 5 : Math.min(real ?? 8, 600),
                sourceDuration: real ?? undefined,
                volume: kind === 'audio' ? 0.9 : 1,
              });
            }}
          />
        ) : null}

        {tab === 'import' ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                <FileCode2 className="h-3.5 w-3.5 text-brand-300" /> Trazer arquivo para a timeline
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                XML do Premiere/Final Cut (.xml/.xmeml), legendas (.srt), roteiro (.csv) ou JSON exportado do Editor Studio.
                Os cortes, tempos e trilhas são recriados aqui.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xml,.xmeml,.fcpxml,.srt,.json,.csv,text/xml,application/xml,text/plain,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImport(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 py-2 text-[11px] font-bold text-white"
              >
                <Upload className="h-3.5 w-3.5" /> Escolher arquivo
              </button>
              {note ? (
                <p className="mt-2 flex items-start gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-200">
                  <Check className="mt-0.5 h-3 w-3 shrink-0" /> {note}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[10px] leading-relaxed text-slate-400">
              <p className="font-semibold text-white">Como exportar do Premiere</p>
              <p className="mt-1">Arquivo › Exportar › Final Cut Pro XML. Depois importe esse XML aqui — a timeline vem com os cortes.</p>
              <p className="mt-2 font-semibold text-white">Exportar do Editor Studio</p>
              <p className="mt-1">Use o botão “Exportar” no topo do editor → “Timeline XML/JSON”.</p>
            </div>
          </div>
        ) : null}
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
