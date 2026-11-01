import { randomUUID } from 'node:crypto';
import { secMsGec } from './ms-gec';

/**
 * Cliente mínimo do Microsoft Edge “Read Aloud” (vozes neurais, sem chave de API).
 *
 * Implementado aqui porque a biblioteca pronta (`edge-tts-universal`) travava em
 * produção: ela baixa o token DRM por outro caminho e estourava o tempo limite.
 * Este cliente faz o handshake completo (Sec-MS-GEC), usa WebSocket direto e
 * devolve os frames MP3 assim que o serviço fecha o turno.
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const WSS_BASE = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/** Data no formato que o serviço espera nos cabeçalhos das mensagens. */
function stamp() {
  return new Date().toUTCString();
}

export type EdgeSynthesisOptions = {
  text: string;
  voice: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  timeoutMs?: number;
};

/** Sintetiza o texto com uma voz neural do Edge e devolve o MP3. */
export async function edgeSynthesize(opts: EdgeSynthesisOptions): Promise<Buffer> {
  const voice = opts.voice;
  const text = opts.text.trim();
  if (!text) throw new Error('texto vazio');
  if (!/^[a-z]{2,3}-[A-Z]{2}-\w+Neural$/.test(voice)) throw new Error(`voz inválida: ${voice}`);

  const { WebSocket } = await import('ws');
  const connectionId = randomUUID().replace(/-/g, '');
  const requestId = randomUUID().replace(/-/g, '');
  const url =
    `${WSS_BASE}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`;

  const timeout = opts.timeoutMs ?? 15_000;

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let finished = false;
    const socket = new WebSocket(url, {
      headers: {
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-WebSocket-Version': '13',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0`,
      },
    });

    const done = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignora */
      }
      if (error) reject(error);
      else if (chunks.length === 0) reject(new Error('voz neural não devolveu áudio'));
      else resolve(Buffer.concat(chunks));
    };

    const timer = setTimeout(() => done(new Error(`tempo esgotado (${Math.round(timeout / 1000)}s)`)), timeout);

    socket.on('open', () => {
      const config =
        `X-Timestamp:${stamp()}\r\n` +
        'Content-Type:application/json; charset=utf-8\r\n' +
        'Path:speech.config\r\n\r\n' +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                outputFormat: OUTPUT_FORMAT,
              },
            },
          },
        });
      socket.send(config);

      const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const lang = voice.slice(0, 5);
      const ssml =
        `X-RequestId:${requestId}\r\n` +
        'Content-Type:application/ssml+xml\r\n' +
        `X-Timestamp:${stamp()}\r\n` +
        'Path:ssml\r\n\r\n' +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
        `<voice name='${voice}'>` +
        `<prosody pitch='${opts.pitch ?? '+0Hz'}' rate='${opts.rate ?? '+0%'}' volume='${opts.volume ?? '+0%'}'>${safe}</prosody>` +
        '</voice></speak>';
      socket.send(ssml);
    });

    socket.on('message', (data: Buffer | string, isBinary: boolean) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as string);
      if (isBinary) {
        if (buffer.length < 2) return;
        const headerLength = buffer.readUInt16BE(0);
        const header = buffer.subarray(2, 2 + headerLength).toString('utf8');
        if (/Path:\s*audio/i.test(header)) chunks.push(buffer.subarray(2 + headerLength));
        return;
      }
      const message = buffer.toString('utf8');
      if (/Path:\s*turn\.end/i.test(message)) done();
    });

    socket.on('error', (error) => done(error instanceof Error ? error : new Error(String(error))));
    socket.on('close', () => {
      if (!finished) done(chunks.length ? undefined : new Error('conexão encerrada sem áudio'));
    });
  });
}

/** Vozes neurais por idioma aceitas pelo serviço (fallback quando a voz pedida falha). */
export const EDGE_FALLBACK: Record<string, string> = {
  'pt-BR': 'pt-BR-FranciscaNeural',
  'pt-PT': 'pt-PT-RaquelNeural',
  'en-US': 'en-US-AvaMultilingualNeural',
  'en-GB': 'en-GB-SoniaNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'it-IT': 'it-IT-ElsaNeural',
};
