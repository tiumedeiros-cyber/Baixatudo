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

/** Os nomes de ícone do Iconify são em inglês — traduzimos os termos mais usados. */
const ICON_HINTS: Record<string, string> = {
  carrinho: 'cart',
  compra: 'shopping',
  compras: 'shopping',
  entrega: 'delivery',
  caminhao: 'truck',
  desconto: 'discount',
  promocao: 'sale',
  estrela: 'star',
  dinheiro: 'money',
  pagamento: 'payment',
  cartao: 'credit-card',
  presente: 'gift',
  telefone: 'phone',
  whatsapp: 'whatsapp',
  comida: 'food',
  cafe: 'coffee',
  musica: 'music',
  video: 'video',
  camera: 'camera',
  microfone: 'microphone',
  loja: 'store',
  casa: 'home',
  seta: 'arrow',
  check: 'check',
  coracao: 'heart',
  foguete: 'rocket',
  fogo: 'fire',
  relogio: 'clock',
  calendario: 'calendar',
  seguranca: 'shield',
  grafico: 'chart',
};

export async function searchIcons(query: string, limit = 36): Promise<FreeItem[]> {
  const term = ICON_HINTS[query.trim().toLowerCase()] ?? query;
  const data = await getJson(`https://api.iconify.design/search?query=${encodeURIComponent(term)}&limit=${Math.min(Math.max(limit, 1), 64)}`);
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


/* -------------------------------------------------------------------------- */
/*        Arte em alta resolução, domínio público (sem marca d'água)         */
/* -------------------------------------------------------------------------- */

/**
 * Art Institute of Chicago — API aberta, sem chave, ~120 mil obras.
 * Filtra só o que é domínio público e devolve imagem grande por IIIF.
 */
export async function searchArtic(query: string, limit = 24): Promise<FreeItem[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(Math.min(Math.max(limit, 1), 40)),
    fields: 'id,title,image_id,artist_display,is_public_domain,date_display,department_title',
  });
  const data = await getJson(`https://api.artic.edu/api/v1/artworks/search?${params.toString()}`, 14_000);
  const rows = (data?.data as Array<Record<string, unknown>>) ?? [];
  return rows
    .filter((row) => row.image_id && row.is_public_domain !== false)
    .map((row) => {
      const imageId = String(row.image_id);
      // IIIF do Art Institute: usa tamanho confinado (é o modo suportado)
      const url = `https://www.artic.edu/iiif/2/${imageId}/full/!1686,1686/0/default.jpg`;
      return {
        id: `artic-${row.id}`,
        title: String(row.title ?? 'Obra').slice(0, 90),
        thumb: `https://www.artic.edu/iiif/2/${imageId}/full/!600,600/0/default.jpg`,
        url,
        page: `https://www.artic.edu/artworks/${row.id}`,
        license: 'Domínio público',
        author: String(row.artist_display ?? '').split('\n')[0].slice(0, 70),
        kind: 'image' as const,
        width: 1686,
      };
    });
}

/**
 * The Met (Nova York) — Open Access, sem chave. A busca devolve ids e cada
 * objeto precisa de uma consulta, então limitamos para não pesar a resposta.
 */
export async function searchMet(query: string, limit = 12): Promise<FreeItem[]> {
  // a rota /v1/search foi aposentada em 01/10/2026: agora é /v1.1 (paginada)
  const search = await getJson(
    `https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&q=${encodeURIComponent(query)}&offset=0&limit=20`,
    12_000,
  );
  const ids = ((search?.objectIDs as number[]) ?? []).slice(0, Math.min(Math.max(limit, 1), 16));
  if (!ids.length) return [];
  const objects = await Promise.all(
    ids.map((id) =>
      getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, 9_000).catch(() => null),
    ),
  );
  return objects
    .filter((obj): obj is Record<string, unknown> => Boolean(obj) && Boolean((obj as Record<string, unknown>).primaryImage))
    .map((obj) => ({
      id: `met-${obj.objectID}`,
      title: String(obj.title ?? 'Obra').slice(0, 90),
      thumb: String(obj.primaryImageSmall ?? obj.primaryImage),
      url: String(obj.primaryImage),
      page: String(obj.objectURL ?? ''),
      license: 'Domínio público',
      author: String(obj.artistDisplayName ?? '').slice(0, 70),
      kind: 'image' as const,
    }));
}

/** Busca combinada: Chicago + Met (as duas melhores fontes de arte livre). */
export async function searchArt(query: string, limit = 24): Promise<FreeItem[]> {
  const [artic, met] = await Promise.all([searchArtic(query, limit), searchMet(query, 10)]);
  const seen = new Set<string>();
  const all = [...artic, ...met].filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  return all.slice(0, limit + 10);
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
  'www.artic.edu',
  'api.artic.edu',
  'images.metmuseum.org',
];

export function isAllowedFreeUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.includes(host) || ALLOWED_HOSTS.some((allowed) => host.endsWith(`.${allowed}`)) || host.endsWith('.archive.org');
  } catch {
    return false;
  }
}
