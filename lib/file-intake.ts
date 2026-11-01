/**
 * Entrada de arquivos do aparelho (celular/PC) — Módulo 2 · item 2.
 *
 * O <input type="file"> do Android costuma entregar `File` sem MIME (ou com
 * `application/octet-stream`), principalmente HEIC/HEVC e arquivos vindos do
 * WhatsApp/Drive. Sem tipo o upload ia como binário e a prévia/media não abria.
 *
 * Aqui o arquivo passa pelo `FileReader` (readAsArrayBuffer) e voltamos com um
 * `File` novo, com o MIME correto deduzido da extensão. O buffer só é lido
 * quando realmente precisa (tipo ausente/genérico): arquivos grandes com MIME
 * certo seguem direto, sem copiar 500 MB na memória.
 */

export const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  srt: 'text/plain',
  vtt: 'text/vtt',
};

export function extensionOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ext.length <= 5 ? ext : '';
}

export function mimeForFile(file: { name: string; type?: string }): string {
  const byExt = EXT_MIME[extensionOf(file.name)];
  const type = (file.type ?? '').toLowerCase();
  if (byExt) {
    // HEIC/HEVC às vezes chega como image/heic mas o iOS manda "image/heic-sequence"
    if (!type || type === 'application/octet-stream' || type === 'binary/octet-stream') return byExt;
    return type;
  }
  return type || 'application/octet-stream';
}

function readArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader indisponível'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('leitura vazia'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('falha de leitura'));
    reader.onabort = () => reject(new Error('leitura cancelada'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Devolve um `File` pronto para upload, com MIME confiável.
 * - tipo já correto → devolve o próprio arquivo (zero cópia);
 * - tipo ausente/binário → lê pelo FileReader e reembala com o MIME certo.
 */
export async function prepareFileForUpload(file: File): Promise<File> {
  if (!file) throw new Error('Nenhum arquivo selecionado.');
  if (file.size === 0) throw new Error(`"${file.name}" está vazio (0 bytes).`);
  const mime = mimeForFile(file);
  const current = (file.type ?? '').toLowerCase();
  const needsFix = !current || current === 'application/octet-stream' || current === 'binary/octet-stream';
  if (!needsFix) return file;
  try {
    const buffer = await readArrayBuffer(file);
    const named = file.name || `arquivo-${Date.now()}.${extensionOf(mime) || 'bin'}`;
    return new File([buffer], named, { type: mime, lastModified: file.lastModified || Date.now() });
  } catch {
    // FileReader bloqueado (navegador antigo/privado): segue com o original se ele já tem tipo
    if (current) return file;
    throw new Error(`Não foi possível ler "${file.name}" neste navegador. Tente enviar pelo computador.`);
  }
}
