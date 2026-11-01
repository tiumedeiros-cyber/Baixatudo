'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Ban, Check, KeyRound, Loader2, Mail, ShieldCheck, UserCheck } from 'lucide-react';
import { sendPasswordReset, setUserPlan, setUserRole, setUserStatus } from '@/app/admin/actions';

type Plan = { id: string; name: string };

/** Ações do usuário com rótulo — antes eram ícones soltos e ninguém achava. */
export function UserActions({
  userId,
  status,
  role,
  email,
  plans,
  currentPlanId,
}: {
  userId: string;
  status: string;
  role: string;
  email: string;
  plans: Plan[];
  currentPlanId?: string;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [plan, setPlan] = useState(currentPlanId ?? '');
  const router = useRouter();

  const btn = 'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition disabled:opacity-50';

  return (
    <div className="flex min-w-[260px] flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setUserStatus(userId, status === 'active' ? 'blocked' : 'active');
              router.refresh();
            })
          }
          className={`${btn} ${status === 'active' ? 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/10' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'}`}
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : status === 'active' ? <Ban className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
          {status === 'active' ? 'Bloquear' : 'Desbloquear'}
        </button>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setUserRole(userId, role === 'admin' ? 'client' : 'admin');
              router.refresh();
            })
          }
          className={`${btn} border-white/12 bg-white/5 text-slate-200 hover:bg-white/10`}
        >
          <ShieldCheck className="h-3 w-3" /> {role === 'admin' ? 'Tornar cliente' : 'Tornar admin'}
        </button>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await sendPasswordReset(email);
              setLink(res?.link ?? 'não foi possível gerar o link');
            })
          }
          className={`${btn} border-white/12 bg-white/5 text-slate-200 hover:bg-white/10`}
        >
          <Mail className="h-3 w-3" /> Resetar senha
        </button>
      </div>

      <div className="flex items-center gap-1">
        <KeyRound className="h-3 w-3 shrink-0 text-slate-500" />
        <select
          value={plan}
          onChange={(event) => setPlan(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/40 px-1.5 py-1 text-[10px] text-white outline-none"
        >
          <option value="">— plano —</option>
          {plans.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          disabled={pending || !plan}
          onClick={() =>
            start(async () => {
              await setUserPlan(userId, plan);
              router.refresh();
            })
          }
          className={`${btn} border-emerald-400/30 bg-emerald-500/10 text-emerald-200`}
        >
          <Check className="h-3 w-3" /> Aplicar
        </button>
      </div>

      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="max-w-[260px] truncate text-[10px] text-brand-300 underline">
          {link}
        </a>
      ) : null}
    </div>
  );
}
