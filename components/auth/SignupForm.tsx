'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui';

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('A senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message.includes('already registered') ? 'Este e-mail já tem conta. Faça login.' : error.message);
      setLoading(false);
      return;
    }
    if (!data.session) {
      // e-mail confirmation habilitado
      setError('Conta criada! Verifique seu e-mail para confirmar e depois faça login.');
      setLoading(false);
      return;
    }
    router.replace('/dashboard?boas-vindas=1');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nome completo">
        <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" autoComplete="name" />
      </Field>
      <Field label="E-mail">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" />
      </Field>
      <Field label="Senha" hint="Mínimo de 6 caracteres.">
        <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
      </Field>
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      ) : null}
      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar conta grátis
      </Button>
      <p className="text-center text-[11px] leading-relaxed text-slate-500">
        Ao criar a conta você concorda com os{' '}
        <a href="/termos" className="text-brand-300 hover:underline">Termos</a> e a{' '}
        <a href="/privacidade" className="text-brand-300 hover:underline">Política de Privacidade</a>.
      </p>
    </form>
  );
}
