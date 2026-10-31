import type { Asset, AssetType } from '@/lib/types';

/**
 * Catálogo de conteúdo do sistema — vive no código, não no banco.
 *
 * Assim o editor carrega instantaneamente, não gasta leitura do Supabase e dá
 * para crescer a biblioteca (fundos, selos, sons, fontes, 3D) só acrescentando
 * itens aqui. Assets vindos do banco continuam funcionando como extras.
 */
type Seed = {
  name: string;
  type: AssetType;
  category: string;
  url: string;
  premium?: boolean;
  tags: string;
  metadata?: Record<string, unknown>;
};

const SEED: Seed[] = [
  { name: "Fade suave", type: 'transition', category: 'transicoes', url: "builtin:fade", premium: false, tags: "fade,suave", metadata: {"engine": "builtin"} },
  { name: "Deslizar lateral", type: 'transition', category: 'transicoes', url: "builtin:slide", premium: false, tags: "slide,lateral", metadata: {"engine": "builtin"} },
  { name: "Zoom impacto", type: 'transition', category: 'transicoes', url: "builtin:zoom", premium: false, tags: "zoom,impacto", metadata: {"engine": "builtin"} },
  { name: "Wipe diagonal", type: 'transition', category: 'transicoes', url: "builtin:wipe", premium: true, tags: "wipe,diagonal", metadata: {"engine": "builtin"} },
  { name: "Glitch RGB", type: 'transition', category: 'transicoes', url: "builtin:glitch", premium: true, tags: "glitch,rgb", metadata: {"engine": "builtin"} },
  { name: "Flash de luz", type: 'transition', category: 'transicoes', url: "builtin:flash", premium: true, tags: "flash,luz", metadata: {"engine": "builtin"} },
  { name: "Whoosh", type: 'sfx', category: 'sons', url: "builtin:whoosh", premium: false, tags: "whoosh,transicao", metadata: {"engine": "builtin", "duration": 0.8} },
  { name: "Clique UI", type: 'sfx', category: 'sons', url: "builtin:click", premium: false, tags: "click,ui", metadata: {"engine": "builtin", "duration": 0.15} },
  { name: "Riser tensão", type: 'sfx', category: 'sons', url: "builtin:riser", premium: true, tags: "riser,tensao", metadata: {"engine": "builtin", "duration": 2.5} },
  { name: "Impacto cinematográfico", type: 'sfx', category: 'sons', url: "builtin:impact", premium: false, tags: "impacto,boom", metadata: {"engine": "builtin", "duration": 1.2} },
  { name: "Sino suave", type: 'sfx', category: 'sons', url: "builtin:bell", premium: false, tags: "sino,suave", metadata: {"engine": "builtin", "duration": 1.5} },
  { name: "Ambiente lo-fi", type: 'music', category: 'musicas', url: "builtin:lofi", premium: true, tags: "lofi,ambiente", metadata: {"engine": "builtin", "duration": 20} },
  { name: "Pulso cinematográfico", type: 'music', category: 'musicas', url: "builtin:cinematic", premium: true, tags: "cinema,pulso", metadata: {"engine": "builtin", "duration": 20} },
  { name: "Cubo 3D", type: 'object3d', category: 'objetos3d', url: "builtin:cube", premium: false, tags: "cubo,3d", metadata: {"engine": "builtin", "shape": "box"} },
  { name: "Esfera 3D", type: 'object3d', category: 'objetos3d', url: "builtin:sphere", premium: false, tags: "esfera,3d", metadata: {"engine": "builtin", "shape": "sphere"} },
  { name: "Torus 3D", type: 'object3d', category: 'objetos3d', url: "builtin:torus", premium: true, tags: "torus,3d", metadata: {"engine": "builtin", "shape": "torus"} },
  { name: "Nó 3D", type: 'object3d', category: 'objetos3d', url: "builtin:knot", premium: true, tags: "no,3d", metadata: {"engine": "builtin", "shape": "knot"} },
  { name: "Vinheta", type: 'overlay', category: 'overlays', url: "builtin:vignette", premium: false, tags: "vinheta,overlay", metadata: {"engine": "builtin"} },
  { name: "Grão de filme", type: 'overlay', category: 'overlays', url: "builtin:grain", premium: true, tags: "grao,filme", metadata: {"engine": "builtin"} },
  { name: "Moldura clássica", type: 'sticker', category: 'stickers', url: "builtin:frame", premium: false, tags: "moldura", metadata: {"engine": "builtin"} },
  { name: "Formas geométricas", type: 'sticker', category: 'stickers', url: "builtin:shapes", premium: false, tags: "formas", metadata: {"engine": "builtin"} },
  { name: "Explosão de oferta", type: 'sticker', category: 'promo', url: "builtin:burst", premium: false, tags: "selo,explosao,oferta", metadata: {"engine": "builtin"} },
  { name: "Etiqueta de preço", type: 'sticker', category: 'promo', url: "builtin:tag", premium: false, tags: "etiqueta,preco", metadata: {"engine": "builtin"} },
  { name: "Faixa de desconto", type: 'sticker', category: 'promo', url: "builtin:ribbon", premium: false, tags: "faixa,desconto", metadata: {"engine": "builtin"} },
  { name: "Selo de garantia", type: 'sticker', category: 'promo', url: "builtin:seal", premium: false, tags: "selo,garantia", metadata: {"engine": "builtin"} },
  { name: "Estrela de avaliação", type: 'sticker', category: 'promo', url: "builtin:star", premium: false, tags: "estrela,avaliacao", metadata: {"engine": "builtin"} },
  { name: "Pílula de destaque", type: 'sticker', category: 'promo', url: "builtin:pill", premium: false, tags: "pilula,destaque", metadata: {"engine": "builtin"} },
  { name: "Seta indicativa", type: 'sticker', category: 'promo', url: "builtin:arrow", premium: false, tags: "seta,indicacao", metadata: {"engine": "builtin"} },
  { name: "Anéis concêntricos", type: 'sticker', category: 'promo', url: "builtin:rings", premium: true, tags: "aneis,circulos", metadata: {"engine": "builtin"} },
  { name: "Inter", type: 'font', category: 'fontes', url: "font:Inter", premium: false, tags: "sans,moderna", metadata: {"engine": "google"} },
  { name: "Poppins", type: 'font', category: 'fontes', url: "font:Poppins", premium: false, tags: "sans,arredondada", metadata: {"engine": "google"} },
  { name: "Bebas Neue", type: 'font', category: 'fontes', url: "font:Bebas Neue", premium: false, tags: "condensada,titulo", metadata: {"engine": "google"} },
  { name: "Playfair Display", type: 'font', category: 'fontes', url: "font:Playfair Display", premium: false, tags: "serifada,elegante", metadata: {"engine": "google"} },
  { name: "Montserrat", type: 'font', category: 'fontes', url: "font:Montserrat", premium: false, tags: "sans,corporativa", metadata: {"engine": "google"} },
  { name: "Anton", type: 'font', category: 'fontes', url: "font:Anton", premium: true, tags: "impacto,titulo", metadata: {"engine": "google"} },
  { name: "Fundo vitrine laranja", type: 'image', category: 'fundos', url: "/library/bg-marketplace.webp", premium: false, tags: "fundo,marketplace,laranja,vitrine", metadata: {"engine": "file", "width": 1920, "height": 1080} },
  { name: "Fundo flash sale neon", type: 'image', category: 'fundos', url: "/library/bg-flashsale.webp", premium: false, tags: "fundo,neon,flash,oferta", metadata: {"engine": "file", "width": 1920, "height": 1080} },
  { name: "Fundo delivery", type: 'image', category: 'fundos', url: "/library/bg-delivery.webp", premium: false, tags: "fundo,delivery,comida,entrega", metadata: {"engine": "file", "width": 1920, "height": 1080} },
  { name: "Fundo pódio pastel", type: 'image', category: 'fundos', url: "/library/bg-podium.webp", premium: false, tags: "fundo,podio,produto,pastel", metadata: {"engine": "file", "width": 1920, "height": 1080} },
  { name: "Fundo black friday", type: 'image', category: 'fundos', url: "/library/bg-blackfriday.webp", premium: false, tags: "fundo,blackfriday,preto,dourado", metadata: {"engine": "file", "width": 1920, "height": 1080} },
  { name: "Fundo malha gradiente", type: 'image', category: 'fundos', url: "/library/bg-gradientmesh.webp", premium: false, tags: "fundo,gradiente,mesh,abstrato", metadata: {"engine": "file", "width": 1920, "height": 1080} },
  { name: "Aurora animada", type: 'generator', category: 'fundos', url: "builtin:aurora", premium: false, tags: "animado,aurora,gradiente", metadata: {"engine": "generator", "preset": "aurora", "colorA": "#4338ca", "colorB": "#22d3ee"} },
  { name: "Ondas fluidas", type: 'generator', category: 'fundos', url: "builtin:waves", premium: false, tags: "animado,ondas,fluido", metadata: {"engine": "generator", "preset": "waves", "colorA": "#7c3aed", "colorB": "#ec4899"} },
  { name: "Partículas douradas", type: 'generator', category: 'fundos', url: "builtin:particles", premium: false, tags: "animado,particulas,dourado", metadata: {"engine": "generator", "preset": "particles", "colorA": "#0f172a", "colorB": "#fbbf24"} },
  { name: "Grid neon", type: 'generator', category: 'fundos', url: "builtin:grid", premium: true, tags: "animado,grid,neon,tech", metadata: {"engine": "generator", "preset": "grid", "colorA": "#0b1220", "colorB": "#22d3ee"} },
  { name: "Bokeh quente", type: 'generator', category: 'fundos', url: "builtin:bokeh", premium: false, tags: "animado,bokeh,quente", metadata: {"engine": "generator", "preset": "bokeh", "colorA": "#fb7185", "colorB": "#fbbf24"} },
  { name: "Feixe de luz", type: 'generator', category: 'fundos', url: "builtin:sweep", premium: false, tags: "animado,luz,feixe", metadata: {"engine": "generator", "preset": "sweep", "colorA": "#111827", "colorB": "#e0f2fe"} },
  { name: "Raios de sol", type: 'generator', category: 'fundos', url: "builtin:rays", premium: true, tags: "animado,raios,sol", metadata: {"engine": "generator", "preset": "rays", "colorA": "#f97316", "colorB": "#fde047"} },
  { name: "Holofote de palco", type: 'generator', category: 'fundos', url: "builtin:spotlight", premium: false, tags: "animado,holofote,palco", metadata: {"engine": "generator", "preset": "spotlight", "colorA": "#020617", "colorB": "#3b82f6"} },
  { name: "Listras diagonais", type: 'generator', category: 'fundos', url: "builtin:stripes", premium: false, tags: "animado,listras,diagonal", metadata: {"engine": "generator", "preset": "stripes", "colorA": "#6d28d9", "colorB": "#f97316"} },
  { name: "Gradiente suave", type: 'generator', category: 'fundos', url: "builtin:gradient", premium: false, tags: "animado,gradiente,suave", metadata: {"engine": "generator", "preset": "gradient", "colorA": "#06b6d4", "colorB": "#8b5cf6"} },
];

export const CATALOG_ASSETS: Asset[] = SEED.map((item, index) => ({
  id: `cat-${index}-${item.url.replace(/[^a-z0-9]+/gi, '-')}`,
  name: item.name,
  type: item.type,
  category: item.category,
  url: item.url,
  preview_url: item.type === 'image' ? item.url : null,
  premium: Boolean(item.premium),
  tags: item.tags.split(','),
  metadata: item.metadata ?? {},
  is_active: true,
}));

export const CATALOG_URLS = new Set(CATALOG_ASSETS.map((a) => a.url));

/** Junta o catálogo do código com os assets extras que o admin cadastrou no banco. */
export function mergeAssets(extra: Asset[] = []): Asset[] {
  const seen = new Set(CATALOG_URLS);
  const extras = extra.filter((a) => {
    if (!a.url || seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
  return [...CATALOG_ASSETS, ...extras];
}

