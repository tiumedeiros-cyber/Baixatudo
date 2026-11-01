import crypto from 'node:crypto';

/**
 * Cliente mínimo de storage S3-compatível (Cloudflare R2, Backblaze B2,
 * MinIO, Wasabi, AWS S3…). Sem SDK: assinatura AWS SigV4 na mão com `crypto`.
 *
 * Serve para tirar os arquivos grandes do Supabase quando o plano é pequeno:
 * R2 e B2 têm faixa gratuita de 10 GB, MinIO roda no seu servidor.
 */
export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** domínio público do bucket (ex.: https://media.seudominio.com) */
  publicBase: string;
};

const enc = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function encodeKey(key: string) {
  return key
    .split('/')
    .map((part) => enc(part))
    .join('/');
}

function sha256Hex(data: crypto.BinaryLike) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, data: string) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function signature(config: S3Config, method: string, key: string, payloadHash: string, contentType?: string) {
  const endpoint = new URL(config.endpoint);
  const host = endpoint.host;
  const now = new Date();
  const amzDate = `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${config.bucket}/${encodeKey(key)}`.replace(/\/{2,}/g, '/');
  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join('');
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretKey}`, dateStamp), config.region), 's3'), 'aws4_request');
  const sig = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
  return { authorization, amzDate, payloadHash, url: `${endpoint.origin}${canonicalUri}` };
}

export function s3Ready(config?: Partial<S3Config> | null): config is S3Config {
  return Boolean(config?.endpoint && config?.bucket && config?.accessKey && config?.secretKey);
}

export async function s3Put(config: S3Config, key: string, body: Buffer, contentType: string) {
  const payloadHash = sha256Hex(body);
  const signed = signature(config, 'PUT', key, payloadHash, contentType);
  try {
    const res = await fetch(signed.url, {
      method: 'PUT',
      headers: {
        Authorization: signed.authorization,
        'x-amz-content-sha256': signed.payloadHash,
        'x-amz-date': signed.amzDate,
        'Content-Type': contentType,
      },
      body: new Uint8Array(body),
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `Storage externo respondeu ${res.status}${text ? `: ${text.slice(0, 160)}` : ''}` };
    }
    return { ok: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha de rede no storage externo.' };
  }
}

export async function s3Delete(config: S3Config, key: string) {
  const signed = signature(config, 'DELETE', key, sha256Hex(''));
  try {
    const res = await fetch(signed.url, {
      method: 'DELETE',
      headers: {
        Authorization: signed.authorization,
        'x-amz-content-sha256': signed.payloadHash,
        'x-amz-date': signed.amzDate,
      },
      cache: 'no-store',
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function s3PublicUrl(config: S3Config, key: string) {
  const base = (config.publicBase || `${config.endpoint.replace(/\/$/, '')}/${config.bucket}`).replace(/\/$/, '');
  return `${base}/${encodeKey(key)}`;
}

/**
 * URL pré-assinada para o navegador enviar direto no bucket (PUT).
 * Assim arquivos grandes não passam pela função da Vercel.
 */
export function s3PresignPut(config: S3Config, key: string, expiresSeconds = 900) {
  const endpoint = new URL(config.endpoint);
  const host = endpoint.host;
  const now = new Date();
  const amzDate = `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const canonicalUri = `/${config.bucket}/${encodeKey(key)}`.replace(/\/{2,}/g, '/');
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.min(Math.max(expiresSeconds, 60), 604800)),
    'X-Amz-SignedHeaders': 'host',
  };
  const query = Object.keys(params)
    .sort()
    .map((name) => `${enc(name)}=${enc(params[name])}`)
    .join('&');
  const canonicalRequest = ['PUT', canonicalUri, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretKey}`, dateStamp), config.region), 's3'), 'aws4_request');
  const sig = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `${endpoint.origin}${canonicalUri}?${query}&X-Amz-Signature=${sig}`;
}
