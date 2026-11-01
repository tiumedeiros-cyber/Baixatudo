import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSettings } from '@/lib/settings';
import { resolveAiForUser } from '@/lib/user-integrations';
import { getQuota, formatBytes } from '@/lib/quota';
import { storeFile } from '@/lib/storage';
import { getActiveSubscription } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { kieCreateTask, kieGetTask, postizUpload, postizPublish } from '@/lib/motion';
import { SITE_URL } from '@/lib/env';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Job = {
  id: string;
  user_id: string;
  status: string;
  task_id: string | null;
  result_url: string | null;
  image_url: string;
  video_url: string;
  error: string | null;
};

/**
 * POST /api/motion
 *  { action: 'create', imageUrl, videoUrl, prompt?, mode? } → cria a tarefa no Kling
 *  { action: 'poll', id }                                   → consulta o estado
 *  { action: 'save', id }                                   → salva o MP4 na biblioteca
 *  { action: 'publish', id, caption }                       → publica no TikTok (Postiz)
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`motion:${user.id}:${clientIp(request.headers)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos. Aguarde um minuto.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const action = String(body.action ?? 'create');
  const admin = createAdminClient();
  const settings = await getSettings();
  const keys = await resolveAiForUser(user.id, settings);

  if (action === 'create') {
    if (!keys.kieKey) {
      return NextResponse.json(
        {
          error:
            'Animação IA está sem chave. Cadastre a sua em Painel → Minhas integrações ou peça ao admin para liberar a chave da plataforma.',
        },
        { status: 400 },
      );
    }
    const imageUrl = String(body.imageUrl ?? '').trim();
    const videoUrl = String(body.videoUrl ?? '').trim();
    if (!/^https?:\/\//i.test(imageUrl) || !/^https?:\/\//i.test(videoUrl)) {
      return NextResponse.json(
        { error: 'Informe a URL pública da imagem do personagem e a do vídeo de referência.' },
        { status: 400 },
      );
    }
    const mode = body.mode === '1080p' ? '1080p' : '720p';
    const prompt = String(body.prompt ?? '').slice(0, 600);

    const { data: job, error } = await admin
      .from('es_motion_jobs')
      .insert({
        user_id: user.id,
        status: 'queued',
        image_url: imageUrl,
        video_url: videoUrl,
        prompt,
        mode,
      })
      .select('id')
      .single();
    if (error || !job) {
      return NextResponse.json({ error: `Não foi possível registrar a tarefa (${error?.message ?? 'erro'}).` }, { status: 500 });
    }

    const created = await kieCreateTask({
      key: keys.kieKey,
      imageUrl,
      videoUrl,
      prompt,
      mode,
      callbackUrl: `${SITE_URL}/api/motion/callback?job=${job.id}`,
    });
    if ('error' in created) {
      await admin.from('es_motion_jobs').update({ status: 'failed', error: created.error, updated_at: new Date().toISOString() }).eq('id', job.id);
      return NextResponse.json({ error: created.error }, { status: 502 });
    }

    await admin
      .from('es_motion_jobs')
      .update({ status: 'processing', task_id: created.taskId, updated_at: new Date().toISOString() })
      .eq('id', job.id);

    return NextResponse.json({ ok: true, id: job.id, taskId: created.taskId });
  }

  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Tarefa não informada.' }, { status: 400 });

  const { data: jobData } = await admin.from('es_motion_jobs').select('*').eq('id', id).maybeSingle();
  const job = jobData as Job | null;
  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: 'Tarefa não encontrada.' }, { status: 404 });
  }

  if (action === 'poll') {
    if (job.status === 'done' || job.status === 'saved') {
      return NextResponse.json({ ok: true, status: job.status, resultUrl: job.result_url });
    }
    if (job.status === 'failed') {
      return NextResponse.json({ ok: true, status: 'failed', error: job.error });
    }
    if (!job.task_id) return NextResponse.json({ ok: true, status: job.status });
    if (!keys.kieKey) return NextResponse.json({ error: 'Kie AI não configurada.' }, { status: 400 });

    const info = await kieGetTask({ key: keys.kieKey, taskId: job.task_id });
    if (info.state === 'success' && info.resultUrl) {
      await admin
        .from('es_motion_jobs')
        .update({ status: 'done', result_url: info.resultUrl, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      return NextResponse.json({ ok: true, status: 'done', resultUrl: info.resultUrl });
    }
    if (info.state === 'failed' || info.state === 'fail' || info.state === 'error') {
      const msg = info.failMsg || 'A geração falhou no provedor.';
      await admin.from('es_motion_jobs').update({ status: 'failed', error: msg, updated_at: new Date().toISOString() }).eq('id', job.id);
      return NextResponse.json({ ok: true, status: 'failed', error: msg });
    }
    return NextResponse.json({ ok: true, status: info.state || 'processing' });
  }

  if (action === 'save') {
    if (!job.result_url) return NextResponse.json({ error: 'O vídeo ainda não está pronto.' }, { status: 400 });
    if (job.status === 'saved') return NextResponse.json({ ok: true, alreadySaved: true });

    const sub = await getActiveSubscription();
    const quota = await getQuota(admin, user.id, Number(sub?.plans?.limits?.storage_gb ?? 5));
    if (quota.freeBytes <= 0) {
      return NextResponse.json(
        { error: `Sem espaço no seu plano (${formatBytes(quota.usedBytes)} de ${formatBytes(quota.limitBytes)} usados).` },
        { status: 413 },
      );
    }

    const res = await fetch(job.result_url, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: `Não foi possível baixar o vídeo (${res.status}).` }, { status: 502 });
    const buffer = Buffer.from(await res.arrayBuffer());
    const path = `${user.id}/ai/${Date.now()}-kling.mp4`;
    const stored = await storeFile(admin, settings, path, buffer, 'video/mp4');
    if ('error' in stored) return NextResponse.json({ error: `Falha ao guardar o vídeo (${stored.error}).` }, { status: 500 });
    const pub = { publicUrl: stored.url };

    const { data: asset } = await admin
      .from('es_user_assets')
      .insert({
        user_id: user.id,
        name: `animacao-ia-${Date.now()}.mp4`,
        type: 'video',
        url: pub.publicUrl,
        storage_path: path,
        size_bytes: buffer.length,
        metadata: { origin: 'kling-motion', job: job.id, source_url: job.result_url },
      })
      .select('id')
      .single();

    await admin
      .from('es_motion_jobs')
      .update({ status: 'saved', asset_id: asset?.id ?? null, updated_at: new Date().toISOString() })
      .eq('id', job.id);
    return NextResponse.json({ ok: true, url: pub.publicUrl, bytes: buffer.length });
  }

  if (action === 'publish') {
    if (!keys.postizKey || !keys.postizTiktok) {
      return NextResponse.json(
        { error: 'Publicação desligada: cadastre a API key da Postiz e o Integration ID do TikTok em Painel → Minhas integrações.' },
        { status: 400 },
      );
    }
    if (!job.result_url) return NextResponse.json({ error: 'O vídeo ainda não está pronto.' }, { status: 400 });
    const caption = String(body.caption ?? '').slice(0, 2000);

    const res = await fetch(job.result_url, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: `Não foi possível baixar o vídeo (${res.status}).` }, { status: 502 });
    const buffer = Buffer.from(await res.arrayBuffer());
    const uploaded = await postizUpload({
      key: keys.postizKey,
      buffer,
      filename: `animacao-${job.id.slice(0, 8)}.mp4`,
      contentType: 'video/mp4',
    });
    if ('error' in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 502 });

    const published = await postizPublish({
      key: keys.postizKey,
      integrationId: keys.postizTiktok,
      mediaId: uploaded.id,
      mediaPath: uploaded.path,
      caption,
    });
    if ('error' in published) return NextResponse.json({ error: published.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
}

/** GET /api/motion → lista as últimas tarefas do usuário. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin
    .from('es_motion_jobs')
    .select('id,status,mode,result_url,error,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(12);
  return NextResponse.json({ ok: true, jobs: data ?? [] });
}
