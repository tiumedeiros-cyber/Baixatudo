/**
 * Google Fonts — catálogo e carregamento dinâmico pelo CDN.
 *
 * Não precisa de chave nem de armazenamento: a fonte é buscada do CDN do
 * Google no primeiro uso do navegador e fica em cache. O canvas do editor usa
 * `document.fonts.load` antes de desenhar, então a tipografia sai igualzinha
 * na prévia e na exportação.
 */

export type FontCategory = 'sans' | 'serif' | 'display' | 'script' | 'mono';

export type GoogleFont = {
  family: string;
  category: FontCategory;
  weights: number[];
  /** usos típicos, para o usuário achar rápido */
  tags: string;
};

/** Catálogo curado de fontes profissionais do Google (todas livres para uso). */
export const GOOGLE_FONTS: GoogleFont[] = [
  { family: 'Inter', category: 'sans', weights: [400, 600, 800, 900], tags: 'interface,moderna,neutra' },
  { family: 'Poppins', category: 'sans', weights: [500, 600, 700, 800], tags: 'arredondada,amigável' },
  { family: 'Montserrat', category: 'sans', weights: [400, 600, 700, 900], tags: 'corporativa,cartaz' },
  { family: 'Bebas Neue', category: 'display', weights: [400], tags: 'condensada,título' },
  { family: 'Anton', category: 'display', weights: [400], tags: 'impacto,promoção' },
  { family: 'Oswald', category: 'display', weights: [400, 600, 700], tags: 'condensada,esporte' },
  { family: 'Archivo Black', category: 'display', weights: [400], tags: 'peso,impacto' },
  { family: 'Playfair Display', category: 'serif', weights: [400, 700, 900], tags: 'elegante,editorial' },
  { family: 'Lora', category: 'serif', weights: [400, 600, 700], tags: 'livro,calma' },
  { family: 'DM Serif Display', category: 'serif', weights: [400], tags: 'luxo,título' },
  { family: 'Roboto', category: 'sans', weights: [400, 500, 700, 900], tags: 'universal' },
  { family: 'Roboto Condensed', category: 'sans', weights: [400, 700], tags: 'compacta' },
  { family: 'Open Sans', category: 'sans', weights: [400, 600, 700], tags: 'legível' },
  { family: 'Lato', category: 'sans', weights: [400, 700, 900], tags: 'limpa' },
  { family: 'Nunito', category: 'sans', weights: [400, 700, 900], tags: 'suave' },
  { family: 'Rubik', category: 'sans', weights: [400, 600, 800], tags: 'tech,arredondada' },
  { family: 'Space Grotesk', category: 'sans', weights: [400, 600, 700], tags: 'tech,futurista' },
  { family: 'Sora', category: 'sans', weights: [400, 600, 800], tags: 'startup,moderna' },
  { family: 'Manrope', category: 'sans', weights: [400, 600, 800], tags: 'premium,clean' },
  { family: 'Outfit', category: 'sans', weights: [400, 600, 800], tags: 'geométrica' },
  { family: 'Barlow', category: 'sans', weights: [400, 600, 800], tags: 'gótica,esportiva' },
  { family: 'Work Sans', category: 'sans', weights: [400, 600, 800], tags: 'produto' },
  { family: 'Karla', category: 'sans', weights: [400, 700], tags: 'editorial' },
  { family: 'Figtree', category: 'sans', weights: [400, 600, 800], tags: 'moderna' },
  { family: 'Plus Jakarta Sans', category: 'sans', weights: [400, 600, 800], tags: 'fintech' },
  { family: 'Exo 2', category: 'display', weights: [400, 600, 800], tags: 'futurista' },
  { family: 'Teko', category: 'display', weights: [400, 600, 700], tags: 'esporte,promo' },
  { family: 'Rajdhani', category: 'display', weights: [400, 600, 700], tags: 'tecnologia' },
  { family: 'Chakra Petch', category: 'display', weights: [400, 600, 700], tags: 'gamer,tech' },
  { family: 'Orbitron', category: 'display', weights: [400, 700, 900], tags: 'científico,lúdico' },
  { family: 'Abril Fatface', category: 'display', weights: [400], tags: 'revista,charme' },
  { family: 'Alfa Slab One', category: 'display', weights: [400], tags: 'retrô,peso' },
  { family: 'Righteous', category: 'display', weights: [400], tags: 'retrô,divertida' },
  { family: 'Caveat', category: 'script', weights: [400, 700], tags: 'manuscrita' },
  { family: 'Dancing Script', category: 'script', weights: [400, 700], tags: 'romântica' },
  { family: 'Great Vibes', category: 'script', weights: [400], tags: 'assinatura,elegante' },
  { family: 'Pacifico', category: 'script', weights: [400], tags: 'descontraída' },
  { family: 'Satisfy', category: 'script', weights: [400], tags: 'casual' },
  { family: 'JetBrains Mono', category: 'mono', weights: [400, 700], tags: 'código' },
  { family: 'Space Mono', category: 'mono', weights: [400, 700], tags: 'tech,retrô' },
  { family: 'IBM Plex Mono', category: 'mono', weights: [400, 600], tags: 'dados' },
];

/** URL do CSS2 (sem chave, sem conta). */
export function googleFontCssUrl(family: string, weights: number[] = [400, 700]) {
  const name = family.trim().replace(/\s+/g, '+');
  const wght = [...new Set(weights)].sort((a, b) => a - b).join(';');
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${wght}&display=swap`;
}

const loaded = new Set<string>();

/**
 * Garante a fonte no navegador. Idempotente e seguro no servidor (no-op).
 * Devolve uma promise que resolve quando o `document.fonts` já tem a fonte —
 * é o que evita o texto sair na fonte errada na primeira exportação.
 */
export async function ensureGoogleFont(family: string, weights: number[] = [400, 700]): Promise<boolean> {
  if (typeof document === 'undefined' || !family) return false;
  const key = `${family}|${weights.join(',')}`;
  if (!loaded.has(key)) {
    const selector = `link[data-gfont="${family.replace(/["\\]/g, '')}"]`;
    if (!document.querySelector(selector)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = googleFontCssUrl(family, weights);
      link.dataset.gfont = family;
      document.head.appendChild(link);
    }
    loaded.add(key);
  }
  try {
    await Promise.all(weights.map((weight) => document.fonts.load(`${weight} 64px "${family}"`)));
    return true;
  } catch {
    return false;
  }
}

/** Busca local no catálogo (instantânea, sem requisição). */
export function searchFonts(query: string, category?: FontCategory | 'all'): GoogleFont[] {
  const term = query.trim().toLowerCase();
  return GOOGLE_FONTS.filter((font) => {
    if (category && category !== 'all' && font.category !== category) return false;
    if (!term) return true;
    return font.family.toLowerCase().includes(term) || font.tags.includes(term) || font.category.includes(term);
  });
}
