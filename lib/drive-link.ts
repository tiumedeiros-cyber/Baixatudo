/**
 * Conversor de links de "visualizar" → download direto.
 *
 * Módulo 2 · item 2. Roda no navegador e no servidor (sem `node:`), então a
 * mesma regra vale para o campo de importação, para o "Baixa Tudo" e para a
 * rota `/api/import` (que já usava uma cópia parecida).
 *
 * Exemplos:
 *   drive.google.com/file/d/<ID>/view        → drive.usercontent.google.com/download?id=<ID>&export=download
 *   drive.google.com/open?id=<ID>            → idem
 *   docs.google.com/document/d/<ID>/edit     → export?format=docx (documentos)
 *   dropbox.com/s/...?dl=0                   → ?dl=1
 *   1drv.ms / onedrive.live.com              → ?download=1
 */

export type DirectLink = {
  url: string;
  kind: 'drive' | 'dropbox' | 'onedrive' | 'direct';
  /** id do arquivo (Drive) — usado para miniatura e nome */
  id?: string | null;
  /** `true` quando o link foi de fato convertido */
  converted: boolean;
};

export function driveFileId(input: string): string | null {
  const patterns = [/\/file\/d\/([\w-]{10,})/, /[?&]id=([\w-]{10,})/, /\/d\/([\w-]{10,})/];
  for (const re of patterns) {
    const match = input.match(re);
    if (match) return match[1];
  }
  return null;
}

function driveResourceKey(input: string): string | null {
  const match = input.match(/[?&]resourcekey=([\w-]{6,})/);
  return match ? match[1] : null;
}

export function driveFolderId(input: string): string | null {
  const match = input.match(/\/folders\/([\w-]{10,})/);
  return match ? match[1] : null;
}

export function toDirectDownload(raw: string): DirectLink {
  const url = raw.trim();

  if (!url) return { url, kind: 'direct', converted: false };

  // Google Docs / Sheets / Slides publicados
  const docs = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]{10,})/);
  if (docs) {
    const [, kind, id] = docs;
    const format = kind === 'document' ? 'docx' : kind === 'spreadsheets' ? 'xlsx' : 'pptx';
    return {
      url: `https://docs.google.com/${kind}/d/${id}/export?format=${format}`,
      kind: 'drive',
      id,
      converted: true,
    };
  }

  if (/drive\.google\.com|docs\.google\.com/.test(url)) {
    const id = driveFileId(url);
    if (id) {
      const key = driveResourceKey(url);
      const params = new URLSearchParams({ id, export: 'download', confirm: 't' });
      if (key) params.set('resourcekey', key);
      // endpoint atual: o antigo drive.google.com/uc devolve HTML de aviso
      return { url: `https://drive.usercontent.google.com/download?${params.toString()}`, kind: 'drive', id, converted: true };
    }
  }

  if (/dropbox\.com/.test(url)) {
    const clean = url.replace(/[?&](dl|raw)=0/, '');
    return {
      url: clean.includes('?') ? `${clean}&dl=1` : `${clean}?dl=1`,
      kind: 'dropbox',
      converted: true,
    };
  }

  if (/1drv\.ms|onedrive\.live\.com/.test(url)) {
    return {
      url: url.includes('?') ? `${url}&download=1` : `${url}?download=1`,
      kind: 'onedrive',
      converted: true,
    };
  }

  return { url, kind: 'direct', converted: false };
}

/** Miniatura pública do arquivo do Drive (não baixa nada). */
export function driveThumbnail(id: string | null | undefined, size = 800) {
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${size}` : '';
}
