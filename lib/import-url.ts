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

/** Links novos do Drive podem vir com `resourcekey` — sem ele o acesso é negado. */
export function driveResourceKey(url: string): string | null {
  const m = url.match(/[?&]resourcekey=([\w-]{6,})/);
  return m ? m[1] : null;
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
    const key = driveResourceKey(url);
    const qs = new URLSearchParams({ id: fileId, export: 'download', confirm: 't' });
    if (key) qs.set('resourcekey', key);
    // endpoint atual do Google (o antigo `drive.google.com/uc` devolve HTML)
    return { url: `https://drive.usercontent.google.com/download?${qs.toString()}`, kind: 'drive' };
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


/* -------------------------------------------------------------------------- */
/*                         Google Drive (arquivo e pasta)                     */
/* -------------------------------------------------------------------------- */

const unescapeHtml = (v: string) =>
  v
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');

/**
 * A página de confirmação do Drive muda de formato a cada poucos meses.
 * Aqui tentamos todas as formas conhecidas, em ordem:
 *   1. `<form id="download-form" action="...">` com inputs escondidos (atual);
 *   2. `_downloadUrl = '...'` / `"downloadUrl":"..."` no JavaScript;
 *   3. link direto `drive.usercontent.google.com/download?...` no HTML;
 *   4. formato antigo com `confirm=<token>`.
 */
export function driveDownloadFromHtml(html: string, rawUrl: string): string | null {
  const id = driveFileId(rawUrl);
  const key = driveResourceKey(rawUrl);

  const action = html.match(/<form[^>]+action="([^"]+)"[^>]*>/i)?.[1];
  if (action && /google\.com/i.test(action)) {
    const url = new URL(unescapeHtml(action));
    const inputs = html.matchAll(/<input[^>]+name="([^"]+)"[^>]*value="([^"]*)"/gi);
    for (const [, name, value] of inputs) {
      if (/^(id|export|confirm|uuid|at|resourcekey|authuser)$/i.test(name)) {
        url.searchParams.set(name, unescapeHtml(value));
      }
    }
    if (!url.searchParams.get('export')) url.searchParams.set('export', 'download');
    if (!url.searchParams.get('confirm')) url.searchParams.set('confirm', 't');
    if (key && !url.searchParams.get('resourcekey')) url.searchParams.set('resourcekey', key);
    if (id && !url.searchParams.get('id')) url.searchParams.set('id', id);
    return url.toString();
  }

  const jsUrl =
    html.match(/_downloadUrl\s*=\s*['"]([^'"]+)['"]/)?.[1] ??
    html.match(/"downloadUrl"\s*:\s*"([^"]+)"/)?.[1] ??
    html.match(/href="(https:\/\/drive\.usercontent\.google\.com\/download\?[^"]+)"/)?.[1];
  if (jsUrl) {
    const url = new URL(unescapeHtml(jsUrl));
    if (key && !url.searchParams.get('resourcekey')) url.searchParams.set('resourcekey', key);
    return url.toString();
  }

  const confirm = html.match(/confirm=([0-9A-Za-z_-]+)/)?.[1];
  const uuid = html.match(/name="uuid"\s+value="([^"]+)"/)?.[1] ?? html.match(/uuid=([0-9A-Za-z_-]{8,})/)?.[1];
  if (id && (confirm || uuid)) {
    const qs = new URLSearchParams({ id, export: 'download', confirm: confirm ?? 't' });
    if (uuid) qs.set('uuid', uuid);
    if (key) qs.set('resourcekey', key);
    return `https://drive.usercontent.google.com/download?${qs.toString()}`;
  }
  return null;
}

/** Traduz a página de erro do Drive em uma instrução clara para o cliente. */
export function driveHtmlHint(html: string): string {
  if (/quota (has been )?exceeded|excedeu a cota|too many users have viewed/i.test(html)) {
    return 'O Google bloqueou o download por excesso de acessos (cota do Drive). Tente de novo em algumas horas ou compartilhe outro link.';
  }
  if (/accounts\.google\.com|Sign in|Fazer login|ServiceLogin/i.test(html)) {
    return 'Esse arquivo não está público. No Drive: botão direito → Compartilhar → “Qualquer pessoa com o link” → copie o link de novo.';
  }
  if (/Request a review|review this file|solicitar uma revisão/i.test(html)) {
    return 'O Drive pediu revisão de segurança nesse arquivo. Abra o link no navegador, clique em “Fazer download mesmo assim” e tente de novo.';
  }
  if (/not found|não foi possível encontrar|does not exist|404/i.test(html)) {
    return 'O Drive não encontrou esse arquivo. Confira o link (e se ele não foi apagado).';
  }
  if (/folder/i.test(html)) {
    return 'Esse é o link de uma PASTA. Use “Importar pasta do Drive” para listar os arquivos ou cole o link de um arquivo.';
  }
  return 'O Google Drive não devolveu o arquivo. Confira se o link está como “qualquer pessoa com o link”.';
}

/** Diagnóstico do Drive: devolve o que cada etapa respondeu (sem baixar o arquivo todo). */
export async function diagnoseDrive(rawUrl: string) {
  const id = driveFileId(rawUrl);
  const key = driveResourceKey(rawUrl);
  if (!id) return { ok: false as const, error: 'Link do Drive sem id de arquivo.' };
  const candidates: string[] = [];
  const base = new URLSearchParams({ id, export: 'download', confirm: 't' });
  if (key) base.set('resourcekey', key);
  candidates.push(`https://drive.usercontent.google.com/download?${base.toString()}`);
  candidates.push(`https://drive.google.com/uc?export=download&id=${id}${key ? `&resourcekey=${key}` : ''}`);
  candidates.push(`https://docs.google.com/uc?export=download&id=${id}`);

  const report: Array<Record<string, unknown>> = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', cache: 'no-store' });
      const type = (res.headers.get('content-type') ?? '').toLowerCase();
      const entry: Record<string, unknown> = {
        url: url.slice(0, 120),
        status: res.status,
        type,
        size: Number(res.headers.get('content-length') ?? 0),
      };
      if (type.includes('html')) {
        const html = await res.text();
        entry.nextUrl = driveDownloadFromHtml(html, rawUrl);
        entry.hint = driveHtmlHint(html);
      } else {
        // lê só os primeiros bytes para confirmar que é mídia de verdade
        const reader = res.body?.getReader();
        if (reader) {
          const chunk = await reader.read();
          entry.firstBytes = chunk.value?.length ?? 0;
          entry.magic = chunk.value ? Buffer.from(chunk.value.slice(0, 12)).toString('hex') : '';
          await reader.cancel().catch(() => undefined);
        }
      }
      report.push(entry);
      if (!type.includes('html') && res.ok) return { ok: true as const, id, used: url, report };
    } catch (err) {
      report.push({ url: url.slice(0, 120), error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { ok: false as const, id, report };
}

/** Baixa o arquivo tratando o aviso de "vírus grande" do Google Drive. */
async function fetchDirect(url: string, maxBytes: number): Promise<FetchedMedia | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', cache: 'no-store' });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('html')) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) return null;
    const filename = filenameFrom(res, guessName('direct', contentType));
    const type = mediaTypeOf(contentType, filename);
    if (!type) return null;
    return { ok: true, buffer, contentType, filename, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

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

    // O Drive devolve uma página HTML (aviso de vírus / confirmação / cota)
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const html = await res.text();
      if (kind === 'drive') {
        const next = driveDownloadFromHtml(html, rawUrl);
        if (next && next !== target) {
          target = next;
          continue;
        }
        return { ok: false, error: driveHtmlHint(html) };
      }
      const direct = html.match(/https?:\/\/[^"'\s]+\.(?:mp4|mov|webm|mp3|m4a|wav|jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/i)?.[0];
      if (direct) {
        const buffer = await fetchDirect(direct, maxBytes);
        if (buffer) return buffer;
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

/** Extrai ids de arquivos de uma pasta pública do Google Drive. */
export async function listDriveFolder(folderUrl: string): Promise<{ files: { id: string; name: string }[]; error?: string }> {
  const id = driveFolderId(folderUrl);
  if (!id) return { files: [], error: 'Link de pasta do Drive inválido.' };

  const seen = new Set<string>();
  const files: { id: string; name: string }[] = [];
  const collect = (html: string) => {
    // formato do embeddedfolderview: <div class="flip-entry" ... id="entry-ID"> … <div class="flip-entry-title">NOME</div>
    for (const block of html.split('flip-entry')) {
      const fid = block.match(/entry-([\w-]{10,})/)?.[1] ?? block.match(/\/file\/d\/([\w-]{10,})/)?.[1];
      const rawName = block.match(/flip-entry-title[^>]*>([^<]+)</)?.[1];
      if (!fid || !rawName || seen.has(fid)) continue;
      const name = unescapeHtml(rawName).trim();
      if (!name) continue;
      seen.add(fid);
      files.push({ id: fid, name });
    }
    // formato alternativo: pares "id","nome.ext" dentro do JSON da página
    const re = /"([\w-]{25,})"\s*,\s*"[^"]*"\s*,\s*"([^"]+\.(?:mp4|mov|m4v|webm|mkv|mp3|m4a|wav|ogg|aac|flac|jpg|jpeg|png|webp|gif|avif|heic|pdf))"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      files.push({ id: m[1], name: unescapeHtml(m[2]) });
    }
  };

  // 1) visão de lista (leve, sem JavaScript) — funciona para pasta pública
  try {
    const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}#list`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      cache: 'no-store',
    });
    if (res.ok) collect(await res.text());
  } catch {
    /* tenta o próximo formato */
  }

  // 2) página completa da pasta
  if (!files.length) {
    try {
      const res = await fetch(`https://drive.google.com/drive/folders/${id}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        redirect: 'follow',
        cache: 'no-store',
      });
      if (res.ok) collect(await res.text());
    } catch {
      /* segue para a mensagem de erro */
    }
  }

  if (!files.length) {
    return {
      files: [],
      error:
        'Não consegui listar os arquivos dessa pasta. Confira se ela está como “qualquer pessoa com o link”, ou cole o link de cada arquivo (Compartilhar → copiar link).',
    };
  }
  return { files: files.slice(0, 60) };
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
