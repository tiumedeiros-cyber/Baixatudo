'use client';
import { useEffect, useRef, useState } from 'react';
import { AudioLines, Download, Loader2, Mic, Play, Square, Subtitles, Volume2, Wand2 } from 'lucide-react';
import { useStudio } from './store';
import { uid } from '@/lib/utils';
import { VOICES, DEFAULT_VOICE, RATES } from '@/lib/catalog/voices';
import { VoiceClonePanel } from './VoiceClonePanel';
import { CaptionTemplates } from './CaptionTemplates';

type Segment = { url: string; text: string; duration: number };

const LOCALES = Array.from(new Set(VOICES.map((v) => v.locale)));

export function TtsPanel({ projectId, onAdded }: { projectId: string; onAdded?: () => void }) {
  const [text, setText] = useState('Bem-vindo ao Editor Studio. Edite vídeos em minutos, direto no navegador.');
  const [lang, setLang] = useState('pt-BR');
  const [voiceURI, setVoiceURI] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [serverEngine, setServerEngine] = useState<string | null>(null);
  const [serverVoices, setServerVoices] = useState<string[]>([]);
  const [voiceLabels, setVoiceLabels] = useState<Record<string, string>>({});
  const [neuralVoices, setNeuralVoices] = useState<{ id: string; label: string; lang: string }[]>([]);
  const [presets, setPresets] = useState<{ id: string; label: string; lang: string }[]>([]);
  const [voiceOk, setVoiceOk] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [serverVoice, setServerVoice] = useState(DEFAULT_VOICE);
  const [rate, setRate] = useState<'normal' | 'lenta'>('normal');
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  /* ── Módulo 1 · item 3: prévia automática ao trocar de voz ─────────────────
   * Cada amostra é buscada uma única vez em /api/tts/sample (o servidor também
   * guarda em cache) e fica num Map de blob URLs — trocar de voz e voltar é
   * instantâneo e não gasta nada.
   * ---------------------------------------------------------------------- */
  const [sampleState, setSampleState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [sampleLabel, setSampleLabel] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleCache = useRef<Map<string, string>>(new Map());
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewToken = useRef(0);

  function stopSample() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSampleState('idle');
  }

  async function previewVoice(voiceId: string, voiceLang: string, label = '') {
    const token = ++previewToken.current;
    stopSample();
    setSampleLabel(label);
    setSampleState('loading');
    const key = `${voiceId}|${voiceLang}`;
    try {
      let src = sampleCache.current.get(key);
      if (!src) {
        const res = await fetch(`/api/tts/sample?voice=${encodeURIComponent(voiceId)}&lang=${encodeURIComponent(voiceLang)}`, {
          cache: 'force-cache',
        });
        if (!res.ok) throw new Error('sample');
        const blob = await res.blob();
        if (!blob.size) throw new Error('empty');
        src = URL.createObjectURL(blob);
        sampleCache.current.set(key, src);
      }
      if (token !== previewToken.current) return; // trocou de voz no meio
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.onended = () => setSampleState('idle');
      audio.src = src;
      await audio.play();
      setSampleState('playing');
    } catch {
      // motor neural indisponível: prévia com a voz do navegador (na hora)
      if (token !== previewToken.current) return;
      if (!('speechSynthesis' in window)) {
        setSampleState('idle');
        return;
      }
      const utter = new SpeechSynthesisUtterance('Olá! Esta é a minha voz no Editor Studio.');
      utter.lang = voiceLang;
      const match = voices.find((v) => v.lang.toLowerCase().startsWith(voiceLang.slice(0, 2).toLowerCase()));
      if (match) utter.voice = match;
      utter.onend = () => setSampleState('idle');
      window.speechSynthesis.speak(utter);
      setSampleState('playing');
    }
  }

  function schedulePreview(voiceId: string, voiceLang: string, label = '') {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      if (voiceId) void previewVoice(voiceId, voiceLang, label);
    }, 220);
  }

  useEffect(() => () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    audioRef.current?.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  // situação real do motor de voz no servidor
  useEffect(() => {
    let alive = true;
    fetch('/api/tts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data:
            | { engine?: string; serverVoices?: string[]; voices?: { id: string; label: string; lang: string }[]; presets?: { id: string; label: string; lang: string }[] }
            | null,
        ) => {
        if (!alive || !data) return;
        setServerEngine(data.engine ?? null);
        setServerVoices(data.serverVoices ?? []);
        setVoiceLabels(Object.fromEntries((data.voices ?? []).map((v) => [v.id, v.label])));
        setNeuralVoices((data.voices ?? []) as { id: string; label: string; lang: string }[]);
        setPresets((data.presets ?? []) as { id: string; label: string; lang: string }[]);
        setServerVoice((prev) => prev || DEFAULT_VOICE);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function testVoice() {
    setTesting(true);
    setVoiceOk(null);
    try {
      const res = await fetch('/api/tts?probe=1', { cache: 'no-store' });
      const data = (await res.json()) as { results?: Record<string, { ok: boolean; ms: number; detail?: string }> };
      const entries = Object.entries(data.results ?? {});
      const working = entries.filter(([, r]) => r.ok);
      setVoiceOk(working.length > 0);
      setInfo(
        working.length
          ? `Voz funcionando (${working.map(([name]) => name).join(' → ')}). Primeira síntese em ${Math.round(working[0][1].ms / 100) / 10}s.`
          : 'Nenhuma fonte de voz respondeu agora. Use “Ouvir prévia” (voz do navegador) ou adicione o texto como legenda.',
      );
    } catch {
      setVoiceOk(false);
      setInfo('Não foi possível testar a voz agora.');
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  function previewBrowser() {
    if (!('speechSynthesis' in window)) {
      setError('Este navegador não tem síntese de voz. Use a geração no servidor.');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 600));
    utter.lang = lang;
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) utter.voice = voice;
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
    setInfo('Prévia local (não entra na exportação). Use “Gerar áudio” para gravar na timeline.');
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang, projectId, voice: serverVoice, speed: rate }),
      });
      const data = (await res.json()) as { segments?: Segment[]; error?: string; engine?: string };
      if (!res.ok || !data.segments) throw new Error(data.error || 'Falha na geração');
      const s = useStudio.getState();
      let cursor = s.playhead;
      const track = s.tracks.find((t) => t.kind === 'audio') ?? s.tracks[0];
      data.segments.forEach((seg) => {
        s.addClip({
          kind: 'audio',
          src: seg.url,
          name: `Narração ${data.engine ?? 'ia'}`,
          trackId: track?.id ?? '',
          start: cursor,
          duration: seg.duration,
          volume: 1,
        });
        cursor += seg.duration;
      });
      const total = cursor - s.playhead;
      if (cursor > useStudio.getState().duration) useStudio.setState({ duration: Math.ceil(cursor + 1) });
      setInfo(`Narração adicionada à timeline (${total.toFixed(1)}s · ${data.segments.length} bloco(s)).`);
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  function startDictation() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setError('Ditado disponível no Chrome, Edge ou Safari. Para outros navegadores use a narração TTS.');
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const phrase = last[0].transcript.trim();
      if (!phrase) return;
      setTranscript((t) => `${t} ${phrase}`.trim());
      const s = useStudio.getState();
      const track = s.tracks.find((t) => t.name.toLowerCase().includes('texto')) ?? s.tracks.find((t) => t.kind === 'visual');
      s.addClip({
        kind: 'text',
        src: 'text',
        name: 'Legenda',
        trackId: track?.id ?? '',
        start: s.playhead,
        duration: Math.max(1.5, phrase.length / 14),
        text: {
          content: phrase,
          fontFamily: 'Inter',
          fontSize: 48,
          color: '#ffffff',
          weight: 700,
          align: 'center',
          shadow: true,
          stroke: 0,
          strokeColor: '#000000',
          background: 'rgba(0,0,0,0.6)',
          letterSpacing: 0,
          lineHeight: 1.2,
          gradient: '',
          animation: 'none',
        },
      });
      const st = useStudio.getState();
      useStudio.setState({ playhead: Math.min(st.duration, st.playhead + Math.max(1.5, phrase.length / 14)) });
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
    setInfo('Gravando ditado… fale e as legendas aparecem na timeline.');
  }

  function stopDictation() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function exportSrt() {
    const s = useStudio.getState();
    const texts = s.clips.filter((c) => c.kind === 'text').sort((a, b) => a.start - b.start);
    const fmt = (t: number) => {
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const sec = Math.floor(t % 60);
      const ms = Math.floor((t % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    const srt = texts
      .map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.start + c.duration)}\n${c.text?.content ?? ''}\n`)
      .join('\n');
    const blob = new Blob([srt || '1\n00:00:00,000 --> 00:00:02,000\n(sem legendas)\n'], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `legendas-${uid('srt')}.srt`;
    a.click();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2">
        <p className="flex items-center gap-1 text-[11px] font-semibold text-white"><AudioLines className="h-3.5 w-3.5 text-brand-300" /> Texto → Áudio</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={5000}
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] text-white outline-none focus:border-brand-400/50"
        />
        <div className="mt-2 grid grid-cols-1 gap-2">
          <select
            value={serverVoice}
            onChange={(e) => {
              const id = e.target.value;
              setServerVoice(id);
              const neural = presets.find((x) => x.id === id) ?? neuralVoices.find((x) => x.id === id);
              const v = neural ?? VOICES.find((x) => x.id === id);
              const nextLang = v?.lang ?? lang;
              setLang(nextLang);
              // Módulo 1 · item 3: ouve a voz nova na hora (sem botão)
              schedulePreview(id, nextLang, neural?.label ?? v?.label ?? id);
            }}
            className="w-full rounded-lg border border-white/10 bg-ink-900 px-1.5 py-1 text-[10px] text-white outline-none"
          >
            {presets.length ? (
              <optgroup label="Vozes em português e inglês (timbre próprio)">
                {presets.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </optgroup>
            ) : null}
            {Array.from(new Set(neuralVoices.map((v) => v.lang))).map((locale) => (
              <optgroup key={`neural-${locale}`} label={`Vozes neurais · ${locale}`}>
                {neuralVoices
                  .filter((v) => v.lang === locale)
                  .map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
              </optgroup>
            ))}
            {LOCALES.map((locale) => (
              <optgroup key={locale} label={locale}>
                {VOICES.filter((v) => v.locale === locale).map((v) => (
                  <option key={v.id} value={v.id}>{v.label} — {v.hint}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select value={rate} onChange={(e) => setRate(e.target.value as 'normal' | 'lenta')} className="w-full rounded-lg border border-white/10 bg-ink-900 px-1.5 py-1 text-[10px] text-white outline-none">
            {RATES.map((r) => (
              <option key={r.id} value={r.id}>Ritmo {r.label.toLowerCase()}</option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-[9px] text-slate-500">
          {(VOICES.length + neuralVoices.length + presets.length).toString()} vozes disponíveis ·{' '}
          {presets.filter((v) => v.lang === 'pt-BR').length || 9} timbres diferentes em português
        </p>
        {sampleState !== 'idle' ? (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-brand-400/30 bg-brand-500/10 px-2 py-1 text-[9px] text-brand-100">
            {sampleState === 'loading' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Volume2 className="h-2.5 w-2.5" />}
            <span className="truncate">{sampleState === 'loading' ? 'Preparando a voz…' : `Ouvindo: ${sampleLabel || 'voz selecionada'}`}</span>
            <button onClick={stopSample} className="ml-auto rounded px-1 text-[9px] font-semibold text-brand-200 hover:bg-white/10">
              parar
            </button>
          </div>
        ) : null}
        <div className="mt-2 flex gap-1.5">
          <button onClick={previewBrowser} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[10px] font-semibold text-slate-200 hover:bg-white/10">
            <Play className="h-3 w-3" /> Ouvir prévia
          </button>
          <button onClick={generate} disabled={loading} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 py-1.5 text-[10px] font-semibold text-white disabled:opacity-60">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} Gerar áudio
          </button>
        </div>
        <select
          value={voiceURI}
          onChange={(e) => {
            setVoiceURI(e.target.value);
            if (!e.target.value) return;
            const chosen = voices.find((v) => v.voiceURI === e.target.value);
            if (!chosen || !('speechSynthesis' in window)) return;
            stopSample();
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance('Olá! Esta é a minha voz.');
            utter.voice = chosen;
            utter.lang = chosen.lang;
            utter.onend = () => setSampleState('idle');
            window.speechSynthesis.speak(utter);
            setSampleState('playing');
            setSampleLabel(`${chosen.name} · ${chosen.lang}`);
          }}
          className="mt-2 w-full rounded-lg border border-white/10 bg-ink-900 px-1.5 py-1 text-[10px] text-white outline-none"
        >
          <option value="">Voz do navegador (prévia)</option>
          {voices.filter((v) => v.lang.startsWith(lang.slice(0, 2))).map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>
          ))}
        </select>
        <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
          “Ouvir prévia” usa as vozes instaladas no seu navegador. “Gerar áudio” cria o MP3 na conta (motor do servidor) com duração exata do áudio.
        </p>
      </div>

      <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2">
        <p className="flex items-center gap-1 text-[11px] font-semibold text-white"><Subtitles className="h-3.5 w-3.5 text-cyan-300" /> Áudio → Texto</p>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-500">Ditado por voz gera legendas editáveis na timeline, com tempo sincronizado.</p>
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={listening ? stopDictation : startDictation}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-semibold ${listening ? 'bg-rose-500/20 text-rose-200' : 'bg-white/5 text-slate-200 hover:bg-white/10'}`}
          >
            {listening ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />} {listening ? 'Parar ditado' : 'Ditar legendas'}
          </button>
          <button onClick={exportSrt} className="flex items-center justify-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:bg-white/10">
            <Download className="h-3 w-3" /> .srt
          </button>
        </div>
        {transcript ? <p className="mt-2 max-h-16 overflow-y-auto rounded bg-black/30 p-1.5 text-[9px] leading-relaxed text-slate-400">{transcript}</p> : null}

        {/* Áudio → Texto: escolha do estilo da legenda logo depois de ditar/transcrever */}
        <div className="mt-2">
          <CaptionTemplates onApplied={(msg) => setInfo(msg)} />
        </div>
      </div>

      {serverEngine ? (
        <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[9px] leading-relaxed ${
          voiceOk === false
            ? 'border-amber-400/25 bg-amber-500/10 text-amber-200'
            : 'border-white/10 bg-white/[0.03] text-slate-400'
        }`}>
          <span className="min-w-0 flex-1">
            Motor: <strong className="text-white">{serverEngine === 'edge' ? 'voz do servidor (nuvem)' : serverEngine}</strong>
            {voiceOk === true ? ' · funcionando' : voiceOk === false ? ' · sem resposta agora' : ' · narração salva na sua conta e inserida na timeline'}
          </span>
          <button
            type="button"
            onClick={testVoice}
            disabled={testing}
            className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {testing ? 'testando…' : 'testar'}
          </button>
        </div>
      ) : null}

      {/* Voz clonada grátis pelo celular (servidores públicos XTTS) */}
      <VoiceClonePanel text={text} onDone={(msg) => setInfo(msg)} />

      {info ? <p className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-200">{info}</p> : null}
      {error ? (
        <div className="space-y-1.5">
          <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">{error}</p>
          <button
            onClick={() => {
              const s2 = useStudio.getState();
              const track = s2.tracks.find((t) => t.name.toLowerCase().includes('texto')) ?? s2.tracks.find((t) => t.kind === 'visual');
              s2.addClip({
                kind: 'text',
                src: 'text',
                name: 'Narração (texto)',
                trackId: track?.id ?? '',
                start: s2.playhead,
                duration: Math.max(2, Math.min(20, text.length / 14)),
                text: {
                  content: text,
                  fontFamily: 'Montserrat',
                  fontSize: 46,
                  color: '#ffffff',
                  weight: 700,
                  align: 'center',
                  shadow: true,
                  stroke: 0,
                  strokeColor: '#000000',
                  background: 'rgba(0,0,0,0.5)',
                  letterSpacing: 0,
                  lineHeight: 1.2,
                  gradient: '',
                  animation: 'none',
                },
              });
              setInfo('Texto adicionado como legenda na timeline.');
              setError(null);
            }}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-[10px] font-semibold text-slate-200 hover:bg-white/10"
          >
            Adicionar como legenda na timeline
          </button>
        </div>
      ) : null}
    </div>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: { results: { [index: number]: { [index: number]: { transcript: string } } } & { length: number } }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};
