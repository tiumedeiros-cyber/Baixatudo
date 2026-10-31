import { requireUser } from '@/lib/auth';
import { AvatarStudio } from '@/components/dashboard/AvatarStudio';

export const metadata = { title: 'Avatares falantes · Editor Studio' };
export const dynamic = 'force-dynamic';

export default async function AvataresPage() {
  await requireUser();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Avatares falantes</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Escolha um avatar, uma voz real do banco público e escreva o roteiro. O sistema gera a narração, sincroniza a boca
          do personagem com o áudio e abre o projeto pronto no editor — com legendas automáticas.
        </p>
      </div>
      <AvatarStudio />
    </div>
  );
}
