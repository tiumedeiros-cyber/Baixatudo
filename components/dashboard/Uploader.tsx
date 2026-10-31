'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloudUpload, Loader2, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Card } from '@/components/ui';
import { deleteUserAsset } from '@/app/dashboard/actions';
import { bytes, formatDate } from '@/lib/utils';
import type { UserAsset } from '@/lib/types';

function detectType(file: File): 'video' | 'image' | 'audio' {
  if (file.type.startsWith('video')) return 'video';
  if (file.type.startsWith('audio')) return 'audio';
  return 'image';
}

async function probe(file: File, type: 'video' | 'image' | 'audio') {
  const url = URL.createObjectURL(file);
  try {
    if (type === 'video') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      await new Promise((res, rej) => {
        v.onloadedmetadata = res;
        v.onerror = rej;
        v.src = url;
      });
      return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
    }
    if (type === 'image') {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      return { width: img.naturalWidth, height: img.naturalHeight };
    }
    const a = document.createElement('audio');
    a.preload = 'metadata';
    await new Promise((res) => {
      a.onloadedmetadata = res;
      a.onerror = res;
      a.src = url;
    });
    return { duration: a.duration };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Uploader({ userId, assets, storageLimitGb }: { userId: string; assets: UserAsset[]; storageLimitGb: number }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        setProgress(`Enviando ${file.name}…`);
        const type = detectType(file);
        const meta = await probe(file, type);
        const path = `${userId}/uploads/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('media').upload(path, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;
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
        if (insErr) throw insErr;
      }
      setProgress(null);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha no upload');
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(null), 1200);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(asset: UserAsset) {
    if (!confirm(`Excluir "${asset.name}"?`)) return;
    await deleteUserAsset(asset.id, asset.storage_path);
    router.refresh();
  }

  const used = assets.reduce((a, b) => a + Number(b.size_bytes || 0), 0);
  const pct = Math.min(100, (used / (storageLimitGb * 1024 ** 3)) * 100);

  return (
    <div className="space-y-5">
      <Card
        className="relative overflow-hidden border-dashed p-6 text-center"
        // drag & drop
      >
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
        >
          <CloudUpload className={`mx-auto h-8 w-8 ${busy ? 'animate-pulse text-brand-300' : 'text-brand-300'}`} />
          <p className="mt-3 text-sm font-semibold text-white">Arraste arquivos ou escolha do computador</p>
          <p className="mt-1 text-xs text-slate-400">Vídeo (MP4, MOV, WebM), imagem (JPG, PNG, WEBP) e áudio (MP3, WAV, M4A) · até 500 MB</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="video/*,image/*,audio/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button onClick={() => inputRef.current?.click()} className="mt-4" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Selecionar arquivos
          </Button>
          {progress ? <p className="mt-3 text-xs text-brand-200">{progress}</p> : null}
          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
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
