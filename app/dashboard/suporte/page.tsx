import { LifeBuoy, Mail, MessageCircle, Send } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge, Button, Card, Field, Input, Textarea } from '@/components/ui';
import { createSupportTicket } from '@/app/dashboard/actions';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const { user, profile } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('es_audit_logs')
    .select('*')
    .eq('user_id', user!.id)
    .eq('action', 'support_ticket')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Suporte</h1>
        <p className="mt-1 text-sm text-slate-400">Resposta em até 1 dia útil nos planos Pro e Studio.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4 text-brand-300" /> Abrir chamado</h3>
          <form action={createSupportTicket} className="mt-4 space-y-3">
            <Field label="Assunto">
              <Input name="subject" required placeholder="Ex: erro ao exportar 4K" />
            </Field>
            <Field label="Descrição">
              <Textarea name="message" required placeholder="Descreva o que aconteceu, qual projeto e o navegador usado." />
            </Field>
            <Button type="submit"><Send className="h-4 w-4" /> Enviar chamado</Button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-white">Canais diretos</h3>
            <a href="mailto:suporte@editorstudio.app" className="mt-3 flex items-center gap-2 text-sm text-brand-300 hover:underline">
              <Mail className="h-4 w-4" /> suporte@editorstudio.app
            </a>
            <p className="mt-2 text-xs text-slate-500">Conta: {profile?.email ?? user!.email}</p>
          </Card>
          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><LifeBuoy className="h-4 w-4 text-cyan-300" /> Meus chamados</h3>
            {(!data || data.length === 0) ? (
              <p className="mt-3 text-xs text-slate-500">Nenhum chamado aberto.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.map((t) => (
                  <li key={t.id} className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{(t.meta as { subject?: string })?.subject ?? 'Chamado'}</span>
                      <Badge tone="warning">aberto</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-slate-400">{(t.meta as { message?: string })?.message}</p>
                    <p className="mt-1 text-[10px] text-slate-600">{formatDateTime(t.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
