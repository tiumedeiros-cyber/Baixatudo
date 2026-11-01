import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSettings } from '@/lib/settings';
import { resolveAiForUser } from '@/lib/user-integrations';
import { kieGetTask } from '@/lib/motion';
import { verifyPayload } from '@/lib/crypto';

export const runtime = 'nodejs';

/** Callback do Kie AI: marca a tarefa como concluída assim que o vídeo fica pronto. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('job') ?? '';
  if (!jobId) return NextResponse.json({ ok: false }, { status: 400 });
  // sem assinatura válida, qualquer pessoa poderia disparar chamadas ao provedor
  const token = url.searchParams.get('t') ?? '';
  const signedJob = token ? verifyPayload(token, 'motion-callback') : null;
  if (signedJob !== jobId) return NextResponse.json({ ok: false, error: 'assinatura inválida' }, { status: 401 });

  const admin = createAdminClient();
  const { data: job } = await admin.from('es_motion_jobs').select('id,user_id,task_id,status').eq('id', jobId).maybeSingle();
  if (!job?.task_id) return NextResponse.json({ ok: false }, { status: 404 });

  const settings = await getSettings();
  const { kieKey } = await resolveAiForUser(job.user_id as string, settings);
  if (!kieKey) return NextResponse.json({ ok: false }, { status: 400 });

  const info = await kieGetTask({ key: kieKey, taskId: job.task_id });
  if (info.state === 'success' && info.resultUrl) {
    await admin
      .from('es_motion_jobs')
      .update({ status: 'done', result_url: info.resultUrl, updated_at: new Date().toISOString() })
      .eq('id', job.id);
  } else if (['failed', 'fail', 'error'].includes(info.state)) {
    await admin
      .from('es_motion_jobs')
      .update({ status: 'failed', error: info.failMsg || 'Falha na geração.', updated_at: new Date().toISOString() })
      .eq('id', job.id);
  }
  return NextResponse.json({ ok: true });
}
