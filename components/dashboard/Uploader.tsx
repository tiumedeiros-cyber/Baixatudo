'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, CloudUpload, Images, Loader2, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Card } from '@/components/ui';
import { deleteUserAsset, uploadUserAssetFallback } from '@/app/dashboard/actions';
import { bytes, formatDate } from '@/lib/utils';
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

export function Uploader({ userId, assets, storageLimitGb }: { userId: string; assets: UserAsset[]; storageLimitGb: number }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
      for (const file of Array.from(files)) {
        setProgress(`Enviando ${file.name}…`);
        const type = detectType(file);
        const meta = await probe(file, type);
        const ext = extensionOf(file);
        const safeName = file.name.replace(/[^\w.\-]+/g, '_') || `arquivo.${ext}`;
        const path = `${userId}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;
        const contentType = contentTypeOf(file);
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

  async function remove(asset: UserAsset) {
    if (!confirm(`Remover "${asset.name}" da sua biblioteca?`)) return;
    await deleteUserAsset(asset.id, asset.storage_path);
    router.refresh();
  }

  const used = assets.reduce((a, b) => a + Number(b.size_bytes || 0), 0);
  const pct = Math.min(100, (used / (storageLimitGb * 1024 ** 3)) * 100);

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
            accept="video/*,image/*,audio/*,.heic,.heif"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*"
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

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{assets.length} arquivo(s) · {bytes(used)} usados</span>
        <span>{storageLimitGb} GB disponíveis</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full bg-gradient-to-r from-brand-500 to-neon-cyan" style={{ width: `${Math.max(1, pct)}%` }} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {assets.map((a) => (
          <Card key={a.id} className="flex items-center gap-3 p-3">
            <div className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-ink-900">
              {a.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] uppercase text-slate-400">{a.type}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{a.name}</p>
              <p className="text-[11px] text-slate-500">{bytes(Number(a.size_bytes))} · {formatDate(a.created_at)}</p>
            </div>
            <button onClick={() => remove(a)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
