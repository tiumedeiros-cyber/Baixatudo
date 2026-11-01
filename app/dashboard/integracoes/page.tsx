import Link from 'next/link';
import { CheckCircle2, ExternalLink, KeyRound, ShieldCheck, XCircle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { Badge, Card } from '@/components/ui';
import { saveMyIntegrations } from './actions';
import { userIntegrationState } from '@/lib/user-integrations';
import { getSettings } from '@/lib/settings';
import { stockKeyStatus } from '@/lib/fetchers/keys';
import { StockKeysPanel } from '@/components/integrations/StockKeysPanel';

export const metadata = { title: 'Minhas integrações · Editor Studio' };
export const dynamic = 'force-dynamic';

const inputCls =
  'mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-brand-400/60 disabled:opacity-50';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{hint}</span> : null}
    </label>
  );
}

function SourceBadge({ source, label }: { source: 'user' | 'shared' | 'off'; label: string }) {
  if (source === 'user') return <Badge tone="success">{label}: sua chave</Badge>;
  if (source === 'shared') return <Badge tone="neutral">{label}: chave do Editor Studio</Badge>;
  return <Badge tone="warning">{label}: desligado</Badge>;
}

export default async function MyIntegrationsPage() {
  const { user } = await requireUser();
  const state = await userIntegrationState(user!.id);
  const settings = await getSettings();
  // Módulo 2 · item 1: estado real das chaves dos bancos gratuitos (banco de dados)
  const stockKeys = await stockKeyStatus(user!.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
          <KeyRound className="h-6 w-6 text-brand-300" /> Minhas integrações
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Aqui você liga as ferramentas pagas usando <strong className="text-slate-200">a sua própria conta</strong> — os
          créditos consumidos são só seus, sem dividir nada com outros usuários. As chaves são criptografadas e nunca
          aparecem de volta na tela.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <SourceBadge source={state.resolved.kieSource} label="Animação IA" />
        <SourceBadge source={state.resolved.postizSource} label="Publicação TikTok" />
      </div>

      {/* Bancos gratuitos (Pexels, Unsplash, Pixabay, Freesound) — chaves + teste de conexão */}
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound className="h-4 w-4 text-emerald-300" /> Bibliotecas gratuitas — suas chaves
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Todas têm plano gratuito. A chave fica criptografada no servidor e é usada na hora em{' '}
          <Link href="/dashboard/recursos" className="text-brand-300 hover:underline">Recursos grátis</Link> e na aba
          <strong className="text-slate-200"> Bancos</strong> do editor. &quot;Testar conexão&quot; faz uma busca real e mostra
          verde (sucesso) ou vermelho (erro).
        </p>
        <div className="mt-4">
          <StockKeysPanel initialStatus={stockKeys} allowUserKeys={settings.integrations.allow_user_stock} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white">Kie AI — Kling Motion Control</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Usada em <Link href="/dashboard/animacao" className="text-brand-300 hover:underline">Animação IA</Link> para animar
            uma imagem seguindo um vídeo de referência. Crie a chave em kie.ai → API Keys (a conta precisa de créditos).
          </p>
          {!state.canOwnKie ? (
            <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-200">
              O administrador desativou chaves próprias por enquanto. {state.sharedKie ? 'Você continua usando a chave do Editor Studio.' : 'A animação fica indisponível até ele liberar.'}
            </p>
          ) : null}
          <form action={saveMyIntegrations} className="mt-3 space-y-3">
            <Field
              label="Sua chave da Kie AI"
              hint={state.hasOwnKie ? 'Já existe uma chave salva. Deixe vazio para manter.' : 'Guardada criptografada (AES-256-GCM).'}
            >
              <input
                name="kie_key"
                type="password"
                placeholder={state.hasOwnKie ? '••••••••••••' : 'kie_…'}
                className={inputCls}
                autoComplete="off"
                disabled={!state.canOwnKie}
              />
            </Field>
            <label className="flex items-center gap-2 text-[10px] text-slate-400">
              <input type="checkbox" name="clear_kie" className="h-3 w-3 accent-rose-500" disabled={!state.canOwnKie} /> remover
              minha chave salva
            </label>

            <div className="border-t border-white/8 pt-3">
              <h4 className="text-[11px] font-semibold text-white">Postiz — publicar no TikTok</h4>
              <div className="mt-2 space-y-3">
                <Field
                  label="Sua API key da Postiz"
                  hint={state.hasOwnPostiz ? 'Já existe uma chave salva. Deixe vazio para manter.' : 'Postiz → Settings → Public API.'}
                >
                  <input
                    name="postiz_key"
                    type="password"
                    placeholder={state.hasOwnPostiz ? '••••••••••••' : 'sua chave pública da Postiz'}
                    className={inputCls}
                    autoComplete="off"
                    disabled={!state.canOwnPostiz}
                  />
                </Field>
                <Field label="Integration ID do seu TikTok" hint="Aparece na URL do canal dentro da Postiz.">
                  <input
                    name="postiz_tiktok"
                    defaultValue={state.postizTiktok}
                    placeholder="cm…"
                    className={inputCls}
                    disabled={!state.canOwnPostiz}
                  />
                </Field>
                <label className="flex items-center gap-2 text-[10px] text-slate-400">
                  <input type="checkbox" name="clear_postiz" className="h-3 w-3 accent-rose-500" disabled={!state.canOwnPostiz} />{' '}
                  remover minhas credenciais da Postiz
                </label>
              </div>
            </div>

            <button className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400">
              Salvar minhas integrações
            </button>
          </form>
        </Card>

        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-300" /> Como as chaves são usadas
          </h3>
          <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-slate-400">
            <li className="flex items-start gap-2">
              {state.resolved.kieSource === 'off' ? (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              )}
              <span>
                Se você cadastrar sua chave, ela tem <strong className="text-slate-200">prioridade</strong> — o consumo vai
                para a sua conta e não afeta os outros usuários.
              </span>
            </li>
            <li className="flex items-start gap-2">
              {state.sharedKie ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
              )}
              <span>
                Sem chave própria, o sistema usa a chave do Editor Studio{' '}
                {state.sharedKie ? 'quando o admin libera' : '— hoje o admin não liberou a dele'}.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300" />
              <span>As chaves ficam só no servidor, criptografadas. Nem o navegador nem outro cliente conseguem lê-las.</span>
            </li>
          </ul>
          <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[11px] text-slate-400">
            <p className="font-semibold text-white">Precisa de chave?</p>
            <p className="mt-1 leading-relaxed">
              Kie AI: <span className="text-brand-300">kie.ai</span> · Postiz:{' '}
              <span className="text-brand-300">postiz.com</span>. A publicação gratuita que já vem no sistema (legendas,
              biblioteca, Baixa Tudo) continua funcionando sem chave nenhuma.
            </p>
            <Link
              href="/dashboard/animacao"
              className="mt-2 inline-flex items-center gap-1 text-brand-300 hover:underline"
            >
              Abrir Animação IA <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
