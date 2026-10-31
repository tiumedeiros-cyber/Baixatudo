import { ButtonLink, Card } from '@/components/ui';
import { ShieldAlert } from 'lucide-react';

export default function BlockedPage() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-rose-300" />
        <h1 className="mt-4 font-display text-2xl font-bold text-white">Conta suspensa</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sua conta está bloqueada. Fale com o suporte para regularizar o acesso.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <ButtonLink href="mailto:suporte@editorstudio.app">Falar com suporte</ButtonLink>
          <form action="/auth/signout" method="post">
            <button className="h-10 rounded-xl border border-white/10 px-4 text-sm text-slate-300 hover:bg-white/5">Sair</button>
          </form>
        </div>
      </Card>
    </div>
  );
}
