'use client';

/**
 * Miniatura de mídia do usuário.
 *
 * Vídeos mostram o quadro real do arquivo (o navegador decodifica o primeiro
 * quadro com `#t=`), em vez do texto "video" que aparecia antes. Quando o
 * servidor já gravou uma capa (ex.: thumbnail do YouTube), ela é usada.
 */
export function AssetThumb({
  type,
  url,
  thumbnail,
  className = '',
  label = true,
}: {
  type: string;
  url: string;
  thumbnail?: string | null;
  className?: string;
  label?: boolean;
}) {
  const isImage = type === 'image';
  const isVideo = type === 'video';
  const isDocument = type === 'document';

  return (
    <div className={`relative overflow-hidden bg-ink-950 ${className}`}>
      {isDocument ? (
        <div className="flex h-full w-full items-center justify-center bg-white/5 text-[9px] font-bold uppercase text-slate-400">
          {url.toLowerCase().includes('.pdf') ? 'PDF' : 'DOC'}
        </div>
      ) : isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : isVideo ? (
        thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <video
            src={`${url}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        )
      ) : (
        <div className="grid h-full w-full place-items-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 text-brand-300">
            <path d="M9 18V6l10-2v12" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6.5" cy="18" r="2.5" />
            <circle cx="16.5" cy="16" r="2.5" />
          </svg>
        </div>
      )}
      {label ? (
        <span className="absolute right-1 top-1 rounded bg-black/65 px-1 text-[9px] font-semibold uppercase text-white/85">
          {isImage ? 'IMG' : isVideo ? 'VID' : type === 'audio' ? 'AUD' : type.slice(0, 3).toUpperCase()}
        </span>
      ) : null}
    </div>
  );
}
