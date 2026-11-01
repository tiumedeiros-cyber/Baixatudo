'use client';

/**
 * VoiceboxPanel — voz clonada de graça, sem chave e sem limite.
 *
 * O Voicebox (voicebox.sh, MIT) roda na máquina do usuário e abre uma API em
 * http://127.0.0.1:17493. Este cartão:
 *   1. pergunta ao nosso servidor se existe um Voicebox remoto configurado;
 *   2. se não houver, tenta falar com o Voicebox local do próprio navegador;
 *   3. gera o áudio, guarda no storage da conta e insere UM clipe de áudio na
 *      timeline usando exatamente a mesma API pública já usada pelo TTS
 *      (`useStudio.getState().addClip`) — a timeline não é modificada.
 *
 * Se nada estiver disponível, mostra o motivo real (sem mensagem falsa) e o
 * editor continua funcionando com as vozes que já existem.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Check, CloudCog, Loader2, Laptop, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { useStudio } from './store';
import { LOCAL_VOICEBOX, VOICEBOX_ENGINES, type VoiceboxEngine, type VoiceboxProfile } from '@/lib/voicebox';

type RemoteInfo = {
  configured: boolean;
  source: 'admin' | 'env' | null;
  base: string | null;
  reachable?: boolean;
  error?: string | null;
  health?: { model_loaded?: boolean; gpu_available?: boolean; gpu_type?: string | null } | null;
};

type Status = {
  ok: boolean;
  localDefault?: string;
  engines?: VoiceboxEngine[];
  remote?: RemoteInfo;
  profiles?: VoiceboxProfile[];
};

type Mode = 'checking' | 'remote' | 'local' | 'offline';

export function VoiceboxPanel({
  text,
  onDone,
}: {
  text: string;
  onDone?: (message: string) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<Mode>('checking');
  const [profiles, setProfiles] = useState<VoiceboxProfile[]>([]);
  const [voice, setVoice] = useState('');
  const [engine, setEngine] = useState('qwen');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const alive = useRef(true);

  const check = useCallback(async () => {
    setMode('checking');
    setProblem(null);
    setMessage(null);
    try {
      const res = await fetch('/api/voice/voicebox', { cache: 'no-store' });
      const data = (await res.json()) as Status;
      if (!alive.current) return;
      setStatus(data);

      if (data.remote?.configured && data.remote.reachable) {
        setMode('remote');
        setProfiles(data.profiles ?? []);
        setVoice((prev) => prev || data.profiles?.[0]?.name || '');
        return;
      }

      // Servidor remoto ausente/fora → tenta o app aberto nesta máquina
      const local = await probeLocal();
      if (!alive.current) return;
      if (local.ok) {
        setMode('local');
        setProfiles(local.profiles);
        setVoice((prev) => prev || local.profiles[0]?.name || '');
        return;
      }
      setMode('offline');
      setProblem(local.error);
    } catch {
      if (alive.current) {
        setMode('offline');
        setProblem('Não foi possível consultar o Voicebox agora.');
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void check();
    return () => {
      alive.current = false;
    };
  }, [check]);

  async function probeLocal(): Promise<{ ok: true; profiles: VoiceboxProfile[] } | { ok: false; error: string }> {
    const base = status?.localDefault || LOCAL_VOICEBOX;
    try {
      const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      if (!health.ok) return { ok: false, error: `O Voicebox local respondeu ${health.status}.` };
      const list = await fetch(`${base}/profiles`, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
      const profiles = list.ok ? ((await list.json()) as VoiceboxProfile[]) : [];
      return { ok: true, profiles: Array.isArray(profiles) ? profiles : [] };
    } catch {
      return {
        ok: false,
        error:
          `Não achei o Voicebox em ${base}. Abra o app Voicebox no seu computador. ` +
          'Se ele estiver aberto, o navegador pode ter bloqueado o acesso do site ao seu computador: ' +
          'feche o Voicebox e abra de novo com VOICEBOX_CORS_ORIGINS apontando para este site (ou peça ao admin para cadastrar a URL do servidor em Configurações → Integrações).',
      };
    }
  }

  async function generate() {
    if (!text.trim()) {
      setProblem('Escreva o texto da narração primeiro.');
      return;
    }
    setBusy(true);
    setProblem(null);
    setMessage(null);
    try {
      let payload: { url: string; duration?: number | null; name?: string };

      if (mode === 'local') {
        const base = status?.localDefault || LOCAL_VOICEBOX;
        const res = await fetch(`${base}/v1/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: engine,
            input: text,
            voice: voice || undefined,
            response_format: 'mp3',
            instructions: instructions.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`Voicebox (${res.status}): ${detail.slice(0, 180) || 'sem detalhe'}`);
        }
        const blob = await res.blob();
        if (!blob.size) throw new Error('O Voicebox devolveu áudio vazio.');

        const form = new FormData();
        form.append('file', blob, `${(voice || 'voicebox').replace(/[^\w-]+/g, '-')}.mp3`);
        form.append('name', `Voz ${voice || 'Voicebox'}`);
        const upload = await fetch('/api/voice/voicebox', { method: 'POST', body: form });
        const data = (await upload.json()) as { url?: string; error?: string; name?: string };
        if (!upload.ok || !data.url) throw new Error(data.error || 'Falha ao guardar o áudio.');
        payload = { url: data.url, name: data.name };
      } else {
        const res = await fetch('/api/voice/voicebox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice, engine, instructions }),
        });
        const data = (await res.json()) as { url?: string; duration?: number | null; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error || 'Falha na geração.');
        payload = { url: data.url, duration: data.duration ?? null };
      }

      const duration = payload.duration ?? (await probeDuration(payload.url)) ?? Math.max(2, text.length / 14);
      insertAudioClip(payload.url, duration, `Voz ${voice || 'Voicebox'}`);
      setMessage(`Narração com voz clonada adicionada à timeline (${duration.toFixed(1)}s).`);
      onDone?.(`Voicebox: ${duration.toFixed(1)}s`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Erro inesperado no Voicebox.');
    } finally {
      setBusy(false);
    }
  }

  const engineList = status?.engines?.length ? status.engines : VOICEBOX_ENGINES;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
      <div className="flex items-center gap-1.5">
        {mode === 'remote' ? (
          <CloudCog className="h-3.5 w-3.5 text-emerald-300" />
        ) : mode === 'local' ? (
          <Laptop className="h-3.5 w-3.5 text-emerald-300" />
        ) : (
          <AudioLines className="h-3.5 w-3.5 text-slate-400" />
        )}
        <p className="flex-1 text-[11px] font-semibold text-white">Voz clonada (Voicebox · grátis)</p>
        <button
          type="button"
          onClick={() => void check()}
          className="rounded border border-white/15 p-1 text-slate-300 hover:bg-white/10"
          aria-label="Verificar conexão com o Voicebox"
        >
          {mode === 'checking' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
        </button>
      </div>

      {mode === 'checking' ? (
        <p className="mt-1 text-[9px] text-slate-500">Procurando o Voicebox…</p>
      ) : null}

      {(mode === 'local' || mode === 'remote') && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex items-center gap-1 rounded border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-1 text-[9px] text-emerald-200">
            <Check className="h-2.5 w-2.5" />
            {mode === 'remote' ? (
              <span className="truncate">Servidor conectado · {status?.remote?.base}</span>
            ) : (
              <span className="truncate">Voicebox deste computador conectado</span>
            )}
          </div>

          <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">Voz / perfil</label>
          <select
            value={voice}
            onChange={(event) => setVoice(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
          >
            <option value="">{profiles.length ? 'Escolher perfil…' : 'Nenhum perfil criado ainda'}</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.name}>
                {profile.name}
                {profile.language ? ` · ${profile.language}` : ''}
              </option>
            ))}
          </select>
          {!profiles.length ? (
            <p className="text-[9px] leading-relaxed text-slate-500">
              Crie um perfil no app Voicebox (importar um áudio de 3 s já basta) e clique em atualizar.
            </p>
          ) : null}

          <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">Motor</label>
          <select
            value={engine}
            onChange={(event) => setEngine(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[11px] text-white outline-none"
          >
            {engineList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="text-[9px] text-slate-500">{engineList.find((item) => item.id === engine)?.note}</p>

          <input
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="estilo (ex.: quente, pausado, cinematográfico)"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-white outline-none placeholder:text-slate-500"
          />

          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || !text.trim()}
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {busy ? 'Gerando na sua máquina…' : 'Gerar com voz clonada'}
          </button>
        </div>
      )}

      {mode === 'offline' ? (
        <div className="mt-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 p-1.5 text-[9px] leading-relaxed text-amber-100">
          <p className="flex items-center gap-1 font-semibold">
            <TriangleAlert className="h-2.5 w-2.5" /> Voicebox não encontrado
          </p>
          <p className="mt-0.5 text-amber-100/80">{problem}</p>
          <p className="mt-1 text-amber-100/70">
            O Voicebox é um app gratuito (voicebox.sh) que roda no seu computador: nada é enviado para nuvem e não existe
            limite de uso. Enquanto ele não estiver aberto, use as vozes normais abaixo.
          </p>
        </div>
      ) : null}

      {message ? <p className="mt-1.5 rounded border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-1 text-[9px] text-emerald-200">{message}</p> : null}
      {problem && mode !== 'offline' ? (
        <p className="mt-1.5 rounded border border-rose-400/25 bg-rose-500/10 px-1.5 py-1 text-[9px] text-rose-200">{problem}</p>
      ) : null}
    </div>
  );
}

/** Duração real do arquivo usando o próprio navegador (sem baixar de novo). */
async function probeDuration(url: string): Promise<number | null> {
  try {
    return await new Promise<number | null>((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      const done = (value: number | null) => resolve(value);
      audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
      audio.onerror = () => done(null);
      setTimeout(() => done(null), 6000);
      audio.src = url;
    });
  } catch {
    return null;
  }
}

/**
 * Insere um clipe de áudio na trilha de áudio — mesma API pública usada pelo
 * TtsPanel. Não altera estrutura de trilhas nem o player.
 */
function insertAudioClip(url: string, duration: number, name: string) {
  const s = useStudio.getState();
  const track = s.tracks.find((t) => t.kind === 'audio') ?? s.tracks[0];
  s.addClip({
    kind: 'audio',
    src: url,
    name,
    trackId: track?.id ?? '',
    start: s.playhead,
    duration,
    volume: 1,
  });
  if (s.playhead + duration > useStudio.getState().duration) {
    useStudio.setState({ duration: Math.ceil(s.playhead + duration + 1) });
  }
}
