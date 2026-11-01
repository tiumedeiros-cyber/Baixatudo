'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, CloudUpload, Download, Images, Link2, Loader2, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Card } from '@/components/ui';
import { deleteUserAsset, uploadUserAssetFallback } from '@/app/dashboard/actions';
import { AssetThumb } from '@/components/media/AssetThumb';
import { bytes, formatDate } from '@/lib/utils';
import { prepareFileForUpload } from '@/lib/file-intake';
import { toDirectDownload } from '@/lib/drive-link';
import type { UserAsset } from '@/lib/types';

type MediaKind = 'video' | 'image' | 'audio';

const EXT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
};

function extensionOf(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (fromName && fromName.length <= 5) return fromName;
  const fromType = file.type.split('/').pop()?.toLowerCase();
  return fromType || 'bin';
}

function contentTypeOf(file: File) {
  if (file.type) return file.type;
  return EXT_TYPE[extensionOf(file)] ?? 'application/octet-stream';
}

function detectType(file: File): MediaKind {
  if (file.type.startsWith('video')) return 'video';
  if (file.type.startsWith('audio')) return 'audio';
  const ext = extensionOf(file);
  if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) return 'audio';
  return 'image';
}

function probe(file: File, type: MediaKind): Promise<Record<string, unknown>> {
  const url = URL.createObjectURL(file);
  const timeout = new Promise<Record<string, unknown>>((resolve) => setTimeout(() => resolve({}), 6000));
  let core: Promise<Record<string, unknown>>;

  if (type === 'video') {
    const v = document.createElement('video');
    v.preload = 'metadata';
    core = new Promise<Record<string, unknown>>((resolve) => {
      v.onloadedmetadata = () => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
      v.onerror = () => resolve({});
    });
    v.src = url;
  } else if (type === 'image') {
    const img = new Image();
    core = new Promise<Record<string, unknown>>((resolve) => {
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({});
    });
    img.src = url;
  } else {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    core = new Promise<Record<string, unknown>>((resolve) => {
      a.onloadedmetadata = () => resolve({ duration: a.duration });
      a.onerror = () => resolve({});
    });
    a.src = url;
  }

  return Promise.race([core, timeout])
    .catch(() => ({}))
    .finally(() => URL.revokeObjectURL(url));
}

export function Uploader({
  userId,
  assets,
  storageLimitGb,
  quota,
  maxFileMb = 50,
  externalStorage = false,
}: {
  userId: string;
  assets: UserAsset[];
  storageLimitGb: number;
  /** contador do banco (O(1)) — quando vem, é a fonte da verdade */
  quota?: { usedBytes: number; limitBytes: number };
  /** limite por arquivo (o menor entre o do sistema e o do provedor de storage) */
  maxFileMb?: number;
  /** storage externo ligado: o upload vai pelo servidor (S3 assinado no backend) */
  externalStorage?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const supabase = createClient();
    let uploaded = 0;
    try {
      // cota: checagem local antes de gastar banda (o servidor revalida)
      const limit = quota?.limitBytes ?? storageLimitGb * 1024 ** 3;
      const used = quota?.usedBytes ?? assets.reduce((a, b) => a + Number(b.size_bytes || 0), 0);
      const incoming = Array.from(files).reduce((a, f) => a + f.size, 0);
      const big = Array.from(files).find((f) => f.size > maxFileMb * 1024 * 1024);
      if (big) {
        throw new Error(
          `"${big.name}" tem ${(big.size / 1024 / 1024).toFixed(1)} MB e o limite por arquivo é ${maxFileMb} MB. Comprima o vídeo ou use o Baixa Tudo (que salva direto no servidor).`,
        );
      }
      if (used + incoming > limit) {
        throw new Error(
          `Sem espaço: o plano tem ${(limit / 1024 ** 3).toFixed(0)} GB, ${((limit - used) / 1024 ** 3).toFixed(1)} GB livres e você está enviando ${(incoming / 1024 ** 3).toFixed(1)} GB. Apague arquivos ou faça upgrade.`,
        );
      }
      for (const rawFile of Array.from(files)) {
        setProgress(`Lendo ${rawFile.name}…`);
        // Módulo 2 · item 2: arquivo do celular pode vir sem MIME (HEIC/WhatsApp).
        // O helper lê pelo FileReader só quando necessário e devolve um File válido.
        const file = await prepareFileForUpload(rawFile);
        setProgress(`Enviando ${file.name}…`);
        const type = detectType(file);
        const meta = await probe(file, type);
        const ext = extensionOf(file);
        const safeName = file.name.replace(/[^\w.\-]+/g, '_') || `arquivo.${ext}`;
        const path = `${userId}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;
        const contentType = contentTypeOf(file);
        if (externalStorage) {
          // storage externo: o navegador envia direto ao bucket com URL assinada
          const presignRes = await fetch('/api/upload/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.name, size: file.size, contentType }),
          });
          const presign = (await presignRes.json()) as { url?: string; path?: string; error?: string };
          if (!presignRes.ok || !presign.url || !presign.path) {
            throw new Error(`${file.name}: ${presign.error ?? 'não foi possível preparar o envio'}`);
          }
          const put = await fetch(presign.url, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: file,
          });
          if (!put.ok) throw new Error(`${file.name}: o bucket recusou o envio (${put.status}). Confira o CORS do bucket.`);
          const doneRes = await fetch('/api/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: presign.path, name: file.name, size: file.size, type, contentType }),
          });
          if (!doneRes.ok) {
            const done = (await doneRes.json()) as { error?: string };
            throw new Error(`${file.name}: ${done.error ?? 'falha ao registrar o arquivo'}`);
          }
          uploaded += 1;
          continue;
        }

        const { error: upErr } = await supabase.storage
          .from('media')
          .upload(path, file, { cacheControl: '3600', upsert: false, contentType });

        if (upErr) {
          // fallback: envio pelo servidor (contorna bloqueios de rede/RLS no navegador)
          const fd = new FormData();
          fd.append('file', file);
          const fallback = await uploadUserAssetFallback(fd);
          if (!fallback.ok) throw new Error(`${file.name}: ${fallback.error ?? upErr.message}`);
        } else {
          const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
          const { error: insErr } = await supabase.from('es_user_assets').insert({
            user_id: userId,
            name: file.name,
            type,
            url: pub.publicUrl,
            storage_path: path,
            size_bytes: file.size,
            metadata: meta,
          });
          if (insErr) {
            const fd = new FormData();
            fd.append('file', file);
            const fallback = await uploadUserAssetFallback(fd);
            if (!fallback.ok) throw new Error(`${file.name}: ${fallback.error ?? insErr.message}`);
          }
        }
        uploaded += 1;
      }
      setSuccess(uploaded === 1 ? 'Arquivo enviado para a sua biblioteca!' : `${uploaded} arquivos enviados para a sua biblioteca!`);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha no upload. Tente novamente.');
    } finally {
      setProgress(null);
      setBusy(false);
      if (galleryRef.current) galleryRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  }

  /**
   * Importa do Google Drive / Dropbox / link direto (ou pasta pública do Drive).
   * Módulo 2 · item 2: o link de "visualizar" é convertido em download direto
   * antes de sair do navegador (o servidor aplica a mesma regra de novo).
   */
  async function importLink() {
    const url = link.trim();
    if (!url) return;
    setLinkBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const direct = toDirectDownload(url);
      const targets: string[] = [direct.url];
      if (/\/folders\//.test(url)) {
        setProgress('Lendo a pasta do Drive…');
        const listing = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, list: true }),
        }).then((r) => r.json() as Promise<{ files?: { id: string; name: string }[]; error?: string }>);
        if (!listing.files?.length) throw new Error(listing.error ?? 'Nenhum arquivo encontrado nessa pasta.');
        targets.length = 0;
        for (const f of listing.files.slice(0, 12)) targets.push(`https://drive.google.com/file/d/${f.id}/view`);
      }

      let count = 0;
      for (const target of targets) {
        setProgress(targets.length > 1 ? `Importando ${count + 1} de ${targets.length}…` : 'Importando o arquivo…');
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: target }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (json.ok) count += 1;
        else if (targets.length === 1) throw new Error(json.error ?? 'Não foi possível importar.');
      }
      if (!count) throw new Error('Nenhum arquivo pôde ser importado.');
      setSuccess(count === 1 ? 'Arquivo importado para a sua biblioteca!' : `${count} arquivos importados!`);
      setLink('');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao importar o link.');
    } finally {
      setProgress(null);
      setLinkBusy(false);
    }
  }

  async function remove(asset: UserAsset) {
    if (!confirm(`Remover "${asset.name}" da sua biblioteca?`)) return;
    await deleteUserAsset(asset.id, asset.storage_path);
    router.refresh();
  }

  const used = quota?.usedBytes ?? assets.reduce((a, b) => a + Number(b.size_bytes || 0), 0);
  const limitBytes = quota?.limitBytes ?? storageLimitGb * 1024 ** 3;
  const pct = Math.min(100, (used / limitBytes) * 100);

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden border-dashed p-5 text-center sm:p-6">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
        >
          <CloudUpload className={`mx-auto h-8 w-8 ${busy ? 'animate-pulse text-brand-300' : 'text-brand-300'}`} />
          <p className="mt-3 text-sm font-semibold text-white">Escolha da galeria, tire uma foto ou arraste arquivos</p>
          <p className="mt-1 text-xs text-slate-400">
            Vídeo (MP4, MOV, WebM), imagem (JPG, PNG, WEBP, HEIC) e áudio (MP3, WAV, M4A) · até 500 MB
          </p>

          <input
            ref={galleryRef}
            type="file"
            multiple
            accept="video/*,image/*,audio/*,.mp4,.m4v,.mov,.webm,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.avif,.mp3,.wav,.m4a,.aac,.ogg,.opus"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*,.heic,.heif"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => galleryRef.current?.click()} disabled={busy} className="w-full sm:w-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />} Escolher da galeria
            </Button>
            <Button variant="secondary" onClick={() => cameraRef.current?.click()} disabled={busy} className="w-full sm:w-auto">
              <Camera className="h-4 w-4" /> Tirar foto / gravar
            </Button>
          </div>

          {progress ? <p className="mt-3 text-xs text-brand-200">{progress}</p> : null}
          {error ? (
            <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-200">{error}</p>
          ) : null}
          {success ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
              <Check className="h-3.5 w-3.5" /> {success}
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-neon-cyan" />
          <h3 className="text-sm font-semibold text-white">Importar por link</h3>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Cole o link de um arquivo ou de uma <strong className="text-white">pasta pública do Google Drive</strong>, do Dropbox ou um link direto.
            O download é feito no servidor e o arquivo entra na sua biblioteca. Aceita vídeo, imagem, áudio e
            <strong className="text-white"> documentos (PDF, DOCX, XLSX, ZIP)</strong> — o tipo é detectado pelo conteúdo, não pela URL.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/file/d/… (arquivo) ou /drive/folders/… (pasta)"
            inputMode="url"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none"
          />
          <Button onClick={importLink} disabled={linkBusy || !link.trim()} className="sm:w-auto">
            {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Importar
          </Button>
        </div>

        {/* Módulo 2 · item 2: o link de "visualizar" vira download direto */}
        {link.trim() ? (
          <div className="mt-2 rounded-lg border border-white/8 bg-black/25 px-2.5 py-1.5 text-[10px] leading-relaxed">
            {(() => {
              const direct = toDirectDownload(link.trim());
              return (
                <>
                  <p className="text-slate-500">
                    {direct.converted ? 'Link convertido para download direto:' : 'Link direto (não precisa converter):'}
                  </p>
                  <p className="break-all font-mono text-emerald-300/90">{direct.url}</p>
                  {direct.kind === 'drive' && /\/folders\//.test(link) ? (
                    <p className="text-amber-200/80">Pasta do Drive: os arquivos são listados e importados um a um.</p>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}
      </Card>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{assets.length} arquivo(s) · {bytes(used)} usados</span>
        <span>{bytes(Math.max(0, limitBytes - used))} livres de {storageLimitGb} GB</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full bg-gradient-to-r from-brand-500 to-neon-cyan" style={{ width: `${Math.max(1, pct)}%` }} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {assets.map((a) => (
          <Card key={a.id} className="flex items-center gap-3 p-3">
            <AssetThumb
              type={a.type}
              url={a.url}
              thumbnail={(a.metadata as { thumbnail?: string } | null)?.thumbnail ?? null}
              className="h-12 w-16 shrink-0 rounded-lg border border-white/10"
              label={false}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{a.name}</p>
              <p className="text-[11px] text-slate-500">{bytes(Number(a.size_bytes))} · {formatDate(a.created_at)}</p>
            </div>
            <a
              href={a.url}
              download={a.name}
              target="_blank"
              rel="noreferrer"
              title={a.type === 'document' ? 'Abrir/baixar documento' : 'Baixar arquivo'}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-brand-500/10 hover:text-brand-200"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            <button onClick={() => remove(a)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
