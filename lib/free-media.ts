/**
 * Catálogo de mídia aberta e gratuita — sem chave de API, sem cobrança.
 *
 * Fontes usadas (todas gratuitas para uso comercial, com atribuição quando
 * indicada): Wikimedia Commons, Internet Archive, Iconify, Pollinations e
 * QR Server. Nada aqui depende de conta paga: se o serviço estiver fora do ar,
 * a tela avisa e continua funcionando com as outras fontes.
 */

export type FreeItem = {
  id: string;
  title: string;
  thumb: string;
  url: string;
  page?: string;
  license?: string;
  author?: string;
  kind: 'image' | 'audio' | 'icon';
  width?: number;
  height?: number;
};

const UA = 'EditorStudio/1.0 (+https://editor-studio-one.vercel.app)';

async function getJson(url: string, timeoutMs = 12_000): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Wikimedia Commons: fotos e ilustrações livres. */
export async function searchCommons(query: string, limit = 24): Promise<FreeItem[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`.trim(),
    gsrnamespace: '6',
    gsrlimit: String(Math.min(Math.max(limit, 1), 40)),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '1600',
  });
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  const pages = (data?.query as { pages?: Record<string, unknown> })?.pages;
  if (!pages) return [];
  return Object.entries(pages).map(([id, raw]) => {
    const page = raw as {
      title?: string;
      imageinfo?: Array<{
        thumburl?: string;
        url?: string;
        width?: number;
        height?: number;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string }>;
      }>;
    };
    const info = page.imageinfo?.[0] ?? {};
    const meta = info.extmetadata ?? {};
    const strip = (value?: string) => (value ? value.replace(/<[^>]*>/g, '').trim() : '');
    return {
      id: `commons-${id}`,
      title: strip(page.title)?.replace(/^File:/, '') ?? 'Imagem',
      thumb: info.thumburl || info.url || '',
      url: info.thumburl || info.url || '',
      page: info.descriptionurl,
      license: strip(meta.LicenseShortName?.value) || 'Wikimedia',
      author: strip(meta.Artist?.value).slice(0, 80),
      kind: 'image' as const,
      width: info.width,
      height: info.height,
    };
  }).filter((item) => Boolean(item.url));
}

/** Internet Archive: músicas e áudios livres (domínio público / Creative Commons). */
export async function searchArchive(query: string, limit = 24): Promise<FreeItem[]> {
  const params = new URLSearchParams({
    q: `${query} AND mediatype:(audio)`.trim(),
    'fl[]': 'identifier',
    rows: String(Math.min(Math.max(limit, 1), 40)),
    page: '1',
    output: 'json',
    sort: 'downloads desc',
  });
  params.append('fl[]', 'title');
  params.append('fl[]', 'creator');
  params.append('fl[]', 'licenseurl');
  const data = await getJson(`https://archive.org/advancedsearch.php?${params.toString()}`);
  const docs = (data?.response as { docs?: Array<Record<string, unknown>> })?.docs ?? [];
  return docs.map((doc) => {
    const id = String(doc.identifier ?? '');
    return {
      id: `archive-${id}`,
      title: String(doc.title ?? id).slice(0, 90),
      thumb: `https://archive.org/services/img/${id}`,
      url: `https://archive.org/download/${id}`,
      page: `https://archive.org/details/${id}`,
      license: String(doc.licenseurl ?? 'Internet Archive'),
      author: String(doc.creator ?? '').slice(0, 60),
      kind: 'audio' as const,
    };
  }).filter((item) => Boolean(item.id) && item.url);
}

/** Escolhe o primeiro MP3 de um item do Archive (usado ao salvar). */
export async function archiveAudioFile(identifier: string) {
  const data = await getJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  const files = (data?.files as Array<Record<string, unknown>>) ?? [];
  const pick =
    files.find((f) => String(f.format ?? '').toLowerCase().includes('mp3')) ??
    files.find((f) => ['ogg', 'flac', 'm4a'].some((ext) => String(f.name ?? '').toLowerCase().endsWith(ext)));
  if (!pick?.name) return '';
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(String(pick.name))}`;
}

/** Iconify: +200 mil ícones vetoriais (MIT/Apache/CC) num único endpoint. */
export async function searchIcons(query: string, limit = 36): Promise<FreeItem[]> {
  const data = await getJson(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${Math.min(Math.max(limit, 1), 64)}`);
  const icons = (data?.icons as string[]) ?? [];
  return icons.map((name) => {
    const [prefix, icon] = name.split(':');
    const url = `https://api.iconify.design/${prefix}/${icon}.svg?height=512&color=%23000000`;
    return {
      id: `iconify-${name}`,
      title: icon.replace(/-/g, ' '),
      thumb: url,
      url,
      page: `https://icon-sets.iconify.design/${prefix}/?icon=${icon}`,
      license: 'Ícone livre',
      kind: 'icon' as const,
    };
  });
}

/** Pollinations: geração de imagem por IA gratuita e sem chave. */
export function pollinationsUrl(prompt: string, width = 1024, height = 1024, seed = 0) {
  const clean = prompt.trim().slice(0, 500) || 'abstract colorful background';
  const params = new URLSearchParams({
    width: String(Math.min(Math.max(width, 256), 1536)),
    height: String(Math.min(Math.max(height, 256), 1536)),
    model: 'sana',
    nologo: 'true',
    seed: String(seed || Math.floor(Math.random() * 1_000_000)),
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}?${params.toString()}`;
}

/** QR Code livre para anúncios e vitrines. */
export function qrUrl(text: string, size = 600) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(text.slice(0, 900))}`;
}

/** Só baixamos de hosts conhecidos — evita que a rota vire proxy aberto. */
export const ALLOWED_HOSTS = [
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'commons.wikimedia.org',
  'archive.org',
  'ia801.us.archive.org',
  'ia802.us.archive.org',
  'ia803.us.archive.org',
  'api.iconify.design',
  'image.pollinations.ai',
  'api.qrserver.com',
];

export function isAllowedFreeUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.includes(host) || ALLOWED_HOSTS.some((allowed) => host.endsWith(`.${allowed}`)) || host.endsWith('.archive.org');
  } catch {
    return false;
  }
}
