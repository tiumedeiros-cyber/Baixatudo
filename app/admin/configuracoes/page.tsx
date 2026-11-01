import { CheckCircle2, CreditCard, Globe2, HardDrive, LifeBuoy, QrCode, Sparkles, XCircle } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { Badge, Card } from '@/components/ui';
import { saveGeneralSettings, saveLandingSettings, savePaymentSettings, saveIntegrationSettings, saveStorageSettings } from '@/app/admin/actions';
import { StorageTest } from '@/components/admin/StorageTest';
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
    { name: 'Kie AI (Kling motion control)', ok: Boolean(decryptSecret(settings.integrations.kie_key) || process.env.KIE_API_KEY) },
    { name: 'Postiz (publicação TikTok)', ok: Boolean(decryptSecret(settings.integrations.postiz_key) || process.env.POSTIZ_API_KEY) },
    // bancos gratuitos do Módulo 2 (chave do usuário também vale, ver /api/stock/key)
    { name: 'Pexels (vídeos/fotos B-roll)', ok: Boolean(settings.integrations.pexels_key || process.env.PEXELS_API_KEY) },
    { name: 'Unsplash (fotos 4K)', ok: Boolean(settings.integrations.unsplash_key || process.env.UNSPLASH_ACCESS_KEY) },
    { name: 'Pixabay (vídeos/fotos/sons)', ok: Boolean(settings.integrations.pixabay_key || process.env.PIXABAY_API_KEY) },
    { name: 'Freesound (SFX/trilhas)', ok: Boolean(settings.integrations.freesound_key || process.env.FREESOUND_API_KEY) },
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
            <Field label="Tamanho máximo de upload (MB)" hint="Limite lógico por arquivo do sistema.">
              <input name="max_upload_mb" type="number" min={5} defaultValue={general.max_upload_mb} className={inputCls} />
            </Field>
            <Field label="Limite por arquivo do provedor (MB)" hint="Free do Supabase aceita 50 MB por arquivo; Pro aceita até 5 GB.">
              <input name="provider_file_limit_mb" type="number" min={5} defaultValue={general.provider_file_limit_mb} className={inputCls} />
            </Field>
            <Field label="Capacidade total de storage (GB)" hint="Teto físico contratado no Supabase. O sistema bloqueia antes de estourar.">
              <input name="storage_capacity_gb" type="number" min={1} defaultValue={general.storage_capacity_gb} className={inputCls} />
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
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <HardDrive className="h-4 w-4 text-cyan-300" /> Armazenamento externo (fora do Supabase)
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Tira os arquivos grandes do Supabase e usa um bucket S3-compatível — <strong className="text-slate-300">Cloudflare R2</strong> e{' '}
          <strong className="text-slate-300">Backblaze B2</strong> têm 10 GB grátis, <strong className="text-slate-300">MinIO</strong> roda no seu
          servidor sem limite. Quando ligado, todo upload novo (biblioteca, importação, Baixa Tudo, IA e recursos grátis) vai para lá.
          Lembre de subir “Capacidade total de storage” em Plataforma quando trocar de provedor.
        </p>
        <form action={saveStorageSettings} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Onde os arquivos ficam">
              <select name="mode" defaultValue={settings.storage.mode} className={inputCls}>
                <option value="supabase">Supabase Storage (padrão)</option>
                <option value="s3">Storage externo S3-compatível</option>
              </select>
            </Field>
            <Field label="Região" hint="R2 usa “auto”; B2 usa a região do bucket (ex.: us-west-004).">
              <input name="region" defaultValue={settings.storage.region} placeholder="auto" className={inputCls} />
            </Field>
            <Field label="Endpoint" hint="R2: https://<conta>.r2.cloudflarestorage.com · B2: https://s3.<região>.backblazeb2.com · MinIO: https://seu-servidor">
              <input name="endpoint" defaultValue={settings.storage.endpoint} placeholder="https://…" className={inputCls} />
            </Field>
            <Field label="Bucket">
              <input name="bucket" defaultValue={settings.storage.bucket} placeholder="editor-studio" className={inputCls} />
            </Field>
            <Field
              label="Access key ID"
              hint={settings.storage.access_key ? `Já salva: ${maskSecret(settings.storage.access_key)} — deixe vazio para manter.` : 'Guardada criptografada.'}
            >
              <input name="access_key" type="password" placeholder="AKIA…" className={inputCls} autoComplete="off" />
            </Field>
            <Field
              label="Secret access key"
              hint={settings.storage.secret_key ? `Já salva: ${maskSecret(settings.storage.secret_key)} — deixe vazio para manter.` : 'Guardada criptografada.'}
            >
              <input name="secret_key" type="password" placeholder="••••••••" className={inputCls} autoComplete="off" />
            </Field>
          </div>
          <Field label="Domínio público do bucket (CDN)" hint="R2 → Public access / Custom domain. Sem isso, a URL usada é endpoint/bucket/arquivo.">
            <input name="public_base" defaultValue={settings.storage.public_base} placeholder="https://media.seudominio.com" className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-[10px] text-slate-400">
            <input type="checkbox" name="clear_keys" className="h-3 w-3 accent-rose-500" /> remover credenciais salvas
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-400">Salvar armazenamento</button>
            <StorageTest />
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4 text-brand-300" /> Integrações de IA (Animação + TikTok)
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Liga a página <strong className="text-slate-300">Animação IA</strong>: o cliente manda a imagem do personagem e um
          vídeo com o movimento; o Kling 2.6 Motion Control devolve o vídeo animado. Com a Postiz o cliente publica o vídeo
          direto no TikTok. As chaves são guardadas criptografadas (AES-256-GCM).
        </p>
        <form action={saveIntegrationSettings} className="mt-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[11px] font-semibold text-white">Kie AI — Kling Motion Control</p>
              <Field
                label="API key"
                hint={settings.integrations.kie_key ? `Já salva: ${maskSecret(settings.integrations.kie_key)} — deixe vazio para manter.` : 'Pegue em kie.ai → API Keys. Precisa de créditos na conta.'}
              >
                <input name="kie_key" type="password" placeholder="kie_…" className={inputCls} autoComplete="off" />
              </Field>
              <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                <input type="checkbox" name="clear_kie" className="h-3 w-3 accent-rose-500" /> remover chave salva
              </label>
              <p className="mt-1 text-[10px] text-slate-500">Modelo usado: <code className="text-brand-300">kling-2.6/motion-control</code></p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[11px] font-semibold text-white">Postiz — publicação no TikTok</p>
              <Field
                label="API key"
                hint={settings.integrations.postiz_key ? `Já salva: ${maskSecret(settings.integrations.postiz_key)} — deixe vazio para manter.` : 'Postiz → Settings → Public API.'}
              >
                <input name="postiz_key" type="password" placeholder="chave pública da Postiz" className={inputCls} autoComplete="off" />
              </Field>
              <div className="mt-2">
                <Field label="Integration ID do TikTok" hint="Aparece na URL do canal dentro da Postiz.">
                  <input name="postiz_tiktok" defaultValue={settings.integrations.postiz_tiktok} placeholder="cm…" className={inputCls} />
                </Field>
              </div>
              <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                <input type="checkbox" name="clear_postiz" className="h-3 w-3 accent-rose-500" /> remover credenciais salvas
              </label>
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
            <p className="text-[11px] font-semibold text-white">Quem paga a conta da IA</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Você escolhe: usar a chave da plataforma para todos, deixar cada cliente usar a própria conta, ou desligar.
              A chave do cliente sempre tem prioridade — assim ninguém consome crédito de outro.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-lg border border-white/8 bg-black/20 p-2 text-[11px] text-slate-300">
                <input type="checkbox" name="admin_kie_enabled" defaultChecked={settings.integrations.admin_kie_enabled} className="mt-0.5 h-3 w-3 accent-emerald-500" />
                <span>Usar a <strong>minha chave</strong> da Kie AI para os clientes sem chave própria</span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-white/8 bg-black/20 p-2 text-[11px] text-slate-300">
                <input type="checkbox" name="allow_user_kie" defaultChecked={settings.integrations.allow_user_kie} className="mt-0.5 h-3 w-3 accent-emerald-500" />
                <span>Permitir que cada cliente <strong>cadastre a própria</strong> chave da Kie AI</span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-white/8 bg-black/20 p-2 text-[11px] text-slate-300">
                <input type="checkbox" name="admin_postiz_enabled" defaultChecked={settings.integrations.admin_postiz_enabled} className="mt-0.5 h-3 w-3 accent-emerald-500" />
                <span>Usar as <strong>minhas credenciais</strong> da Postiz para publicar</span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-white/8 bg-black/20 p-2 text-[11px] text-slate-300">
                <input type="checkbox" name="allow_user_postiz" defaultChecked={settings.integrations.allow_user_postiz} className="mt-0.5 h-3 w-3 accent-emerald-500" />
                <span>Permitir que cada cliente <strong>cadastre a própria</strong> Postiz/TikTok</span>
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400">Salvar integrações</button>
            <span className="text-[10px] text-slate-500">
              Callback do provedor: <code className="text-brand-300">{SITE_URL}/api/motion/callback</code>
            </span>
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4 text-emerald-300" /> Bibliotecas grátis (Pexels · Unsplash · Pixabay · Freesound)
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Essas APIs são <strong className="text-slate-300">gratuitas</strong> e alimentam o buscador de B-roll, fotos e SFX
          que aparece em <strong className="text-slate-300">Recursos → Bancos profissionais</strong>. Cole as chaves para todos
          usarem a sua, ou libere para cada cliente usar a própria (sem conflito, uma nunca consome a cota da outra).
          Os arquivos são salvos no storage do próprio cliente, com cota normal.
        </p>
        <form action={saveIntegrationSettings} className="mt-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: 'pexels_key', clear: 'clear_pexels', title: 'Pexels', hint: 'pexels.com/api → criar chave (grátis, ilimitado com fair use).', env: 'PEXELS_API_KEY' },
              { key: 'unsplash_key', clear: 'clear_unsplash', title: 'Unsplash', hint: 'unsplash.com/developers → Access Key (50 req/h grátis).', env: 'UNSPLASH_ACCESS_KEY' },
              { key: 'pixabay_key', clear: 'clear_pixabay', title: 'Pixabay', hint: 'pixabay.com/api/docs → sua API key.', env: 'PIXABAY_API_KEY' },
              { key: 'freesound_key', clear: 'clear_freesound', title: 'Freesound', hint: 'freesound.org/apiv2/apply → API key (usa previews HQ).', env: 'FREESOUND_API_KEY' },
            ].map((item) => (
              <div key={item.key} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <p className="text-[11px] font-semibold text-white">{item.title}</p>
                <div className="mt-2">
                  <Field
                    label="API key"
                    hint={
                      (settings.integrations as unknown as Record<string, string>)[item.key]
                        ? `Já salva: ${maskSecret((settings.integrations as unknown as Record<string, string>)[item.key])} — deixe vazio para manter.`
                        : `${item.hint} Também funciona via env ${item.env}.`
                    }
                  >
                    <input name={item.key} type="password" className={inputCls} autoComplete="off" />
                  </Field>
                </div>
                <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                  <input type="checkbox" name={item.clear} className="h-3 w-3 accent-rose-500" /> remover chave salva
                </label>
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-white/8 bg-black/20 p-2 text-[11px] text-slate-300">
            <input type="checkbox" name="allow_user_stock" defaultChecked={settings.integrations.allow_user_stock} className="mt-0.5 h-3 w-3 accent-emerald-500" />
            <span>Permitir que cada cliente <strong>cadastre a própria chave</strong> dessas bibliotecas</span>
          </label>
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400">Salvar bibliotecas</button>
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
