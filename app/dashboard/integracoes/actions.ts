'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { saveUserIntegrations } from '@/lib/user-integrations';

/** Salva as chaves de IA do próprio cliente (criptografadas). */
export async function saveMyIntegrations(formData: FormData) {
  const { user } = await requireUser();
  const kie = String(formData.get('kie_key') || '').trim();
  const postiz = String(formData.get('postiz_key') || '').trim();
  const tiktok = String(formData.get('postiz_tiktok') || '').trim().slice(0, 120);
  await saveUserIntegrations(user!.id, {
    kie,
    postiz,
    tiktok,
    clearKie: formData.get('clear_kie') === 'on',
    clearPostiz: formData.get('clear_postiz') === 'on',
  });
  revalidatePath('/dashboard/integracoes');
  revalidatePath('/dashboard/animacao');
}
