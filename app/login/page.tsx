import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { getCurrentProfile, getSessionUser } from '@/lib/auth';

export const metadata = { title: 'Entrar · Editor Studio' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Quem já está logado vai direto para a área certa (admin → /admin).
  const user = await getSessionUser();
  if (user) {
    const profile = await getCurrentProfile();
    redirect(profile?.role === 'admin' ? '/admin' : '/dashboard');
  }

  return (
    <AuthShell
      title="Bem-vindo de volta"
      subtitle="Entre para continuar seus projetos."
      footer={
        <>
          Não tem conta?{' '}
          <Link href="/cadastro" className="font-semibold text-brand-300 hover:underline">Criar grátis</Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <a
        href="/admin"
        className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
      >
        <ShieldCheck className="h-3.5 w-3.5" /> Acesso ao painel administrativo
      </a>
    </AuthShell>
  );
}
