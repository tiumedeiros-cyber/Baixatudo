'use client';

/**
 * VoiceClonePanel — voz clonada grátis, feita pelo celular.
 *
 * O Voicebox é um app de computador e não tem API hospedada, então não serve
 * para quem edita pelo telefone. Aqui a clonagem usa servidores públicos
 * gratuitos de XTTS-v2 (Hugging Face) chamados pelo nosso backend — sem chave,
 * sem cartão e sem instalar nada.
 *
 * Dois caminhos, sempre com resultado real:
 *   1. clonar a voz a partir de uma amostra gravada no microfone do aparelho;
 *   2. usar a própria gravação como narração (funciona mesmo se a clonagem
 *      estiver indisponível).
 *
 * A inserção usa a mesma API pública do store que o TTS usa — a timeline e o
 * player não são alterados.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, CircleStop, Loader2, Mic, RefreshCw, Sparkles, TriangleAlert, Upload, Wand2 } from 'lucide-react';
import { useStudio } from './store';

type Provider = { id: string; ok: boolean; ms: number; error?: string };
type Status = { ok: boolean; available: boolean; providers: Provider[]; languages: { id: string; label: string }[] };

const MIN_SECONDS = 3;
const MAX_SECONDS = 30;

export function VoiceClonePanel({ text, onDone }: { text: string; onDone?: (message: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sampleUrl, setSampleUrl] = useState('');
  const [sampleSeconds, setSampleSeconds] = useState(0);
  const [language, setLanguage] = useState('Portuguese');
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState<'sample' | 'clone' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/voice/clone', { cache: 'no-store' });
      const data = (await res.json()) as Status;
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    };
  }, [check]);

  async function startRecording() {
    setProblem(null);
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      setSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        void handleSample(blob);
      };
      recorder.start();
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((value) => {
          const next = value + 1;
          if (next >= MAX_SECONDS) stopRecording();
          return next;
        });
      }, 1000);
    } catch {
      setProblem('O navegador não liberou o microfone. Autorize o acesso ou envie um arquivo de áudio.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
  }

  /** Converte a gravação do celular (webm/mp4) para WAV — formato que os servidores de clonagem aceitam. */
  async function toWav(blob: Blob): Promise<{ blob: Blob; seconds: number }> {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const rate = Math.min(24000, Math.max(16000, decoded.sampleRate));
      const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      const pcm = rendered.getChannelData(0);
      const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
      const writeText = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i += 1) out.setUint8(offset + i, value.charCodeAt(i));
      };
      writeText(0, 'RIFF');
      out.setUint32(4, 36 + pcm.length * 2, true);
      writeText(8, 'WAVE');
      writeText(12, 'fmt ');
      out.setUint32(16, 16, true);
      out.setUint16(20, 1, true);
      out.setUint16(22, 1, true);
      out.setUint32(24, rate, true);
      out.setUint32(28, rate * 2, true);
      out.setUint16(32, 2, true);
      out.setUint16(34, 16, true);
      writeText(36, 'data');
      out.setUint32(40, pcm.length * 2, true);
      let offset = 44;
      for (let i = 0; i < pcm.length; i += 1, offset += 2) {
        const sample = Math.max(-1, Math.min(1, pcm[i]));
        out.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      }
      return { blob: new Blob([out.buffer], { type: 'audio/wav' }), seconds: rendered.duration };
    } finally {
      void ctx.close();
    }
  }

  async function handleSample(blob: Blob) {
    setBusy('sample');
    setProblem(null);
    setMessage(null);
    try {
      const { blob: wav, seconds: duration } = await toWav(blob);
      if (duration < MIN_SECONDS) {
        setProblem(`A gravação tem ${duration.toFixed(1)}s. Fale pelo menos ${MIN_SECONDS}s para a clonagem ficar boa.`);
        return;
      }
      const trimmed = duration > MAX_SECONDS + 1 ? blob.slice(0) : wav;
      const form = new FormData();
      form.append('file', trimmed, 'amostra-voz.wav');
      form.append('name', 'Amostra de voz');
      const res = await fetch('/api/voice/clone', { method: 'POST', body: form });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || 'Falha ao guardar a amostra.');
      setSampleUrl(data.url);
      setSampleSeconds(Math.min(duration, MAX_SECONDS));
      setMessage(`Amostra salva (${Math.min(duration, MAX_SECONDS).toFixed(1)}s). Agora escreva o texto e clone.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Não foi possível preparar a amostra.');
    } finally {
      setBusy(null);
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await handleSample(file);
    event.target.value = '';
  }

  async function runClone() {
    if (!text.trim()) {
      setProblem('Escreva o texto da narração no campo acima.');
      return;
    }
    if (!sampleUrl) {
      setProblem('Grave (ou envie) uma amostra da sua voz primeiro.');
      return;
    }
    setBusy('clone');
    setProblem(null);
    setMessage(null);
    try {
      const res = await fetch('/api/voice/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sampleUrl, language, speed }),
      });
      const data = (await res.json()) as {
        segments?: { url: string; text: string }[];
        error?: string;
        hint?: string;
        warning?: string | null;
      };
      if (!res.ok || !data.segments?.length) {
        throw new Error([data.error, data.hint].filter(Boolean).join(' ') || 'Falha na clonagem.');
      }
      let cursor = useStudio.getState().playhead;
      let total = 0;
      for (const segment of data.segments) {
        const duration = (await probeDuration(segment.url)) ?? Math.max(2, segment.text.length / 14);
        insertAudioClip(segment.url, duration, 'Voz clonada', cursor);
        cursor += duration;
        total += duration;
      }
      if (cursor > useStudio.getState().duration) useStudio.setState({ duration: Math.ceil(cursor + 1) });
      setMessage(
        `Narração clonada inserida na timeline (${total.toFixed(1)}s${data.segments.length > 1 ? ` · ${data.segments.length} blocos` : ''}).${
          data.warning ? ` Aviso: ${data.warning}` : ''
        }`,
      );
      onDone?.(`Voz clonada: ${total.toFixed(1)}s`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Erro inesperado na clonagem.');
    } finally {
      setBusy(null);
    }
  }

  function useSampleAsNarration() {
    if (!sampleUrl) {
      setProblem('Grave uma amostra primeiro.');
      return;
    }
    insertAudioClip(sampleUrl, Math.max(1, sampleSeconds), 'Minha voz (gravação)', useStudio.getState().playhead);
    setMessage('Sua gravação entrou na timeline como narração.');
  }

  const available = status?.available ?? false;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
      <div className="flex items-center gap-1.5">
        <AudioLines className="h-3.5 w-3.5 text-brand-300" />
        <p className="flex-1 text-[11px] font-semibold text-white">Clonar minha voz · grátis</p>
        <span
          className={`rounded px-1 py-0.5 text-[8px] font-bold uppercase ${
            checking ? 'bg-white/10 text-slate-400' : available ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-200'
          }`}
        >
          {checking ? 'verificando' : available ? 'online' : 'instável'}
        </span>
        <button
          type="button"
          onClick={() => void check()}
          className="rounded border border-white/15 p-1 text-slate-300 hover:bg-white/10"
          aria-label="Verificar servidores de clonagem"
        >
          {checking ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
        </button>
      </div>

      {status && !available ? (
        <p className="mt-1 rounded border border-amber-400/25 bg-amber-500/10 px-1.5 py-1 text-[9px] leading-relaxed text-amber-100">
          O servidor público de clonagem está ocupado agora ({status.providers.map((p) => `${p.id.split('/').pop()}: ${p.error ?? 'off'}`).join(' · ')}).
          Você ainda pode gravar sua voz e usar direto na timeline.
        </p>
      ) : null}

      <div className="mt-1.5 flex gap-1">
        <button
          type="button"
          onClick={() => (recording ? stopRecording() : void startRecording())}
          disabled={busy === 'sample'}
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-bold text-white transition ${
            recording ? 'bg-rose-600' : 'bg-white/10 hover:bg-white/15'
          } disabled:opacity-50`}
        >
          {recording ? <CircleStop className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
          {recording ? `Parar (${seconds}s)` : sampleUrl ? 'Gravar de novo' : 'Gravar amostra'}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy === 'sample'}
          className="flex items-center justify-center gap-1 rounded-lg border border-white/10 px-2 text-[10px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
        >
          {busy === 'sample' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        </button>
        <input ref={fileRef} type="file" accept="audio/*" onChange={(e) => void onFile(e)} className="hidden" />
      </div>

      {sampleUrl ? (
        <div className="mt-1.5 space-y-1">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={sampleUrl} controls className="h-7 w-full" />
          <p className="text-[9px] text-slate-500">Amostra de {sampleSeconds.toFixed(1)}s salva na sua conta.</p>
          <button
            type="button"
            onClick={useSampleAsNarration}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-white/10 py-1 text-[9px] font-semibold text-slate-200 hover:bg-white/10"
          >
            <Wand2 className="h-2.5 w-2.5" /> Usar esta gravação como narração
          </button>
        </div>
      ) : (
        <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
          Fale {MIN_SECONDS}–{MAX_SECONDS}s no microfone do aparelho (uma frase natural basta). Nada sai do seu controle: a
          amostra fica na sua conta e é enviada apenas ao servidor de clonagem no momento de gerar.
        </p>
      )}

      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className="rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[10px] text-white outline-none"
        >
          {(status?.languages ?? [{ id: 'Portuguese', label: 'Português' }]).map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        <select
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
          className="rounded-lg border border-white/10 bg-ink-850 px-1.5 py-1 text-[10px] text-white outline-none"
        >
          <option value={0.85}>ritmo calmo</option>
          <option value={1}>ritmo normal</option>
          <option value={1.15}>ritmo rápido</option>
        </select>
      </div>

      <button
        type="button"
        onClick={() => void runClone()}
        disabled={busy !== null || recording || !sampleUrl || !text.trim()}
        className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {busy === 'clone' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {busy === 'clone' ? 'Clonando (pode levar ~1 min)…' : 'Clonar e inserir na timeline'}
      </button>

      {message ? <p className="mt-1.5 rounded border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-1 text-[9px] text-emerald-200">{message}</p> : null}
      {problem ? (
        <p className="mt-1.5 flex items-start gap-1 rounded border border-rose-400/25 bg-rose-500/10 px-1.5 py-1 text-[9px] leading-relaxed text-rose-200">
          <TriangleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0" /> {problem}
        </p>
      ) : null}
    </div>
  );
}

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

/** Insere um clipe de áudio na trilha de áudio (mesma API pública usada pelo TTS). */
function insertAudioClip(url: string, duration: number, name: string, start: number) {
  const s = useStudio.getState();
  const track = s.tracks.find((t) => t.kind === 'audio') ?? s.tracks[0];
  s.addClip({
    kind: 'audio',
    src: url,
    name,
    trackId: track?.id ?? '',
    start,
    duration,
    volume: 1,
  });
}
