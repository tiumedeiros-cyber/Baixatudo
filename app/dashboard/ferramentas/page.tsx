import { Wand2 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { AiTools } from '@/components/dashboard/AiTools';

export const metadata = { title: 'Ferramentas de IA · Editor Studio' };
export const dynamic = 'force-dynamic';

export default async function AiToolsPage() {
  await requireUser();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
          <Wand2 className="h-6 w-6 text-brand-300" /> Ferramentas de IA
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Sons, recorte de fundo e transcrição — tudo gratuito, ilimitado e rodando no seu navegador (ou no servidor do
          Editor Studio). Nada aqui depende de chave paga.
        </p>
      </div>
      <AiTools />
    </div>
  );
}
