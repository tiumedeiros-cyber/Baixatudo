/**
 * Módulo 3 · Processamento no navegador (custo de servidor $0).
 *
 * O render atual já é 100% local: `canvas.captureStream()` + `MediaRecorder`
 * (ver `components/studio/Exporter.tsx`). O navegador só grava MP4 nativo em
 * alguns casos (Chrome costuma gravar WebM). Este serviço é OPCIONAL e modular:
 * converte o WebM gravado para MP4 com FFmpeg.wasm — carregado sob demanda
 * direto do CDN, sem instalar nada no projeto e sem enviar 1 byte ao servidor.
 *
 * Se o CDN falhar ou o navegador não suportar, devolve `ok:false` e o export
 * continua funcionando exatamente como antes (arquivo WebM).
 */

export type RemuxResult =
  | { ok: true; blob: Blob; ext: 'mp4' }
  | { ok: false; error: string; blob?: undefined };

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
const FFMPEG_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm';
const UTIL_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm';

/** import() dinâmico sem o bundler tentar resolver o pacote no build. */
const dynamicImport = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

type ProgressFn = (ratio: number) => void;

let ffmpegPromise: Promise<any> | null = null;

export function ffmpegSupported() {
  if (typeof window === 'undefined') return false;
  // SharedArrayBuffer só existe com cross-origin isolation; o build single-thread
  // do core 0.12.6 funciona sem ele. Checamos apenas WebAssembly + Worker.
  return typeof WebAssembly !== 'undefined' && typeof Worker !== 'undefined';
}

async function ensureFfmpeg(onLog?: (line: string) => void) {
  if (!ffmpegSupported()) throw new Error('Navegador sem WebAssembly/Worker.');
  if (ffmpegPromise) return ffmpegPromise;

  ffmpegPromise = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = (await Promise.all([
      dynamicImport(FFMPEG_URL),
      dynamicImport(UTIL_URL),
    ])) as any[];

    const ffmpeg = new FFmpeg();
    if (onLog && typeof ffmpeg.on === 'function') ffmpeg.on('log', ({ message }: { message: string }) => onLog(message));

    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ffmpeg;
  })();

  try {
    return await ffmpegPromise;
  } catch (error) {
    ffmpegPromise = null; // permite nova tentativa depois
    throw error;
  }
}

/**
 * Converte WebM/MOV gravado pelo MediaRecorder para MP4 (H.264 + AAC).
 * Tudo acontece na memória do navegador; o arquivo não sai do dispositivo.
 */
export async function remuxToMp4(
  input: Blob,
  onProgress?: ProgressFn,
  onLog?: (line: string) => void,
): Promise<RemuxResult> {
  try {
    const ffmpeg = await ensureFfmpeg(onLog);
    const loadHandler = ({ progress }: { progress: number }) => onProgress?.(Math.min(0.6, progress * 0.6));
    if (typeof ffmpeg.on === 'function') ffmpeg.on('progress', loadHandler);

    await ffmpeg.writeFile('in.webm', new Uint8Array(await input.arrayBuffer()));
    await ffmpeg.exec([
      '-i', 'in.webm',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      'out.mp4',
    ]);

    const data = await ffmpeg.readFile('out.mp4');
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
    if (!bytes || bytes.byteLength < 1024) throw new Error('Conversão devolveu arquivo vazio.');

    onProgress?.(1);
    try {
      await ffmpeg.deleteFile('in.webm');
      await ffmpeg.deleteFile('out.mp4');
    } catch {
      /* limpeza best-effort */
    }

    return { ok: true, blob: new Blob([bytes.slice().buffer], { type: 'video/mp4' }), ext: 'mp4' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha na conversão local.' };
  }
}

/** True quando o navegador grava MP4 direto (aí nem precisamos do FFmpeg). */
export function recordsNativeMp4() {
  if (typeof MediaRecorder === 'undefined') return false;
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=h264', 'video/mp4'].some((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}
