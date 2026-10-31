'use client';
import { useState, useTransition } from 'react';
import { Ban, Check, Loader2, Mail, RotateCcw, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import { sendPasswordReset, setPaymentStatus, setUserRole, setUserStatus, deleteAsset } from '@/app/admin/actions';

export function UserActions({ userId, status, role, email }: { userId: string; status: string; role: string; email: string }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => start(() => setUserStatus(userId, status === 'active' ? 'blocked' : 'active'))}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        title={status === 'active' ? 'Bloquear' : 'Desbloquear'}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status === 'active' ? <Ban className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => start(() => setUserRole(userId, role === 'admin' ? 'client' : 'admin'))}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        title="Alternar papel"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() =>
          start(async () => {
            const res = await sendPasswordReset(email);
            setLink(res?.link ?? 'sem link');
          })
        }
        className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        title="Resetar senha"
      >
        <Mail className="h-3.5 w-3.5" />
      </button>
      {link ? <span className="max-w-[160px] truncate text-[10px] text-brand-300">{link}</span> : null}
    </div>
  );
}

export function PaymentActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => start(() => setPaymentStatus(id, 'approved'))}
        disabled={status === 'approved'}
        className="rounded-lg p-1.5 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30"
        title="Marcar como pago"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => start(() => setPaymentStatus(id, 'refunded'))} className="rounded-lg p-1.5 text-amber-300 hover:bg-amber-500/10" title="Reembolsar">
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function AssetDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(() => deleteAsset(id))} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
