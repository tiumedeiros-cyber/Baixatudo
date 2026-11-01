import { Film } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { resolveAiForUser } from '@/lib/user-integrations';
import { MotionStudio } from '@/components/dashboard/MotionStudio';

export const metadata = { title: 'Animação IA · Editor Studio' };
export const dynamic = 'force-dynamic';

export default async function AnimacaoPage() {
  const { user } = await requireUser();
  const keys = await resolveAiForUser(user!.id);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
          <Film className="h-6 w-6 text-brand-300" /> Animação IA
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Dê vida a qualquer personagem: envie a imagem e um vídeo com o movimento que ele deve fazer. A IA anima o
          personagem mantendo o rosto, e o vídeo fica pronto para usar no editor ou publicar no TikTok.
        </p>
      </div>
      <MotionStudio
        configured={{
          kie: Boolean(keys.kieKey),
          postiz: Boolean(keys.postizKey && keys.postizTiktok),
          kieSource: keys.kieSource,
          postizSource: keys.postizSource,
        }}
      />
    </div>
  );
}
