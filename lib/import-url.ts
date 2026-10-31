/**
 * Importação de mídia por link.
 *
 * Suporta link direto (mp4/mp3/jpg/webp), Google Drive (arquivo público),
 * Dropbox, OneDrive e pastas públicas do Drive (lista best-effort).
 * O download acontece no servidor — nada de CORS no celular do cliente.
 */
export type FetchedMedia = {
  ok: true;
  buffer: Buffer;
  contentType: string;
  filename: string;
  finalUrl: string;
};

export type FetchFailure = { ok: false; error: string; status?: number };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function driveFileId(url: string): string | null {
  const patterns = [/\/file\/d\/([\w-]{10,})/, /[?&]id=([\w-]{10,})/, /\/d\/([\w-]{10,})/];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function driveFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([\w-]{10,})/);
  return m ? m[1] : null;
}

/** Converte links de "visualizar" em links de download direto. */
export function directUrl(raw: string): { url: string; kind: 'drive' | 'dropbox' | 'onedrive' | 'direct' } {
  const url = raw.trim();
  const fileId = driveFileId(url);
  if (fileId && /drive\.google\.com|docs\.google\.com/.test(url)) {
    return { url: `https://drive.google.com/uc?export=download&id=${fileId}`, kind: 'drive' };
  }
  if (/dropbox\.com/.test(url)) {
    const clean = url.replace(/[?&]dl=0/, '').replace(/[?&]raw=0/, '');
    return { url: clean.includes('?') ? `${clean}&dl=1` : `${clean}?dl=1`, kind: 'dropbox' };
  }
  if (/1drv\.ms|onedrive\.live\.com/.test(url)) {
    return { url: url.includes('?') ? `${url}&download=1` : `${url}?download=1`, kind: 'onedrive' };
  }
  return { url, kind: 'direct' };
}

function filenameFrom(res: Response, fallback: string) {
  const disposition = res.headers.get('content-disposition') ?? '';
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const fromHeader = star ? decodeURIComponent(star) : plain;
  if (fromHeader) return fromHeader;
  try {
    const name = new URL(res.url).pathname.split('/').filter(Boolean).pop();
    if (name && /\.[a-z0-9]{2,5}$/i.test(name)) return decodeURIComponent(name);
  } catch {
    /* noop */
  }
  return fallback;
}

function guessName(kind: string, contentType: string) {
  const ext = contentType.includes('mp4')
    ? 'mp4'
    : contentType.includes('webm')
      ? 'webm'
      : contentType.includes('mpeg')
        ? 'mp3'
        : contentType.includes('wav')
          ? 'wav'
          : contentType.includes('png')
            ? 'png'
            : contentType.includes('webp')
              ? 'webp'
              : contentType.includes('image')
                ? 'jpg'
                : 'bin';
  return `importado-${Date.now()}.${ext}`;
}

export function mediaTypeOf(contentType: string, name = ''): 'video' | 'image' | 'audio' | null {
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'audio';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic'].includes(ext)) return 'image';
  return null;
}

/** Baixa o arquivo tratando o aviso de "vírus grande" do Google Drive. */
export async function fetchMedia(rawUrl: string, maxBytes = 500 * 1024 * 1024): Promise<FetchedMedia | FetchFailure> {
  const { url, kind } = directUrl(rawUrl);
  let target = url;

  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(target, {
        headers: { 'User-Agent': UA, Accept: '*/*' },
        redirect: 'follow',
        cache: 'no-store',
      });
    } catch {
      return { ok: false, error: 'Não foi possível abrir esse link.' };
    }

    if (!res.ok) {
      return { ok: false, error: `O link respondeu ${res.status}. Verifique se o arquivo está público.`, status: res.status };
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();

    // Drive grande devolve uma página de confirmação
    if (contentType.includes('text/html')) {
      const html = await res.text();
      const confirm = html.match(/confirm=([0-9A-Za-z_-]+)/)?.[1];
      const uuid = html.match(/name="uuid" value="([^"]+)"/)?.[1];
      const id = driveFileId(rawUrl);
      if (kind === 'drive' && id && (confirm || uuid)) {
        const qs = new URLSearchParams({ export: 'download', id });
        if (confirm) qs.set('confirm', confirm);
        if (uuid) {
          qs.set('uuid', uuid);
          qs.set('at', '');
        }
        target = `https://drive.usercontent.google.com/download?${qs.toString()}`;
        continue;
      }
      if (kind === 'drive') {
        return { ok: false, error: 'O Google Drive não liberou o download. Confira se o arquivo está como “qualquer pessoa com o link”.' };
      }
      return { ok: false, error: 'Esse link devolveu uma página, não um arquivo de mídia.' };
    }

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared && declared > maxBytes) {
      return { ok: false, error: `Arquivo muito grande (${Math.round(declared / 1048576)} MB). Limite: ${Math.round(maxBytes / 1048576)} MB.` };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) {
      return { ok: false, error: `Arquivo muito grande (${Math.round(buffer.length / 1048576)} MB).` };
    }
    if (buffer.length < 512) return { ok: false, error: 'O arquivo veio vazio.' };

    const filename = filenameFrom(res, guessName(kind, contentType));
    const type = mediaTypeOf(contentType, filename);
    if (!type) return { ok: false, error: 'O arquivo não é vídeo, imagem ou áudio reconhecido.' };

    return {
      ok: true,
      buffer,
      contentType: contentType || (type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mpeg' : 'image/jpeg'),
      filename,
      finalUrl: res.url || target,
    };
  }

  return { ok: false, error: 'O Google Drive pediu confirmação demais. Baixe o arquivo e envie pelo dispositivo.' };
}

/** Extrai ids de arquivos de uma pasta pública do Google Drive (best-effort). */
export async function listDriveFolder(folderUrl: string): Promise<{ files: { id: string; name: string }[]; error?: string }> {
  const id = driveFolderId(folderUrl);
  if (!id) return { files: [], error: 'Link de pasta do Drive inválido.' };
  try {
    const res = await fetch(`https://drive.google.com/drive/folders/${id}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      cache: 'no-store',
    });
    if (!res.ok) return { files: [], error: `O Drive respondeu ${res.status}. A pasta está pública?` };
    const html = await res.text();
    const files: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    // o HTML traz pares "id" e "nome" do arquivo em vários formatos
    const re = /"([\w-]{25,})"\s*,\s*"[^"]*"\s*,\s*"([^"]+\.(?:mp4|mov|webm|mp3|m4a|wav|jpg|jpeg|png|webp|gif|avif))"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      files.push({ id: m[1], name: m[2] });
    }
    if (!files.length) {
      return {
        files: [],
        error:
          'Não consegui listar os arquivos dessa pasta. Use o link de cada arquivo (Compartilhar → copiar link) ou envie pelo dispositivo.',
      };
    }
    return { files: files.slice(0, 40) };
  } catch {
    return { files: [], error: 'Falha ao abrir a pasta do Drive.' };
  }
}

export function safeFileName(value: string) {
  return (
    (value || 'arquivo')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/[^\w.\-\s]+/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 70) || 'arquivo'
  );
}
