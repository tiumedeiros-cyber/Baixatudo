'use client';

/**
 * Carrega o Transformers.js (Whisper) no navegador de forma resiliente.
 *
 * Antes usávamos um único CDN e um único modelo: se qualquer um falhasse a
 * transcrição ficava "carregando" para sempre. Agora:
 *  - tenta 3 CDNs diferentes (jsDelivr, esm.sh e unpkg);
 *  - desliga o modo multithread do WASM (que exige cabeçalhos especiais e
 *    travava em produção);
 *  - guarda o carregamento em cache para a segunda transcrição ser instantânea.
 */

type Pipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text: string; chunks?: { timestamp: [number, number]; text: string }[] }>;

type Transformers = {
  pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<Pipeline>;
  env?: Record<string, unknown> & {
    allowLocalModels?: boolean;
    useBrowserCache?: boolean;
    backends?: { onnx?: { wasm?: { numThreads?: number; proxy?: boolean; wasmPaths?: string } } };
  };
};

const CDNS = [
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/+esm',
  'https://esm.sh/@huggingface/transformers@3.7.5',
  'https://unpkg.com/@huggingface/transformers@3.7.5/dist/transformers.min.js',
];

export const WHISPER_MODELS = ['Xenova/whisper-tiny', 'onnx-community/whisper-tiny'];

function dynamicImport(url: string): Promise<Transformers> {
  // eslint-disable-next-line no-new-func
  const run = new Function('u', 'return import(u)') as (u: string) => Promise<Transformers>;
  return run(url);
}

function loadScript(url: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`não carregou ${url}`));
    document.head.appendChild(script);
  });
}

function configure(mod: Transformers) {
  const env = mod.env;
  if (!env) return;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const wasm = env.backends?.onnx?.wasm;
  if (wasm) {
    wasm.numThreads = 1; // multithread exige COOP/COEP e travava a página
    wasm.proxy = false;
  }
}

let loading: Promise<Transformers> | null = null;

export function loadTransformers(): Promise<Transformers> {
  if (loading) return loading;
  loading = (async () => {
    const errors: string[] = [];
    for (const url of CDNS) {
      try {
        const mod =
          url.endsWith('.js') && !url.includes('+esm')
            ? (await loadScript(url), ((window as unknown as { transformers?: Transformers }).transformers ?? null))
            : await dynamicImport(url);
        if (mod && typeof mod.pipeline === 'function') {
          configure(mod);
          return mod;
        }
        errors.push(`${url}: módulo sem pipeline`);
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : 'erro'}`);
      }
    }
    loading = null;
    throw new Error(`Não foi possível carregar o motor de transcrição (${errors.join(' · ')})`);
  })();
  return loading;
}

/** Carrega o modelo uma vez e reaproveita nas próximas transcrições. */
export async function loadWhisper(onProgress?: (message: string) => void) {
  const mod = await loadTransformers();
  let lastError: unknown = null;
  for (const model of WHISPER_MODELS) {
    try {
      const transcriber = await mod.pipeline('automatic-speech-recognition', model, {
        dtype: 'q8',
        progress_callback: (info: { status?: string; progress?: number }) => {
          if (info?.status === 'progress' && typeof info.progress === 'number') {
            onProgress?.(`Baixando o modelo de transcrição… ${Math.round(info.progress)}%`);
          } else if (info?.status === 'ready') {
            onProgress?.('Modelo pronto, transcrevendo…');
          } else if (info?.status === 'initiate') {
            onProgress?.('Preparando o modelo de transcrição…');
          }
        },
      });
      return transcriber;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Modelo de transcrição indisponível agora.');
}
