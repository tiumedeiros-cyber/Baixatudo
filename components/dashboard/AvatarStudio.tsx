'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Clapperboard, HelpCircle, Loader2, Play, RotateCcw, Sparkles, Wand2, X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { AvatarThumb } from '@/components/media/AvatarThumb';
import {
  AVATARS,
  EXPRESSIONS,
  FRAMINGS,
  POSES,
  SCENES,
  encodeAvatar,
  withScene,
} from '@/lib/catalog/avatars';
import type { ExpressionId, FramingId, HairStyle, PoseId, SceneId } from '@/lib/catalog/avatars';
import { VOICES, DEFAULT_VOICE } from '@/lib/catalog/voices';
import { VOICE_PRESETS } from '@/lib/voice-presets';
import { computeEnvelope, ENVELOPE_STEP } from '@/components/studio/envelope';
import { cn } from '@/lib/utils';

type Segment = { url: string; text: string; duration: number };

const LOCALES = Array.from(new Set(VOICES.map((v) => v.locale)));
const EXAMPLES = [
  'Olá! Eu sou seu avatar e vou apresentar o conteúdo do seu canal em poucos segundos.',
  'Você sabia que dá para criar um vídeo profissional sem aparecer? Eu narro para você.',
  'Olá, mundo! Esta é a minha voz em outro idioma, pronta para o seu vídeo internacional.',
  'Aproveite a promoção de hoje: 50% de desconto em todos os planos, só até meia noite.',
];
const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'curto', label: 'Curto' },
  { id: 'longo', label: 'Longo' },
  { id: 'coque', label: 'Coque' },
  { id: 'cacheado', label: 'Cacheado' },
  { id: 'franja', label: 'Franja' },
  { id: 'rabo', label: 'Rabo de cavalo' },
  { id: 'tranca', label: 'Tranças' },
  { id: 'calvo', label: 'Careca' },
];
const SKIN_TONES = ['#f8dcc8', '#f1c6a6', '#e8b894', '#dba37a', '#c88c60', '#b27c53', '#8f5c3d', '#6d4529', '#4a2c1c'];
const HAIR_COLORS = ['#111827', '#3b2418', '#6b4a2f', '#c78a3c', '#e6c88a', '#a3a3a3', '#7c2d12', '#831843'];
const SHIRTS = ['#6366f1', '#0ea5e9', '#22c55e', '#db2777', '#f59e0b', '#dc2626', '#14b8a6', '#334155', '#111827'];
const LIPS = ['#be3d5b', '#9f1239', '#b4536a', '#d94a6a', '#a21caf', '#8b4a2b'];

export function AvatarStudio({
  onCreated,
  compact = false,
}: {
  onCreated?: (url: string) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [baseId, setBaseId] = useState(AVATARS[0].id);
  const [scene, setScene] = useState<SceneId>('estudio');
  const [edit, setEdit] = useState<{
    skin?: string;
    hairColor?: string;
    shirt?: string;
    hair?: HairStyle;
    glasses?: boolean;
    beard?: boolean;
    lipstick?: string;
    name?: string;
    framing?: FramingId;
    pose?: PoseId;
    expression?: ExpressionId;
    tattoos?: boolean;
    headphones?: boolean;
    chain?: boolean;
    watch?: boolean;
    photo?: string;
    photoMouth?: { y: number; w: number; h: number; lips?: string };
  }>({});
  const [editing, setEditing] = useState(false);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE);
  const [rate, setRate] = useState<'normal' | 'lenta'>('normal');
  const [ratio, setRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');
  const [text, setText] = useState(EXAMPLES[0]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [useAiSync, setUseAiSync] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [photoError, setPhotoError] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  /**
   * Avatar com a foto do próprio usuário: reduz a imagem para no máximo
   * 900 px, envia para o storage e guarda a posição da boca (ajustável).
   */
  async function useOwnPhoto(file: File) {
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
        reader.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Imagem inválida.'));
        img.src = dataUrl;
      });
      const max = 900;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Navegador sem canvas.');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const small = canvas.toDataURL('image/jpeg', 0.9);

      const res = await fetch('/api/free/asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: small, name: 'meu-avatar', kind: 'image' }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || 'Falha ao guardar a foto.');
      setEdit((prev) => ({
        ...prev,
        photo: data.url,
        framing: 'rosto',
        photoMouth: prev.photoMouth ?? { y: 0.66, w: 0.3, h: 0.075 },
      }));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Falha ao usar a foto.');
    } finally {
      setPhotoBusy(false);
    }
  }

  const presetId = useMemo(() => {
    const hasEdits = Object.values(edit).some((v) => v !== undefined && v !== '');
    return hasEdits ? encodeAvatar({ base: baseId, scene, ...edit }) : withScene(baseId, scene);
  }, [baseId, scene, edit]);

  const avatar = AVATARS.find((a) => a.id === baseId) ?? AVATARS[0];
  const isPhoto = Boolean(avatar.photo);
  const voice =
    VOICE_PRESETS.find((v) => v.id === voiceId) ?? VOICES.find((v) => v.id === voiceId) ?? VOICES[0];

  function pickAvatar(id: string) {
    setBaseId(id);
    setEdit({});
  }

  function setField<K extends keyof typeof edit>(key: K, value: (typeof edit)[K]) {
    setEdit((prev) => ({ ...prev, [key]: value }));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      setStage('Gerando a narração com a voz escolhida…');
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceId, speed: rate }),
      });
      const data = (await res.json()) as { segments?: Segment[]; error?: string };
      if (!res.ok || !data.segments?.length) throw new Error(data.error || 'Não foi possível gerar a voz.');
      setPreview(data.segments[0].url);

      // --- Sincronização por IA (opcional) -------------------------------------
      // Usa o serviço isolado lib/avatar-sync.ts (SadTalker em Space público).
      // Se falhar (Space dormindo/sem GPU), seguimos no motor interno de visemas.
      let aiVideoUrl: string | undefined;
      let aiWarning = '';
      if (useAiSync) {
        const photo = avatar.photo?.base ?? '';
        setStage('Gerando sincronização labial (isso pode levar alguns minutos)…');
        const ticker = setInterval(() => setAiElapsed((v) => v + 1), 1000);
        setAiElapsed(0);
        try {
          const sync = await fetch('/api/avatar/lipsync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: photo, audioUrl: data.segments[0].url }),
          });
          const syncData = (await sync.json()) as { ok?: boolean; videoUrl?: string; error?: string };
          if (sync.ok && syncData.videoUrl) {
            aiVideoUrl = syncData.videoUrl;
            setStage('Sincronização pronta! Montando o projeto com o cenário…');
          } else {
            aiWarning = syncData.error || 'A sincronização por IA não respondeu.';
          }
        } catch (err) {
          aiWarning = err instanceof Error ? err.message : 'Falha ao falar com o serviço de sincronização.';
        } finally {
          clearInterval(ticker);
        }
        if (aiWarning && !aiVideoUrl) {
          setError(`${aiWarning} Gerando com o motor interno (instantâneo)…`);
        }
      }

      setStage(aiVideoUrl ? 'Montando o projeto no editor…' : 'Sincronizando a boca do avatar com o áudio…');
      const envelope = await computeEnvelope(data.segments.map((s) => s.url), ENVELOPE_STEP);

      setStage('Montando o projeto no editor…');
      const project = await fetch('/api/avatar-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Avatar ${edit.name || avatar.name} · ${voice.label}`,
          avatarId: presetId,
          voice: voiceId,
          voiceId,
          ratio,
          segments: data.segments,
          envelope,
          scene,
          videoUrl: aiVideoUrl,
          chroma: true,
        }),
      });
      const created = (await project.json()) as { url?: string; error?: string };
      if (!project.ok || !created.url) throw new Error(created.error || 'Falha ao criar o projeto.');
      if (onCreated) {
        onCreated(created.url);
        setLoading(false);
        setStage('');
      } else {
        router.push(created.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado. Tente de novo.');
      setLoading(false);
      setStage('');
    }
  }

  return (
    <div className={cn('grid gap-4', compact ? '' : 'lg:grid-cols-[1.15fr_1fr]')}>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-brand-300" />
              <h2 className="text-sm font-semibold text-white">1. Escolha o avatar</h2>
            </div>
            <button
              onClick={() => setEditing((v) => !v)}
              className={cn(
                'rounded-lg border px-2 py-1 text-[10px] font-semibold transition',
                editing ? 'border-brand-400/60 bg-brand-500/15 text-brand-100' : 'border-white/12 text-slate-300 hover:border-brand-400/40',
              )}
            >
              {editing ? 'Fechar edição' : 'Editar avatar'}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {AVATARS.length} personagens 3D · close ou meio corpo · boca animada pelo áudio na prévia e na exportação.
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                onClick={() => pickAvatar(a.id)}
                className={cn(
                  'overflow-hidden rounded-xl border text-left transition',
                  baseId === a.id ? 'border-brand-400 ring-2 ring-brand-500/30' : 'border-white/10 hover:border-brand-400/50',
                )}
              >
                <AvatarThumb preset={withScene(a.id, scene)} className="w-full" rounded="rounded-none" mouth={0.6} />
                <span className="block truncate px-1.5 py-1 text-[10px] font-semibold text-white">{a.name}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-2">
            <AvatarThumb preset={presetId} className="h-24 w-20 shrink-0" rounded="rounded-lg" mouth={0.55} />
            <div className="min-w-0 text-[10px] leading-relaxed text-slate-400">
              <p className="text-[11px] font-semibold text-white">
                {edit.name || avatar.name} · <span className="font-normal text-slate-400">{avatar.role}</span>
              </p>
              <p className="mt-1">
                Cenário: <strong className="text-slate-200">{SCENES.find((s) => s.id === scene)?.label}</strong>
              </p>
              <p className="mt-0.5">O avatar é desenhado em 4K no canvas — sem marca d&apos;água, sem licença.</p>
            </div>
          </div>

          {editing ? (
            <div className="mt-3 space-y-2 rounded-xl border border-brand-400/25 bg-brand-500/[0.06] p-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Seu avatar com sua foto</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                  Envie um retrato (fundo claro, rosto de frente). O sistema recorta o fundo e anima a boca junto com a
                  narração — depois ajuste a posição da boca nos controles abaixo.
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <input
                    ref={photoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void useOwnPhoto(file);
                      e.target.value = '';
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={() => photoRef.current?.click()} disabled={photoBusy}>
                    {photoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {edit.photo ? 'Trocar foto' : 'Enviar minha foto'}
                  </Button>
                  {edit.photo ? (
                    <button
                      type="button"
                      onClick={() => setEdit((prev) => ({ ...prev, photo: undefined, photoMouth: undefined }))}
                      className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:border-red-400/40 hover:text-red-200"
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
                {photoError ? <p className="mt-1 text-[10px] text-red-300">{photoError}</p> : null}
                {edit.photo && edit.photoMouth ? (
                  <div className="mt-2 space-y-1.5">
                    {([
                      ['y', 'Posição da boca (altura)', 0.4, 0.85],
                      ['w', 'Largura da boca', 0.1, 0.55],
                      ['h', 'Altura da boca', 0.03, 0.16],
                    ] as const).map(([key, label, min, max]) => (
                      <label key={key} className="block text-[10px] text-slate-400">
                        {label}
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={0.005}
                          value={edit.photoMouth?.[key] ?? min}
                          onChange={(e) =>
                            setEdit((prev) => ({
                              ...prev,
                              photoMouth: {
                                y: prev.photoMouth?.y ?? 0.66,
                                w: prev.photoMouth?.w ?? 0.3,
                                h: prev.photoMouth?.h ?? 0.075,
                                lips: prev.photoMouth?.lips,
                                [key]: Number(e.target.value),
                              },
                            }))
                          }
                          className="mt-0.5 w-full accent-brand-400"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Nome no projeto</label>
                <input
                  value={edit.name ?? ''}
                  onChange={(e) => setField('name', e.target.value || undefined)}
                  placeholder={avatar.name}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 text-[11px] text-white outline-none focus:border-brand-400/60"
                />
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Enquadramento</p>
              <div className="flex flex-wrap gap-1">
                {FRAMINGS.filter((f) => !isPhoto || f.id !== 'corpo').map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setField('framing', f.id)}
                    title={f.hint}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px]',
                      (edit.framing ?? avatar.framing ?? 'rosto') === f.id ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/12 text-slate-300',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {isPhoto ? (
                <p className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[10px] leading-relaxed text-slate-400">
                  Retrato 3D: expressão, roupa e acessórios fazem parte da arte. A boca abre junto com a narração
                  (mistura entre o quadro de boca fechada e o de fala).
                </p>
              ) : (
                <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pose</p>
              <div className="flex flex-wrap gap-1">
                {POSES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setField('pose', p.id)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px]',
                      (edit.pose ?? avatar.pose ?? 'neutro') === p.id ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/12 text-slate-300',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Expressão</p>
              <div className="flex flex-wrap gap-1">
                {EXPRESSIONS.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setField('expression', e.id)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px]',
                      (edit.expression ?? avatar.expression ?? 'sorriso') === e.id ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/12 text-slate-300',
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tom de pele</p>
              <div className="flex flex-wrap gap-1.5">
                {SKIN_TONES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setField('skin', c)}
                    style={{ background: c }}
                    className={cn('h-6 w-6 rounded-full border-2', edit.skin === c ? 'border-white' : 'border-white/20')}
                    aria-label={`pele ${c}`}
                  />
                ))}
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cabelo</p>
              <div className="flex flex-wrap gap-1">
                {HAIR_STYLES.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setField('hair', h.id)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px]',
                      (edit.hair ?? avatar.hair) === h.id ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/12 text-slate-300',
                    )}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {HAIR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setField('hairColor', c)}
                    style={{ background: c }}
                    className={cn('h-5 w-5 rounded-full border-2', edit.hairColor === c ? 'border-white' : 'border-white/20')}
                    aria-label={`cabelo ${c}`}
                  />
                ))}
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Roupa</p>
              <div className="flex flex-wrap gap-1.5">
                {SHIRTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setField('shirt', c)}
                    style={{ background: c }}
                    className={cn('h-5 w-5 rounded-full border-2', edit.shirt === c ? 'border-white' : 'border-white/20')}
                    aria-label={`camisa ${c}`}
                  />
                ))}
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Boca</p>
              <div className="flex flex-wrap gap-1.5">
                {LIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setField('lipstick', c)}
                    style={{ background: c }}
                    className={cn('h-5 w-5 rounded-full border-2', edit.lipstick === c ? 'border-white' : 'border-white/20')}
                    aria-label={`boca ${c}`}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={edit.glasses ?? avatar.glasses ?? false}
                    onChange={(e) => setField('glasses', e.target.checked)}
                    className="accent-brand-500"
                  />
                  Óculos
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={edit.beard ?? avatar.beard ?? false}
                    onChange={(e) => setField('beard', e.target.checked)}
                    className="accent-brand-500"
                  />
                  Barba
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={edit.tattoos ?? avatar.tattoos ?? false}
                    onChange={(e) => setField('tattoos', e.target.checked)}
                    className="accent-brand-500"
                  />
                  Tatuagens
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={edit.headphones ?? avatar.headphones ?? false}
                    onChange={(e) => setField('headphones', e.target.checked)}
                    className="accent-brand-500"
                  />
                  Headset
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={edit.chain ?? avatar.chain ?? false}
                    onChange={(e) => setField('chain', e.target.checked)}
                    className="accent-brand-500"
                  />
                  Corrente
                </label>
                <button
                  onClick={() => setEdit({})}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/12 px-2 py-1 text-[10px] text-slate-300 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" /> Desfazer edições
                </button>
              </div>
                </>
              )}
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-neon-cyan" />
            <h2 className="text-sm font-semibold text-white">2. Cenário (qualquer ambiente)</h2>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SCENES.map((s) => (
              <button
                key={s.id}
                onClick={() => setScene(s.id)}
                title={s.hint}
                className={cn(
                  'overflow-hidden rounded-lg border text-left transition',
                  scene === s.id ? 'border-brand-400 ring-2 ring-brand-500/30' : 'border-white/10 hover:border-brand-400/50',
                )}
              >
                <AvatarThumb preset={withScene(baseId, s.id)} className="w-full" rounded="rounded-none" mouth={0.25} />
                <span className="block truncate px-1.5 py-1 text-[10px] font-semibold text-white">{s.label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-white">3. Voz e roteiro</h2>
          </div>
          <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Voz ({VOICES.length + VOICE_PRESETS.length} disponíveis · timbres próprios)
          </label>
          <select
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-2 py-2 text-xs text-white outline-none focus:border-brand-400/60"
          >
            <optgroup label="Vozes neurais com timbre próprio">
              {VOICE_PRESETS.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </optgroup>
            {LOCALES.map((locale) => (
              <optgroup key={locale} label={`${locale} (sotaque)`}>
                {VOICES.filter((v) => v.locale === locale).map((v) => (
                  <option key={v.id} value={v.id}>{v.label} — {v.hint}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Roteiro (até 5000 caracteres)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={5000}
            className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-2 text-xs leading-relaxed text-white outline-none focus:border-brand-400/60"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setText(ex)}
                className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:border-brand-400/50 hover:text-white"
              >
                Exemplo {i + 1}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              value={rate}
              onChange={(e) => setRate(e.target.value as 'normal' | 'lenta')}
              className="rounded-xl border border-white/10 bg-ink-900 px-2 py-1.5 text-[11px] text-white outline-none"
            >
              <option value="normal">Ritmo normal</option>
              <option value="lenta">Ritmo pausado</option>
            </select>
            <select
              value={ratio}
              onChange={(e) => setRatio(e.target.value as '9:16' | '16:9' | '1:1' | '4:5')}
              className="rounded-xl border border-white/10 bg-ink-900 px-2 py-1.5 text-[11px] text-white outline-none"
            >
              <option value="9:16">9:16 · Reels/Shorts</option>
              <option value="16:9">16:9 · YouTube</option>
              <option value="1:1">1:1 · Feed</option>
              <option value="4:5">4:5 · Instagram</option>
            </select>
          </div>

          <label className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <input
              type="checkbox"
              checked={useAiSync}
              onChange={(e) => setUseAiSync(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-brand-500"
            />
            <span className="text-[10px] leading-relaxed text-slate-300">
              <strong className="text-white">Sincronização real por IA (SadTalker)</strong> — boca e cabeça geradas por
              rede neural. Demora alguns minutos e depende de um serviço público gratuito; se estiver ocupado, o sistema
              usa o motor interno automaticamente.
            </span>
          </label>

          <Button onClick={generate} disabled={loading || text.trim().length < 4} className="mt-3 w-full" size="lg">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {loading ? (useAiSync ? `Gerando sincronização… ${aiElapsed}s` : 'Criando…') : 'Criar vídeo do avatar'}
          </Button>
          {loading ? <p className="mt-2 text-[10px] text-brand-200">{stage}</p> : null}
          {loading && useAiSync ? (
            <p className="mt-1 text-[10px] text-slate-500">
              Você pode deixar esta aba aberta — o vídeo aparece na timeline assim que ficar pronto.
            </p>
          ) : null}
          {error ? <p className="mt-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">{error}</p> : null}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-neon-cyan" />
            <h2 className="text-sm font-semibold text-white">O que você recebe</h2>
          </div>
          <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-400">
            <li>• Projeto aberto no editor com o avatar falando em {ratio}</li>
            <li>• Cenário “{SCENES.find((s) => s.id === scene)?.label}” já composto na cena</li>
            <li>
              • Narração na trilha de áudio (voz {voice.label}
              {'locale' in voice ? `, ${voice.locale}` : `, ${voice.lang}`})
            </li>
            <li>• Legendas automáticas do roteiro, já sincronizadas</li>
            <li>• Exportação em MP4, WebM ou GIF até 4K</li>
          </ul>
          {preview ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
              <audio ref={audioRef} src={preview} controls className="h-8 w-full" />
              <button
                onClick={() => {
                  const el = audioRef.current;
                  if (!el) return;
                  void el.play();
                }}
                className="rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20"
                title="Ouvir narração"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
