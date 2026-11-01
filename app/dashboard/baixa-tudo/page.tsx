import { Download, ExternalLink, History } from 'lucide-react';
import { requireUser, getActiveSubscription } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DownloaderClient } from '@/components/downloader/DownloaderClient';
import { HistoryDelete } from '@/components/downloader/HistoryDelete';
import { HistoryItems } from '@/components/downloader/HistoryItems';
import { Badge, Card, EmptyState } from '@/components/ui';
import { formatDateTime, truncate } from '@/lib/utils';
import type { DownloadRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BaixaTudoPage() {
  const { user } = await requireUser();
  const sub = await getActiveSubscription();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('es_downloads')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(15);
  const history = (data ?? []) as unknown as DownloadRecord[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
            <Download className="h-6 w-6 text-emerald-300" /> Baixa Tudo
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Baixe vídeos, imagens e áudios de qualquer rede e use direto na timeline.
          </p>
        </div>
        <Badge tone="success">{sub?.plans?.limits?.downloads_per_day ?? 20} downloads/dia</Badge>
      </div>

      <DownloaderClient userId={user!.id} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <History className="h-4 w-4 text-cyan-300" /> Histórico recente
          </h3>
          {history.length === 0 ? (
            <EmptyState title="Nenhum download ainda" description="Cole um link acima para começar." icon={<Download className="h-5 w-5" />} />
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {history.map((h) => {
                const count = Array.isArray(h.result?.items) ? h.result.items.length : 0;
                return (
                  <li key={h.id} className="flex flex-wrap items-center gap-2 py-2.5 sm:flex-nowrap sm:gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-[10px] uppercase text-slate-400">
                      {h.media_type === 'audio' ? 'mp3' : 'mp4'}
                    </div>
                    <div className="min-w-0 flex-1 basis-[calc(100%-4.5rem)] sm:basis-auto">
                      <p className="break-all text-[11px] leading-snug text-slate-200 sm:truncate sm:text-xs" title={h.source_url}>
                        {truncate(h.source_url, 48)}
                      </p>
                      <p className="mt-0.5 break-words text-[10px] leading-snug text-slate-500">
                        {h.service ?? 'link'} · {formatDateTime(h.created_at)}
                      </p>
                      <p className="break-words text-[10px] leading-snug text-slate-500">
                        {count ? `${count} arquivo(s)` : h.result?.error ?? 'sem arquivos'}
                      </p>
                      {count ? <HistoryItems id={h.id} items={(h.result?.items ?? []) as { url: string; filename?: string; type?: string; quality?: string; size?: number }[]} /> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge tone={h.status === 'ready' ? 'success' : h.status === 'error' ? 'danger' : 'warning'}>{h.status}</Badge>
                      <HistoryDelete id={h.id} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white">Como funciona</h3>
          <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-400">
            <li><span className="font-semibold text-white">1.</span> Cole o link público do vídeo, reel, foto ou áudio.</li>
            <li><span className="font-semibold text-white">2.</span> Escolha a qualidade (ou “só áudio” em MP3).</li>
            <li><span className="font-semibold text-white">3.</span> Baixe no dispositivo ou clique em “Biblioteca” para salvar na sua conta.</li>
            <li><span className="font-semibold text-white">4.</span> Abra um projeto e arraste o arquivo para a timeline.</li>
          </ol>
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-200/90">
            Conteúdo protegido por direitos autorais não deve ser baixado sem autorização. Você é responsável pelo uso.
            <a href="https://www.gov.br" target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 underline">
              Saiba mais <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
