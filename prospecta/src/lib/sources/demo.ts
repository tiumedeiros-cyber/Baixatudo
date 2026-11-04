import { norm } from "@/lib/utils";
import type { RawPlace } from "@/lib/leads/to-place";

/** PRNG pequeno e determinístico: a mesma busca gera sempre os mesmos leads fictícios. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PREFIX = ["Studio", "Espaço", "Instituto", "Atelier", "Casa", "Clínica", "Centro", "Núcleo"];
const WORD = ["Aurora", "Vitta", "Bela", "Essência", "Prime", "Lumina", "Serena", "Nobre", "Alma", "Vértice", "Ouro", "Maré"];
const FORTALEZA = ["Aldeota", "Meireles", "Cocó", "Papicu", "Varjota", "Fátima", "Benfica", "Centro", "Messejana", "Parquelândia", "Dionísio Torres"];
const GENERIC = ["Centro", "Jardim América", "Bela Vista", "São José", "Vila Nova", "Santa Luzia"];

function slug(text: string) {
  return norm(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Leads FICTÍCIOS para demonstrar o painel sem token do Apify.
 * Nomes levam "(demo)", celulares começam com "90" depois do 9 (segundo dígito 0 não
 * existe na numeração real) e o `placeId` começa com "demo-". Nunca use para abordar ninguém.
 */
export function makeDemoPlaces(params: { niche: string; city: string; limit: number }): RawPlace[] {
  const { niche, city, limit } = params;
  const rand = mulberry32(hash(`${norm(niche)}|${norm(city)}`));
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const hoods = norm(city) === "fortaleza" ? FORTALEZA : GENERIC;

  // 3 dígitos por busca: números de buscas diferentes não colidem na deduplicação.
  const tag = String((hash(`${norm(niche)}|${norm(city)}`) % 900) + 100);

  const out: RawPlace[] = [];
  for (let i = 1; i <= limit; i++) {
    const r = rand();
    // ~45% sem site, 20% só Instagram, 15% construtor gratuito, 20% site próprio
    const website =
      r < 0.45
        ? null
        : r < 0.65
          ? `https://instagram.com/demo_${slug(niche)}_${i}`
          : r < 0.8
            ? `https://demo${i}.wixsite.com/site`
            : `https://demo-${slug(niche)}-${i}.example.com.br`;

    const p = rand();
    const n = String(i).padStart(4, "0");
    const phone = p < 0.05 ? null : p < 0.17 ? `(85) 3${tag}-${n}` : `(85) 90${tag}-${n}`;

    const rating = Math.round((3.4 + rand() * 1.6) * 10) / 10;
    const reviews = Math.floor(Math.pow(rand(), 2.2) * 260);
    const hood = pick(hoods);
    out.push({
      title: `${pick(PREFIX)} ${pick(WORD)} ${niche} (demo)`,
      categoryName: niche,
      address: `Rua Demonstração ${100 + i}, ${hood}, ${city}`,
      neighborhood: hood,
      city,
      state: "Ceará",
      phone,
      website,
      totalScore: rating,
      reviewsCount: reviews,
      url: null,
      placeId: `demo-${slug(city)}-${slug(niche)}-${i}`,
      imagesCount: Math.floor(rand() * 20),
      openingHours: rand() > 0.3 ? [{ day: "Segunda", hours: "9h às 18h" }] : [],
      permanentlyClosed: rand() < 0.03,
    });
  }
  return out;
}
