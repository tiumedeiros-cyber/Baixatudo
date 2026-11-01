import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { voiceById } from '@/lib/catalog/voices';
import { buildAvatarTimeline } from '@/lib/avatar-timeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Segment = { url: string; text: string; duration: number };

const SIZES: Record<string, [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
};

/**
 * POST /api/avatar-project — cria o projeto com o avatar falante já montado:
 * avatar animado + narração na timeline + legendas do texto narrado.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Faça login.' }, { status: 401 });

  const limit = rateLimit(`avatar:${user.id}:${clientIp(request.headers)}`, 6, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Aguarde um minuto entre avatares.' }, { status: 429 });

  let body: {
    name?: string;
    avatarId?: string;
    voiceId?: string;
    ratio?: string;
    segments?: Segment[];
    envelope?: number[];
    /** vídeo do avatar já sincronizado por IA (opcional) */
    videoUrl?: string;
    chroma?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const segments = (body.segments ?? []).filter((s) => s?.url && Number(s.duration) > 0).slice(0, 40);
  if (!segments.length) return NextResponse.json({ error: 'Gere a narração antes de criar o avatar.' }, { status: 400 });

  const voice = voiceById(body.voiceId);
  const ratio = body.ratio && SIZES[body.ratio] ? body.ratio : '9:16';
  const [width, height] = SIZES[ratio];

  // vídeo de IA: só entra se for um endereço nosso (storage do sistema)
  const videoUrl =
    typeof body.videoUrl === 'string' && /^(https?:\/\/|\/)/.test(body.videoUrl) ? body.videoUrl : undefined;

  const built = buildAvatarTimeline({
    avatarId: body.avatarId,
    segments,
    envelope: body.envelope,
    videoUrl,
    chroma: body.chroma !== false,
  });
  const { timeline, total } = built;
  const name = (body.name || `Avatar falante · ${built.avatarId}`).slice(0, 80);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('es_projects')
    .insert({
      user_id: user.id,
      name,
      type: 'video',
      width,
      height,
      duration: built.duration,
      timeline,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    id: data.id,
    url: `/studio/${data.id}`,
    duration: Number(total.toFixed(1)),
    avatar: built.avatarId,
    voice: voice.id,
    clips: timeline.clips.length,
  });
}
