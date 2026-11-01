'use client';
import { useState } from 'react';
import { Download, ImageIcon, Loader2, Music, Palette, QrCode, Search, Sparkles, Wand2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import type { FreeItem } from '@/lib/free-media';
import { cn } from '@/lib/utils';

type Tab = 'images' | 'art' | 'audio' | 'icons' | 'ai' | 'qr';

const TABS: Array<{ id: Tab; label: string; icon: typeof ImageIcon }> = [
  { id: 'images', label: 'Fotos livres', icon: ImageIcon },
  { id: 'art', label: 'Arte HD', icon: Palette },
  { id: 'audio', label: 'Músicas', icon: Music },
  { id: 'icons', label: 'Ícones', icon: Sparkles },
  { id: 'ai', label: 'Gerar com IA', icon: Wand2 },
  { id: 'qr', label: 'QR Code', icon: QrCode },
];

/** Imagens de fontes abertas passam pelo nosso proxy (sem hotlink/CORS). */
const proxy = (url: string) => (url ? `/api/free/proxy?u=${encodeURIComponent(url)}` : '');

const SUGGESTIONS: Record<Tab, string[]> = {
  images: ['fundo abstrato', 'praia', 'escritório', 'produto', 'neon', 'comida'],
  art: ['sunset', 'flower', 'portrait', 'landscape', 'golden', 'cat'],
  audio: ['lofi', 'upbeat', 'piano', 'jazz', 'corporate'],
  icons: ['cart', 'truck', 'discount', 'star', 'play'],
  ai: ['fundo de estúdio com luz neon', 'produto de beleza em pedestal', 'cenário tropical'],
  qr: [],
};

export function FreeResources({ storageLabel }: { storageLabel: string }) {
  const [tab, setTab] = useState<Tab>('images');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<FreeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSize, setAiSize] = useState<'1024x1024' | '1024x576' | '576x1024'>('1024x1024');
  const [aiSeed, setAiSeed] = useState(1);
  const [aiResult, setAiResult] = useState<{ dataUrl: string; name: string } | null>(null);
  const [qrText, setQrText] = useState('');

  async function search(withQuery?: string) {
    const q = (withQuery ?? query).trim();
    if (!q) {
      setError('Digite o que você procura.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', source: tab, q }),
      });
      const data = (await res.json()) as { items?: FreeItem[]; error?: string; warning?: string };
      setItems(data.items ?? []);
      if (data.error) setError(data.error);
      if (data.warning) setMessage(data.warning);
    } catch {
      setError('Não foi possível buscar agora.');
    } finally {
      setLoading(false);
    }
  }

  async function save(payload: Record<string, unknown>, id: string) {
    setSavingId(id);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', ...payload }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (data.error) setError(data.error);
      else setMessage('Salvo em Meus arquivos — já aparece na biblioteca do editor.');
    } catch {
      setError('Falha ao salvar o arquivo.');
    } finally {
      setSavingId('');
    }
  }

  async function saveQr() {
    if (!qrText.trim()) {
      setError('Cole o link que vai no QR Code.');
      return;
    }
    setSavingId('qr');
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qr', text: qrText.trim(), name: 'qr-code' }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) setError(data.error);
      else setMessage('QR Code salvo em Meus arquivos.');
    } finally {
      setSavingId('');
    }
  }

  const [aiW, aiH] = aiSize.split('x').map(Number);

  /** Gera a imagem no servidor (com novas tentativas) e mostra o resultado real. */
  async function generateAi() {
    if (aiPrompt.trim().length < 3) {
      setError('Descreva a imagem que você quer gerar.');
      return;
    }
    setError('');
    setMessage('');
    setAiResult(null);
    setSavingId('ai-generating');
    try {
      const res = await fetch('/api/free/ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim(), width: aiW, height: aiH, seed: aiSeed }),
      });
      const data = (await res.json()) as { dataUrl?: string; error?: string; seed?: number };
      if (!res.ok || !data.dataUrl) throw new Error(data.error || 'O gerador não respondeu.');
      setAiResult({ dataUrl: data.dataUrl, name: aiPrompt.trim().slice(0, 50) || 'imagem-ia' });
      setMessage('Imagem gerada. Use “Salvar em Meus arquivos” para levar para o editor.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar a imagem.');
    } finally {
      setSavingId('');
    }
  }

  async function saveAi() {
    if (!aiResult) return;
    setSavingId('ai');
    setError('');
    try {
      const res = await fetch('/api/free/asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: aiResult.dataUrl, name: aiResult.name, kind: 'image' }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Falha ao salvar.');
      setMessage('Imagem salva em Meus arquivos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSavingId('');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setTab(item.id);
              setItems([]);
              setError('');
              setMessage('');
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

      {(tab === 'images' || tab === 'art' || tab === 'audio' || tab === 'icons') && (
        <Card className="p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  tab === 'images'
                    ? 'Ex.: fundo de praia, escritório, produto…'
                    : tab === 'art'
                      ? 'Ex.: sunset, portrait, landscape… (obras em domínio público, sem marca d’água)'
                      : tab === 'audio'
                        ? 'Ex.: lofi, piano, jazz…'
                        : 'Ex.: cart, truck, star… (nomes em inglês)'
                }
                className="w-full rounded-lg border border-white/10 bg-ink-900 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-brand-400/60"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
            </Button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS[tab].map((sug) => (
              <button
                key={sug}
                onClick={() => {
                  setQuery(sug);
                  void search(sug);
                }}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 hover:border-brand-400/40 hover:text-white"
              >
                {sug}
              </button>
            ))}
          </div>
        </Card>
      )}

      {tab === 'ai' && (
        <Card className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              placeholder="Descreva a imagem: fundo de estúdio com luz neon azul…"
              className="flex-1 rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-xs text-white outline-none focus:border-brand-400/60"
            />
            <select
              value={aiSize}
              onChange={(event) => setAiSize(event.target.value as typeof aiSize)}
              className="rounded-lg border border-white/10 bg-ink-900 px-2 py-2 text-xs text-white outline-none focus:border-brand-400/60"
            >
              <option value="1024x1024">Quadrado (post)</option>
              <option value="1024x576">Horizontal (16:9)</option>
              <option value="576x1024">Vertical (9:16 story)</option>
            </select>
            <Button onClick={() => void generateAi()} disabled={savingId === 'ai-generating'}>
              {savingId === 'ai-generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {savingId === 'ai-generating' ? 'Gerando…' : 'Gerar imagem'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setAiSeed(Math.floor(Math.random() * 999_999) + 1);
                setAiResult(null);
              }}
            >
              <Sparkles className="h-4 w-4" /> Outra versão
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.ai.map((sug) => (
              <button
                key={sug}
                onClick={() => setAiPrompt(sug)}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 hover:border-brand-400/40 hover:text-white"
              >
                {sug}
              </button>
            ))}
          </div>
          {aiResult ? (
            <div className="mt-3 space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={aiResult.dataUrl}
                alt="Imagem gerada"
                className="max-h-[380px] w-full rounded-xl border border-white/10 bg-black object-contain"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveAi()} disabled={savingId === 'ai'}>
                  {savingId === 'ai' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Salvar em Meus arquivos
                </Button>
                <a
                  href={aiResult.dataUrl}
                  download={`${aiResult.name.replace(/\s+/g, '-').toLowerCase()}.png`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200 hover:bg-white/5"
                >
                  <Download className="h-4 w-4" /> Baixar
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">
              Geração gratuita, sem chave e sem marca d’água. Escreva o prompt e clique em <strong className="text-slate-300">Gerar imagem</strong>.
            </p>
          )}
        </Card>
      )}

      {tab === 'qr' && (
        <Card className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={qrText}
              onChange={(event) => setQrText(event.target.value)}
              placeholder="https://seu-site.com ou texto do QR"
              className="flex-1 rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-xs text-white outline-none focus:border-brand-400/60"
            />
            <Button onClick={saveQr} disabled={savingId === 'qr'}>
              {savingId === 'qr' ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Salvar QR Code
            </Button>
          </div>
          {qrText.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/free/qr?text=${encodeURIComponent(qrText)}&size=600`}
              alt="QR Code"
              className="mt-3 h-48 w-48 rounded-xl border border-white/10 bg-white p-2"
            />
          ) : null}
        </Card>
      )}

      {error ? <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">{error}</p> : null}
      {message ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">{message}</p>
      ) : null}

      {items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden p-0">
              <div className="relative aspect-video bg-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.kind === 'icon' ? proxy(item.thumb) : proxy(item.thumb)}
                  alt={item.title}
                  loading="lazy"
                  className={cn('h-full w-full', item.kind === 'icon' ? 'object-contain p-6 invert' : 'object-cover')}
                />
              </div>
              <div className="space-y-1 p-2">
                <p className="truncate text-[11px] font-semibold text-white" title={item.title}>
                  {item.title}
                </p>
                <p className="truncate text-[10px] text-slate-500">{item.license || 'livre'}{item.author ? ` · ${item.author}` : ''}</p>
                <button
                  onClick={() =>
                    save(
                      { url: item.url, name: item.title, kind: item.kind, archiveId: item.kind === 'audio' ? item.id.replace(/^archive-/, '') : undefined },
                      item.id,
                    )
                  }
                  disabled={savingId === item.id}
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-brand-500/15 py-1 text-[10px] font-bold text-brand-200 hover:bg-brand-500/25"
                >
                  {savingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Salvar
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <p className="text-[10px] leading-relaxed text-slate-500">
        Fontes gratuitas e sem chave: Wikimedia Commons, Internet Archive, Iconify, Pollinations e QR Server. O que você salvar
        ocupa seu armazenamento ({storageLabel} no seu plano) — dá para apagar em Meus arquivos a qualquer momento.
      </p>
    </div>
  );
}
