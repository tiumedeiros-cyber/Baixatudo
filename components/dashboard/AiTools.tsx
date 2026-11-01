'use client';
import { useRef, useState } from 'react';
import { AudioLines, Download, Eraser, FileText, Loader2, Play, Scissors, Sparkles } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { loadWhisper } from '@/components/studio/whisper';

/* ------------------------------- utilitários ------------------------------- */

function encodeWav(samples: Float32Array, sampleRate = 44100) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function bufferToDataUrl(buffer: ArrayBuffer, type: string) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

function noiseBuffer(context: BaseAudioContext, seconds: number) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

type SfxRecipe = (context: OfflineAudioContext, out: AudioNode) => void;

const SFX: Array<{ id: string; label: string; seconds: number; recipe: SfxRecipe }> = [
  {
    id: 'whoosh',
    label: 'Whoosh (transição)',
    seconds: 1.1,
    recipe: (ctx, out) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 1.1);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.6;
      filter.frequency.setValueAtTime(320, 0);
      filter.frequency.exponentialRampToValueAtTime(5200, 0.8);
      filter.frequency.exponentialRampToValueAtTime(900, 1.1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, 0);
      gain.gain.exponentialRampToValueAtTime(0.9, 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, 1.1);
      src.connect(filter).connect(gain).connect(out);
      src.start(0);
    },
  },
  {
    id: 'riser',
    label: 'Riser (build-up)',
    seconds: 2,
    recipe: (ctx, out) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, 0);
      osc.frequency.exponentialRampToValueAtTime(1800, 2);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, 0);
      filter.frequency.exponentialRampToValueAtTime(9000, 2);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, 0);
      gain.gain.exponentialRampToValueAtTime(0.55, 1.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, 2);
      osc.connect(filter).connect(gain).connect(out);
      osc.start(0);
      osc.stop(2);
    },
  },
  {
    id: 'impact',
    label: 'Impacto (bumbo)',
    seconds: 1.2,
    recipe: (ctx, out) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, 0);
      osc.frequency.exponentialRampToValueAtTime(42, 0.6);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(1, 0);
      gain.gain.exponentialRampToValueAtTime(0.0001, 1.2);
      osc.connect(gain).connect(out);
      osc.start(0);
      osc.stop(1.2);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 0.25);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5, 0);
      ng.gain.exponentialRampToValueAtTime(0.0001, 0.25);
      noise.connect(ng).connect(out);
      noise.start(0);
    },
  },
  {
    id: 'pop',
    label: 'Pop (clique)',
    seconds: 0.3,
    recipe: (ctx, out) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, 0);
      osc.frequency.exponentialRampToValueAtTime(220, 0.18);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8, 0);
      gain.gain.exponentialRampToValueAtTime(0.0001, 0.28);
      osc.connect(gain).connect(out);
      osc.start(0);
      osc.stop(0.3);
    },
  },
  {
    id: 'notify',
    label: 'Notificação',
    seconds: 0.9,
    recipe: (ctx, out) => {
      [880, 1320].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const start = index * 0.18;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.55, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + 0.55);
      });
    },
  },
  {
    id: 'cash',
    label: 'Caixa registradora',
    seconds: 1,
    recipe: (ctx, out) => {
      const ping = ctx.createOscillator();
      ping.type = 'square';
      ping.frequency.setValueAtTime(2400, 0.02);
      ping.frequency.exponentialRampToValueAtTime(1200, 0.5);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.28, 0.02);
      pg.gain.exponentialRampToValueAtTime(0.0001, 0.6);
      ping.connect(pg).connect(out);
      ping.start(0.02);
      ping.stop(0.7);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 0.4);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.22, 0);
      ng.gain.exponentialRampToValueAtTime(0.0001, 0.4);
      noise.connect(hp).connect(ng).connect(out);
      noise.start(0);
    },
  },
  {
    id: 'suspense',
    label: 'Suspense (drone)',
    seconds: 3,
    recipe: (ctx, out) => {
      [55, 58, 82].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, 0);
        gain.gain.linearRampToValueAtTime(0.25, 1.2);
        gain.gain.linearRampToValueAtTime(0.0001, 3);
        osc.connect(gain).connect(out);
        osc.start(0);
        osc.stop(3);
      });
    },
  },
  {
    id: 'bubble',
    label: 'Bolha / pop suave',
    seconds: 0.45,
    recipe: (ctx, out) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, 0);
      osc.frequency.exponentialRampToValueAtTime(900, 0.18);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, 0);
      gain.gain.exponentialRampToValueAtTime(0.7, 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, 0.4);
      osc.connect(gain).connect(out);
      osc.start(0);
      osc.stop(0.45);
    },
  },
  {
    id: 'glitch',
    label: 'Glitch digital',
    seconds: 0.7,
    recipe: (ctx, out) => {
      for (let i = 0; i < 6; i += 1) {
        const start = i * 0.11;
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 180 + Math.random() * 1400;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.22, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + 0.1);
      }
    },
  },
  {
    id: 'tech',
    label: 'Tecnologia (blips)',
    seconds: 1.2,
    recipe: (ctx, out) => {
      [660, 990, 1320].forEach((freq, index) => {
        const start = index * 0.16;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + 0.15);
      });
    },
  },
  {
    id: 'drum',
    label: 'Batida (loop 2s)',
    seconds: 2,
    recipe: (ctx, out) => {
      const kick = (start: number) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, start);
        osc.frequency.exponentialRampToValueAtTime(45, start + 0.18);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.9, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + 0.26);
      };
      const hat = (start: number) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.08);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
        src.connect(hp).connect(gain).connect(out);
        src.start(start);
      };
      [0, 1, 0.5, 1.5].forEach((time) => kick(time));
      [0.5, 1.5].forEach((time) => hat(time));
    },
  },
  {
    id: 'swipe',
    label: 'Swipe (arrastar)',
    seconds: 0.6,
    recipe: (ctx, out) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.6);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(600, 0);
      filter.frequency.exponentialRampToValueAtTime(6000, 0.4);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.6, 0);
      gain.gain.exponentialRampToValueAtTime(0.0001, 0.6);
      src.connect(filter).connect(gain).connect(out);
      src.start(0);
    },
  },
  {
    id: 'laser',
    label: 'Laser (tech)',
    seconds: 0.7,
    recipe: (ctx, out) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2600, 0);
      osc.frequency.exponentialRampToValueAtTime(220, 0.6);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, 0);
      gain.gain.exponentialRampToValueAtTime(0.0001, 0.68);
      osc.connect(gain).connect(out);
      osc.start(0);
      osc.stop(0.7);
    },
  },
  {
    id: 'coin',
    label: 'Moeda (game)',
    seconds: 0.6,
    recipe: (ctx, out) => {
      [988, 1319].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.4, i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, i * 0.09 + 0.32);
        osc.connect(gain).connect(out);
        osc.start(i * 0.09);
        osc.stop(i * 0.09 + 0.35);
      });
    },
  },
  {
    id: 'heartbeat',
    label: 'Batimento (tensão)',
    seconds: 1.6,
    recipe: (ctx, out) => {
      const beat = (start: number, volume: number) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(78, start);
        osc.frequency.exponentialRampToValueAtTime(40, start + 0.22);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + 0.32);
      };
      beat(0, 0.9);
      beat(0.32, 0.55);
      beat(0.8, 0.9);
      beat(1.12, 0.55);
    },
  },
  {
    id: 'page',
    label: 'Folha / papel',
    seconds: 0.65,
    recipe: (ctx, out) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.65);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, 0);
      bp.frequency.exponentialRampToValueAtTime(1100, 0.6);
      bp.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, 0);
      gain.gain.exponentialRampToValueAtTime(0.5, 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, 0.6);
      src.connect(bp).connect(gain).connect(out);
      src.start(0);
    },
  },
];

async function renderSfx(recipe: SfxRecipe, seconds: number) {
  const OfflineContext = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new OfflineContext(1, Math.ceil(44100 * seconds), 44100);
  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);
  recipe(ctx, master);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

/* -------------------------------- componente -------------------------------- */

type Tab = 'sfx' | 'bg' | 'transcribe';

/** Nenhuma etapa pode ficar "carregando para sempre". */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} passou de ${Math.round(ms / 1000)}s. Tente um áudio mais curto ou verifique a internet.`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function AiTools() {
  const [tab, setTab] = useState<Tab>('sfx');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // sons
  const [lastSfx, setLastSfx] = useState<{ label: string; dataUrl: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // remover fundo
  const [cutout, setCutout] = useState<string | null>(null);

  // transcrição
  const [transcript, setTranscript] = useState('');
  const [srt, setSrt] = useState('');
  const [progress, setProgress] = useState('');

  function reset() {
    setError('');
    setMessage('');
  }

  async function saveAsset(dataUrl: string, name: string, kind: 'audio' | 'image') {
    const res = await fetch('/api/free/asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, name, kind }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok || data.error) throw new Error(data.error || 'Falha ao salvar.');
  }

  async function makeSfx(id: string) {
    reset();
    const preset = SFX.find((item) => item.id === id);
    if (!preset) return;
    setBusy(id);
    try {
      const samples = await renderSfx(preset.recipe, preset.seconds);
      const wav = encodeWav(samples);
      const dataUrl = bufferToDataUrl(wav, 'audio/wav');
      setLastSfx({ label: preset.label, dataUrl });
      audioRef.current?.pause();
      const audio = new Audio(dataUrl);
      audioRef.current = audio;
      await audio.play().catch(() => undefined);
      await saveAsset(dataUrl, preset.label, 'audio');
      setMessage(`“${preset.label}” salvo em Meus arquivos.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar o som.');
    } finally {
      setBusy('');
    }
  }

  async function removeBackground(file: File) {
    reset();
    setBusy('bg');
    setCutout(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('tolerance', '46');
      const res = await fetch('/api/ai/cutout', { method: 'POST', body: form });
      const data = (await res.json()) as { dataUrl?: string; error?: string; removedPercent?: number };
      if (!res.ok || !data.dataUrl) throw new Error(data.error || 'Falha ao recortar.');
      setCutout(data.dataUrl);
      await saveAsset(data.dataUrl, `${file.name.replace(/\.[a-z0-9]+$/i, '')}-sem-fundo`, 'image');
      setMessage(
        `Fundo removido (${data.removedPercent ?? 0}% da imagem) e salvo em Meus arquivos. Se sobrou fundo, use uma foto com fundo branco/liso.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover o fundo.');
    } finally {
      setBusy('');
    }
  }

  async function transcribe(file: File) {
    reset();
    setBusy('transcribe');
    setProgress('Lendo o áudio…');
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const arrayBuffer = await file.arrayBuffer();
      const decodeCtx = new AudioCtx();
      const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
      if (decoded.duration > 900) {
        throw new Error('Áudio muito longo (mais de 15 minutos). Divida em partes menores.');
      }
      // Whisper trabalha em 16 kHz mono: converter aqui deixa a transcrição rápida.
      const targetRate = 16000;
      const frames = Math.ceil(decoded.duration * targetRate);
      const offline = new OfflineAudioContext(1, frames, targetRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      void decodeCtx.close().catch(() => undefined);

      setProgress('Carregando o modelo de transcrição…');
      const transcriber = await withTimeout(loadWhisper(setProgress), 180_000, 'Carregar o modelo de transcrição');

      setProgress('Transcrevendo no seu dispositivo…');
      const result = await withTimeout(
        transcriber(rendered.getChannelData(0), {
          language: 'portuguese',
          task: 'transcribe',
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: true,
        }),
        300_000,
        'A transcrição',
      );

      const text = result.text?.trim() ?? '';
      if (!text) throw new Error('Não encontrei fala neste áudio. Verifique se o arquivo tem voz.');
      setTranscript(text);
      const chunks = (result.chunks ?? []).filter((chunk) => chunk.text.trim().length > 0);
      const toTime = (value: number) => {
        const total = Math.max(0, value);
        const h = String(Math.floor(total / 3600)).padStart(2, '0');
        const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
        const sec = String(Math.floor(total % 60)).padStart(2, '0');
        const ms = String(Math.round((total % 1) * 1000)).padStart(3, '0');
        return `${h}:${m}:${sec},${ms}`;
      };
      setSrt(
        chunks
          .map((chunk, index) => `${index + 1}\n${toTime(chunk.timestamp[0])} --> ${toTime(chunk.timestamp[1] ?? chunk.timestamp[0] + 3)}\n${chunk.text.trim()}\n`)
          .join('\n'),
      );
      setMessage(
        `Transcrição pronta: ${text.split(/\s+/).length} palavras e ${chunks.length} trechos com tempo. Baixe o .srt ou copie o texto.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na transcrição. Tente um áudio mais curto.');
    } finally {
      setProgress('');
      setBusy('');
    }
  }

  function downloadText(text: string, filename: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'sfx' as Tab, label: 'Sons e efeitos', icon: AudioLines },
          { id: 'bg' as Tab, label: 'Remover fundo', icon: Eraser },
          { id: 'transcribe' as Tab, label: 'Transcrever áudio', icon: FileText },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setTab(item.id);
              reset();
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
              tab === item.id
                ? 'border-brand-400/60 bg-brand-500/15 text-white'
                : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-brand-400/40',
            )}
          >
            <item.icon className="h-3.5 w-3.5" /> {item.label}
          </button>
        ))}
      </div>

      {tab === 'sfx' ? (
        <Card className="p-4">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Efeitos sonoros sintetizados no seu navegador — sem chave, sem limite e sem direitos autorais. O som já entra
            salvo em <strong className="text-slate-300">Meus arquivos</strong>.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SFX.map((preset) => (
              <button
                key={preset.id}
                disabled={Boolean(busy)}
                onClick={() => makeSfx(preset.id)}
                className="flex items-center justify-between gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:border-brand-400/50 disabled:opacity-50"
              >
                <span className="truncate">{preset.label}</span>
                {busy === preset.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 text-brand-300" />}
              </button>
            ))}
          </div>
          {lastSfx ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
              <span className="text-[11px] text-slate-300">{lastSfx.label}</span>
              <audio src={lastSfx.dataUrl} controls className="h-8 flex-1" />
              <a
                href={lastSfx.dataUrl}
                download={`${lastSfx.label.replace(/\s+/g, '-').toLowerCase()}.wav`}
                className="rounded-lg border border-white/12 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-white/10"
              >
                <Download className="mr-1 inline h-3 w-3" /> .wav
              </a>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === 'bg' ? (
        <Card className="p-4">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Remove o fundo da imagem no próprio navegador (IA local, gratuita e ilimitada). O PNG transparente entra em Meus
            arquivos e pode ir para a timeline como qualquer elemento.
          </p>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-xs text-slate-300 hover:border-brand-400/50">
            {busy === 'bg' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            {busy === 'bg' ? 'Recortando… (a primeira vez baixa o modelo)' : 'Escolher imagem do dispositivo'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void removeBackground(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {cutout ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cutout} alt="Imagem sem fundo" className="max-h-72 rounded-xl border border-white/10 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#111_0%_50%)] bg-[length:20px_20px] object-contain" />
              <a
                href={cutout}
                download="imagem-sem-fundo.png"
                className="self-start rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
              >
                <Download className="mr-1 inline h-3 w-3" /> Baixar PNG
              </a>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === 'transcribe' ? (
        <Card className="p-4">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Transcrição com Whisper rodando <strong className="text-slate-300">no seu dispositivo</strong> — grátis e sem
            limite de minutos. Gera o texto e a legenda <code>.srt</code> pronta para importar no editor.
          </p>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-xs text-slate-300 hover:border-brand-400/50">
            {busy === 'transcribe' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {busy === 'transcribe' ? progress || 'Transcrevendo…' : 'Escolher áudio ou vídeo'}
            <input
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void transcribe(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {transcript ? (
            <div className="mt-3 space-y-2">
              <textarea
                readOnly
                value={transcript}
                className="min-h-[140px] w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-200"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(transcript)}>
                  Copiar texto
                </Button>
                <Button variant="secondary" onClick={() => downloadText(srt || transcript, 'legenda.srt')} disabled={!srt}>
                  <Download className="h-4 w-4" /> Baixar .srt
                </Button>
                <Button variant="secondary" onClick={() => downloadText(transcript, 'transcricao.txt')}>
                  <Download className="h-4 w-4" /> Baixar .txt
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {error ? <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">{error}</p> : null}
      {message ? (
        <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">
          <Sparkles className="h-3 w-3" /> {message}
        </p>
      ) : null}
    </div>
  );
}
