import { KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import { changePassword, updateProfile } from '@/app/dashboard/actions';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { user, profile } = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Perfil</h1>
        <p className="mt-1 text-sm text-slate-400">Dados da conta, segurança e preferências.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-neon-pink text-lg font-bold text-white">
              {(profile?.full_name || user!.email || 'US').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-white">{profile?.full_name || 'Sem nome'}</p>
              <p className="flex items-center gap-1.5 text-xs text-slate-400"><Mail className="h-3 w-3" /> {user!.email}</p>
            </div>
            <div className="ml-auto">
              <Badge tone={profile?.role === 'admin' ? 'brand' : 'neutral'}>{profile?.role ?? 'client'}</Badge>
            </div>
          </div>

          <form action={updateProfile} className="mt-6 space-y-4">
            <Field label="Nome completo">
              <Input name="full_name" defaultValue={profile?.full_name ?? ''} placeholder="Seu nome" />
            </Field>
            <Field label="E-mail" hint="Para alterar o e-mail, fale com o suporte.">
              <Input value={user!.email ?? ''} disabled />
            </Field>
            <Button type="submit"><UserRound className="h-4 w-4" /> Salvar perfil</Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><KeyRound className="h-4 w-4 text-brand-300" /> Alterar senha</h3>
            <form action={changePassword} className="mt-4 space-y-3">
              <Field label="Nova senha" hint="Mínimo 6 caracteres.">
                <Input name="password" type="password" required minLength={6} placeholder="••••••••" />
              </Field>
              <Button type="submit" variant="secondary">Atualizar senha</Button>
            </form>
          </Card>

          <Card className="p-6 text-sm">
            <h3 className="flex items-center gap-2 font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Segurança</h3>
            <ul className="mt-3 space-y-2 text-xs text-slate-400">
              <li className="flex justify-between"><span>Conta criada</span><span className="text-white">{formatDate(profile?.created_at)}</span></li>
              <li className="flex justify-between"><span>Status</span><span className="text-white">{profile?.status === 'active' ? 'Ativa' : 'Bloqueada'}</span></li>
              <li className="flex justify-between"><span>Sessão</span><span className="text-white">JWT + refresh rotativo</span></li>
              <li className="flex justify-between"><span>Isolamento de dados</span><span className="text-white">RLS por usuário</span></li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
