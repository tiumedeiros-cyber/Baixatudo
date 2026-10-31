'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Clapperboard, Loader2, Play, Sparkles, Wand2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { AvatarThumb } from '@/components/media/AvatarThumb';
import { AVATARS } from '@/lib/catalog/avatars';
import { VOICES, DEFAULT_VOICE } from '@/lib/catalog/voices';
import { computeEnvelope } from '@/components/studio/envelope';
import { cn } from '@/lib/utils';

type Segment = { url: string; text: string; duration: number };

const LOCALES = Array.from(new Set(VOICES.map((v) => v.locale)));
const EXAMPLES = [
  'Olá! Eu sou seu avatar e vou apresentar o conteúdo do seu canal em poucos segundos.',
  'Você sabia que dá para criar um vídeo profissional sem aparecer? Eu narro para você.',
  'Aproveite a promoção de hoje: 50% de desconto em todos os planos, só até meia-noite.',
];

export function AvatarStudio() {
  const router = useRouter();
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE);
  const [rate, setRate] = useState<'normal' | 'lenta'>('normal');
  const [ratio, setRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');
  const [text, setText] = useState(EXAMPLES[0]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const avatar = AVATARS.find((a) => a.id === avatarId) ?? AVATARS[0];
  const voice = VOICES.find((v) => v.id === voiceId) ?? VOICES[0];

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

      setStage('Sincronizando a boca do avatar com o áudio…');
      const envelope = await computeEnvelope(data.segments.map((s) => s.url));

      setStage('Montando o projeto no editor…');
      const project = await fetch('/api/avatar-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Avatar ${avatar.name} · ${voice.label}`,
          avatarId,
          voiceId,
          ratio,
          segments: data.segments,
          envelope,
        }),
      });
      const created = (await project.json()) as { url?: string; error?: string };
      if (!project.ok || !created.url) throw new Error(created.error || 'Falha ao criar o projeto.');
      router.push(created.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado. Tente de novo.');
      setLoading(false);
      setStage('');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand-300" />
          <h2 className="text-sm font-semibold text-white">1. Escolha o avatar</h2>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">{AVATARS.length} personagens diferentes — todos animam a boca junto com a voz.</p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAvatarId(a.id)}
              className={cn(
                'overflow-hidden rounded-xl border text-left transition',
                avatarId === a.id ? 'border-brand-400 ring-2 ring-brand-500/30' : 'border-white/10 hover:border-brand-400/50',
              )}
            >
              <AvatarThumb preset={a.id} className="w-full" rounded="rounded-none" mouth={0.6} />
              <span className="block truncate px-1.5 py-1 text-[10px] font-semibold text-white">{a.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] p-2 text-[10px] text-slate-400">
          <strong className="text-white">{avatar.name}</strong> · {avatar.role}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-white">2. Voz e roteiro</h2>
          </div>
          <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Voz ({VOICES.length} disponíveis)</label>
          <select
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-2 py-2 text-xs text-white outline-none focus:border-brand-400/60"
          >
            {LOCALES.map((locale) => (
              <optgroup key={locale} label={locale}>
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

          <Button onClick={generate} disabled={loading || text.trim().length < 4} className="mt-3 w-full" size="lg">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {loading ? 'Criando…' : 'Criar vídeo do avatar'}
          </Button>
          {loading ? <p className="mt-2 text-[10px] text-brand-200">{stage}</p> : null}
          {error ? <p className="mt-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">{error}</p> : null}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-neon-cyan" />
            <h2 className="text-sm font-semibold text-white">O que você recebe</h2>
          </div>
          <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-400">
            <li>• Projeto aberto no editor com o avatar falando em {ratio}</li>
            <li>• Narração na trilha de áudio (voz {voice.label}, {voice.locale})</li>
            <li>• Legendas automáticas do roteiro, já sincronizadas</li>
            <li>• Exportação em MP4, WebM ou GIF até 4K no botão Exportar</li>
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
