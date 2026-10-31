import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignupForm } from '@/components/auth/SignupForm';

export const metadata = { title: 'Criar conta · Editor Studio' };

export default function SignupPage() {
  return (
    <AuthShell
      title="Crie sua conta"
      subtitle="7 dias grátis, sem cartão de crédito."
      footer={
        <>
          Já tem conta?{' '}
          <Link href="/login" className="font-semibold text-brand-300 hover:underline">Entrar</Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
