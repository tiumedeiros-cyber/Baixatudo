import { CheckCircle2, XCircle } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card } from '@/components/ui';
import { saveSetting } from '@/app/admin/actions';
import { SITE_URL } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function AdminSettings() {
  await requireAdmin();
  const db = createAdminClient();
  const { data } = await db.from('es_settings').select('*');
  const settings = data ?? [];
  const general = (settings.find((s) => s.key === 'general')?.value ?? {}) as Record<string, unknown>;
  const payments = (settings.find((s) => s.key === 'payments')?.value ?? {}) as Record<string, unknown>;

  const integrations = [
    { name: 'Supabase (banco, auth, storage)', ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { name: 'Stripe (checkout + webhook)', ok: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) },
    { name: 'Mercado Pago (PIX/cartão)', ok: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN) },
    { name: 'ElevenLabs (voz premium)', ok: Boolean(process.env.ELEVENLABS_API_KEY) },
    { name: 'OpenAI (voz/transcrição)', ok: Boolean(process.env.OPENAI_API_KEY) },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Configurações gerais</h1>
        <p className="mt-1 text-sm text-slate-400">Preferências da plataforma e status das integrações.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white">Dados da plataforma</h3>
          <form action={async (fd: FormData) => {
            'use server';
            await saveSetting('general', {
              site_name: String(fd.get('site_name') || 'Editor Studio'),
              support_email: String(fd.get('support_email') || ''),
              max_upload_mb: Number(fd.get('max_upload_mb') || 500),
            });
          }} className="mt-3 space-y-2">
            <input name="site_name" defaultValue={String(general.site_name ?? 'Editor Studio')} className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
            <input name="support_email" defaultValue={String(general.support_email ?? '')} className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
            <input name="max_upload_mb" type="number" defaultValue={Number(general.max_upload_mb ?? 500)} className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
            <button className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">Salvar</button>
          </form>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white">Pagamentos</h3>
          <div className="mt-3 space-y-2 text-xs text-slate-300">
            <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <span>Moeda</span><span className="font-semibold text-white">{String(payments.currency ?? 'BRL')}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <span>Modo demonstração</span>
              <Badge tone={!process.env.STRIPE_SECRET_KEY && !process.env.MERCADOPAGO_ACCESS_TOKEN ? 'warning' : 'success'}>
                {!process.env.STRIPE_SECRET_KEY && !process.env.MERCADOPAGO_ACCESS_TOKEN ? 'ativo' : 'desligado'}
              </Badge>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              As chaves do gateway ficam em variáveis de ambiente da Vercel (criptografadas). Webhook Stripe:{' '}
              <code className="text-brand-300">{SITE_URL}/api/webhooks/stripe</code> · Mercado Pago:{' '}
              <code className="text-brand-300">{SITE_URL}/api/webhooks/mercadopago</code>
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white">Integrações</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {integrations.map((i) => (
            <li key={i.name} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-slate-300">
              {i.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-slate-600" />}
              {i.name}
              <span className="ml-auto text-[10px] text-slate-500">{i.ok ? 'conectado' : 'não configurado'}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white">Segurança</h3>
        <ul className="mt-2 space-y-1.5 text-[11px] text-slate-400">
          <li>• RLS ativo em todas as tabelas <code>es_*</code> (isolamento por usuário).</li>
          <li>• Papéis verificados no servidor (admin/client) em cada action.</li>
          <li>• Rate limiting em downloads (20/min) e TTS (10/min) por usuário.</li>
          <li>• Webhooks com verificação de assinatura e idempotência.</li>
          <li>• Headers HSTS, X-Frame-Options, nosniff e Referrer-Policy.</li>
          <li>• Logs de auditoria em ações sensíveis (pagamentos, suporte, admin).</li>
        </ul>
      </Card>
    </div>
  );
}
