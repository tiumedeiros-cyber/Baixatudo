import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSettings, effectiveIntegrations } from '@/lib/settings';
import { kieGetTask } from '@/lib/motion';

export const runtime = 'nodejs';

/** Callback do Kie AI: marca a tarefa como concluída assim que o vídeo fica pronto. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('job') ?? '';
  if (!jobId) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = createAdminClient();
  const { data: job } = await admin.from('es_motion_jobs').select('id,task_id,status').eq('id', jobId).maybeSingle();
  if (!job?.task_id) return NextResponse.json({ ok: false }, { status: 404 });

  const settings = await getSettings();
  const { kieKey } = effectiveIntegrations(settings);
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
