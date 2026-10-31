import { CheckCircle2, CreditCard, Globe2, LifeBuoy, QrCode, XCircle } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { Badge, Card } from '@/components/ui';
import { saveGeneralSettings, saveLandingSettings, savePaymentSettings } from '@/app/admin/actions';
import { getSettingsFresh, effectivePayments } from '@/lib/settings';
import { maskSecret, decryptSecret } from '@/lib/crypto';
import { SITE_URL } from '@/lib/env';

export const dynamic = 'force-dynamic';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputCls = 'mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus:border-brand-400/60';
const areaCls = `${inputCls} min-h-[86px] resize-y leading-relaxed`;

export default async function AdminSettings() {
  await requireAdmin();
  const settings = await getSettingsFresh();
  const pay = effectivePayments(settings);
  const general = settings.general;
  const landing = settings.landing;

  const integrations = [
    { name: 'Supabase (banco, auth, storage)', ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { name: 'Stripe', ok: Boolean(decryptSecret(settings.payments.stripe_secret) || process.env.STRIPE_SECRET_KEY) },
    { name: 'Mercado Pago', ok: Boolean(decryptSecret(settings.payments.mp_token) || process.env.MERCADOPAGO_ACCESS_TOKEN) },
    { name: 'PIX manual (comprovante no WhatsApp)', ok: Boolean(settings.payments.pix_key) },
    { name: 'Suporte por WhatsApp', ok: Boolean(general.whatsapp) },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Configurações</h1>
        <p className="mt-1 text-sm text-slate-400">
          Tudo aqui vale para o sistema inteiro: a landing page, o checkout, o suporte e a biblioteca mudam na hora.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={pay.mode === 'manual' ? 'warning' : 'success'}>
          Pagamento em uso: {pay.mode === 'manual' ? 'manual (PIX + comprovante)' : pay.mode}
        </Badge>
        <Badge tone="neutral">Suporte: {general.support_mode}</Badge>
        <Badge tone="neutral">{integrations.filter((i) => i.ok).length}/{integrations.length} integrações ativas</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ---------------- dados da plataforma ---------------- */}
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Globe2 className="h-4 w-4 text-brand-300" /> Plataforma e suporte
          </h3>
          <form action={saveGeneralSettings} className="mt-3 space-y-3">
            <Field label="Nome do sistema">
              <input name="site_name" defaultValue={general.site_name} className={inputCls} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="E-mail de suporte">
                <input name="support_email" type="email" defaultValue={general.support_email} className={inputCls} />
              </Field>
              <Field label="WhatsApp de suporte" hint="Com DDD. Ex.: 49 99999-9999">
                <input name="whatsapp" defaultValue={general.whatsapp} placeholder="49 99999-9999" className={inputCls} />
              </Field>
            </div>
            <Field label="Botão de suporte que o cliente vê" hint="Escolha quais canais aparecem para o usuário.">
              <select name="support_mode" defaultValue={general.support_mode} className={inputCls}>
                <option value="both">E-mail e WhatsApp</option>
                <option value="whatsapp">Somente WhatsApp</option>
                <option value="email">Somente e-mail</option>
                <option value="none">Nenhum (esconder)</option>
              </select>
            </Field>
            <Field label="Mensagem pronta do WhatsApp">
              <input name="whatsapp_message" defaultValue={general.whatsapp_message} className={inputCls} />
            </Field>
            <Field label="Tamanho máximo de upload (MB)">
              <input name="max_upload_mb" type="number" min={10} defaultValue={general.max_upload_mb} className={inputCls} />
            </Field>
            <button className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-400">Salvar</button>
          </form>
        </Card>

        {/* ---------------- landing ---------------- */}
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <LifeBuoy className="h-4 w-4 text-amber-300" /> Landing page
          </h3>
          <form action={saveLandingSettings} className="mt-3 space-y-3">
            <Field label="Título principal">
              <input name="headline" defaultValue={landing.headline} className={inputCls} />
            </Field>
            <Field label="Subtítulo">
              <textarea name="subheadline" defaultValue={landing.subheadline} className={areaCls} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Texto do botão">
                <input name="cta_label" defaultValue={landing.cta_label} className={inputCls} />
              </Field>
              <Field label="Aviso no topo (opcional)">
                <input name="announcement" defaultValue={landing.announcement} placeholder="Ex.: promo de lançamento" className={inputCls} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-slate-300">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="show_pricing" defaultChecked={landing.show_pricing} className="h-3.5 w-3.5 accent-brand-500" />
                Mostrar planos
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="show_support" defaultChecked={landing.show_support} className="h-3.5 w-3.5 accent-brand-500" />
                Mostrar botão de suporte
              </label>
            </div>
            <button className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-400">Salvar landing</button>
            <p className="text-[10px] leading-relaxed text-slate-500">
              As alterações valem para <code className="text-brand-300">{SITE_URL}</code> em até 30 segundos (cache curto).
            </p>
          </form>
        </Card>
      </div>

      {/* ---------------- pagamentos ---------------- */}
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <CreditCard className="h-4 w-4 text-emerald-300" /> Gateway de pagamento
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Escolha como o cliente paga. As chaves ficam criptografadas no banco (AES-256-GCM) e nunca aparecem no navegador do
          cliente. Se você não configurar gateway nenhum, o checkout funciona no modo manual.
        </p>
        <form action={savePaymentSettings} className="mt-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Modo de cobrança">
              <select name="mode" defaultValue={settings.payments.mode} className={inputCls}>
                <option value="manual">Manual — PIX + comprovante</option>
                <option value="stripe">Stripe — cartão</option>
                <option value="mercadopago">Mercado Pago — PIX/cartão</option>
                <option value="demo">Demonstração — libera na hora</option>
              </select>
            </Field>
            <Field label="Moeda">
              <input name="currency" defaultValue={settings.payments.currency} className={inputCls} />
            </Field>
            <Field label="WhatsApp para comprovante" hint="Se vazio, usa o WhatsApp do suporte.">
              <input name="receipt_whatsapp" defaultValue={settings.payments.receipt_whatsapp} placeholder="49 99999-9999" className={inputCls} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Chave PIX">
              <input name="pix_key" defaultValue={settings.payments.pix_key} placeholder="e-mail, CPF/CNPJ, telefone ou aleatória" className={inputCls} />
            </Field>
            <Field label="Nome do recebedor (PIX)">
              <input name="pix_holder" defaultValue={settings.payments.pix_holder} placeholder="Nome que aparece no seu banco" className={inputCls} />
            </Field>
          </div>

          <Field label="Instruções do pagamento manual" hint="Aparece no checkout para o cliente.">
            <textarea name="manual_instructions" defaultValue={settings.payments.manual_instructions} className={areaCls} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[11px] font-semibold text-white">Stripe</p>
              <Field label="Chave pública (pk_…)">
                <input name="stripe_public" defaultValue={settings.payments.stripe_public} placeholder="pk_live_…" className={inputCls} />
              </Field>
              <Field label="Chave secreta (sk_…)" hint={settings.payments.stripe_secret ? `Já salva: ${maskSecret(settings.payments.stripe_secret)} — deixe vazio para manter.` : 'Nunca é exibida de volta.'}>
                <input name="stripe_secret" type="password" placeholder="sk_live_…" className={inputCls} autoComplete="off" />
              </Field>
              <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                <input type="checkbox" name="clear_stripe" className="h-3 w-3 accent-rose-500" /> remover chave salva
              </label>
              <p className="mt-1 text-[10px] text-slate-500">Webhook: <code className="text-brand-300">{SITE_URL}/api/webhooks/stripe</code></p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[11px] font-semibold text-white">Mercado Pago</p>
              <Field label="Public key">
                <input name="mp_public" defaultValue={settings.payments.mp_public} placeholder="APP_USR-…" className={inputCls} />
              </Field>
              <Field label="Access token" hint={settings.payments.mp_token ? `Já salvo: ${maskSecret(settings.payments.mp_token)} — deixe vazio para manter.` : 'Guardado criptografado.'}>
                <input name="mp_token" type="password" placeholder="APP_USR-…" className={inputCls} autoComplete="off" />
              </Field>
              <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                <input type="checkbox" name="clear_mp" className="h-3 w-3 accent-rose-500" /> remover token salvo
              </label>
              <p className="mt-1 text-[10px] text-slate-500">Webhook: <code className="text-brand-300">{SITE_URL}/api/webhooks/mercadopago</code></p>
            </div>
          </div>

          <Field label="Observação de antifraude / política (opcional)" hint="Ex.: só liberamos após conferir o comprovante; reembolso em 7 dias.">
            <textarea name="diligence_note" defaultValue={settings.payments.diligence_note} className={areaCls} />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-black hover:bg-emerald-400">Salvar pagamentos</button>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <QrCode className="h-3 w-3" /> O modo manual exige chave PIX ou WhatsApp para o comprovante.
            </span>
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white">Integrações</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {integrations.map((i) => (
            <li key={i.name} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-slate-300">
              {i.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-slate-600" />}
              {i.name}
              <span className="ml-auto text-[10px] text-slate-500">{i.ok ? 'ativo' : 'não configurado'}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
