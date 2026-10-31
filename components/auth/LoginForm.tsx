'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const explicitNext = params.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message.includes('Email not confirmed')
            ? 'Confirme seu e-mail antes de entrar.'
            : error.message,
      );
      setLoading(false);
      return;
    }
    // Admin cai no painel administrativo; cliente no painel do cliente.
    let destination = explicitNext && explicitNext.startsWith('/') ? explicitNext : '';
    if (!destination) {
      const userId = data.user?.id;
      const { data: profile } = userId
        ? await supabase.from('es_profiles').select('role').eq('id', userId).maybeSingle()
        : { data: null };
      destination = profile?.role === 'admin' ? '/admin' : '/dashboard';
    }
    router.replace(destination);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="E-mail">
        <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
      </Field>
      <Field label="Senha">
        <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      ) : null}
      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Entrar
      </Button>
    </form>
  );
}
