'use client';

/**
 * StockKeysPanel — chaves dos bancos gratuitos (Módulo 2 · item 1).
 *
 * Problema relatado: "as chaves não estão sendo salvas". O painel agora:
 *   • grava cada chave no servidor (`POST /api/stock/key`, criptografada em
 *     `es_user_integrations`) e devolve estado real — não é só localStorage;
 *   • tem **Testar conexão** em cada campo, que faz uma busca mínima de verdade
 *     no provedor e mostra toast verde (Sucesso) ou vermelho (Erro + motivo);
 *   • explica quando o admin bloqueou chaves próprias (o 403 antigo silencioso).
 *
 * Componente isolado: recebe o estado inicial pronto do servidor.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, PlugZap, Save, TriangleAlert, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Provider = 'pexels' | 'unsplash' | 'pixabay' | 'freesound';

type Status = Record<Provider, { configured: boolean; source: 'user' | 'shared' | 'off'; signup: string }>;

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: 'pexels', label: 'Pexels', hint: 'vídeos 4K e fotos HD · chave gratuita em pexels.com/api' },
  { id: 'unsplash', label: 'Unsplash', hint: 'fotos em alta resolução · unsplash.com/developers' },
  { id: 'pixabay', label: 'Pixabay', hint: 'vídeos, fotos e ÁUDIO (SFX e músicas) · pixabay.com/api/docs' },
  { id: 'freesound', label: 'Freesound', hint: 'efeitos sonoros e ambientes · freesound.org/apiv2/apply' },
];

type Toast = { type: 'ok' | 'err'; title: string; detail?: string } | null;

export function StockKeysPanel({ initialStatus, allowUserKeys }: { initialStatus: Status; allowUserKeys: boolean }) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [drafts, setDrafts] = useState<Record<Provider, string>>({ pexels: '', unsplash: '', pixabay: '', freesound: '' });
  const [busy, setBusy] = useState<string>('');
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function save(provider: Provider) {
    const key = drafts[provider].trim();
    if (!key) {
      setToast({ type: 'err', title: 'Cole a chave antes de salvar', detail: 'A chave gratuita é copiada do site do provedor.' });
      return;
    }
    setBusy(`save-${provider}`);
    try {
      const res = await fetch('/api/stock/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setToast({ type: 'err', title: 'A chave não foi salva', detail: data.error ?? `Erro ${res.status}` });
        return;
      }
      setStatus((prev) => ({ ...prev, [provider]: { ...prev[provider], configured: true, source: 'user' } }));
      setDrafts((prev) => ({ ...prev, [provider]: '' }));
      setToast({ type: 'ok', title: `Chave do ${label(provider)} salva`, detail: 'Criptografada no servidor. Testando a conexão…' });
      await test(provider);
    } catch {
      setToast({ type: 'err', title: 'Falha de rede ao salvar', detail: 'Tente novamente em instantes.' });
    } finally {
      setBusy('');
    }
  }

  async function test(provider: Provider) {
    setBusy(`test-${provider}`);
    try {
      const res = await fetch('/api/stock/key/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: drafts[provider].trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; ms?: number; items?: number; error?: string; source?: string };
      if (res.ok && data.ok) {
        setToast({
          type: 'ok',
          title: `Sucesso — ${label(provider)} conectado`,
          detail: `${data.items ?? 0} resultado(s) de teste em ${data.ms ?? 0} ms${data.source === 'shared' ? ' · usando a chave do Editor Studio' : ''}.`,
        });
      } else {
        setToast({
          type: 'err',
          title: `Erro — ${label(provider)} recusou a conexão`,
          detail: data.error ?? `HTTP ${res.status}`,
        });
      }
    } catch {
      setToast({ type: 'err', title: 'Erro — sem resposta', detail: 'Não foi possível falar com o servidor.' });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-4">
      {!allowUserKeys ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            O administrador desativou chaves próprias. Enquanto isso, a plataforma usa a chave do Editor Studio quando ela
            existir — se nenhuma fonte responder, fale com o suporte.
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const info = status[provider.id];
          const saving = busy === `save-${provider.id}`;
          const testing = busy === `test-${provider.id}`;
          return (
            <div key={provider.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-brand-300" />
                <p className="text-sm font-semibold text-white">{provider.label}</p>
                <span
                  className={cn(
                    'ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                    info.source === 'user'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : info.source === 'shared'
                        ? 'bg-sky-500/15 text-sky-300'
                        : 'bg-amber-500/15 text-amber-300',
                  )}
                >
                  {info.source === 'user' ? 'sua chave' : info.source === 'shared' ? 'chave do Studio' : 'sem chave'}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{provider.hint}</p>

              <input
                type="password"
                value={drafts[provider.id]}
                onChange={(event) => setDrafts((prev) => ({ ...prev, [provider.id]: event.target.value }))}
                placeholder={info.configured ? '•••••••••••• (deixe vazio para manter)' : 'cole a chave gratuita aqui'}
                autoComplete="off"
                disabled={!allowUserKeys}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-brand-400/60 disabled:opacity-50"
              />

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void save(provider.id)}
                  disabled={!allowUserKeys || saving}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-400 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                </button>
                <button
                  type="button"
                  onClick={() => void test(provider.id)}
                  disabled={testing}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                >
                  {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlugZap className="h-3 w-3" />} Testar conexão
                </button>
                <a
                  href={info.signup}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-brand-300 hover:underline"
                >
                  pegar chave <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* toast (verde = sucesso, vermelho = erro) */}
      <div
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed inset-x-3 bottom-4 z-[80] mx-auto max-w-md transition-all duration-300 sm:left-auto sm:right-5 sm:mx-0',
          toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
        )}
      >
        {toast ? (
          <div
            className={cn(
              'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur',
              toast.type === 'ok'
                ? 'border-emerald-400/40 bg-emerald-500/95 text-emerald-950'
                : 'border-rose-400/40 bg-rose-500/95 text-white',
            )}
          >
            {toast.type === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-bold">{toast.title}</p>
              {toast.detail ? <p className="opacity-90">{toast.detail}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function label(provider: Provider) {
  return PROVIDERS.find((item) => item.id === provider)?.label ?? provider;
}
