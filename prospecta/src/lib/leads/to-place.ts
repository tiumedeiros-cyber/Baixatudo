/** Item bruto vindo do Apify (Google Maps Scraper) ou de um JSON importado. */
export type RawPlace = Record<string, unknown>;

export interface PlaceDraft {
  placeId: string | null;
  name: string;
  category: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  phoneRaw: string | null;
  websiteRaw: string | null;
  rating: number | null;
  reviewsCount: number;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  permanentlyClosed: boolean;
  hasPresence: boolean;
}

function str(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function first(...values: unknown[]): string | null {
  for (const v of values) {
    const s = str(v);
    if (s) return s;
  }
  return null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Converte um item do Maps em rascunho padronizado. Aceita os nomes de campo do
 * Apify (`title`, `totalScore`, `reviewsCount`, `categoryName`, `url`…) e variações
 * comuns de planilhas em português. Devolve null se não houver nome.
 */
export function toPlaceDraft(raw: RawPlace): PlaceDraft | null {
  const name = first(raw.title, raw.name, raw.nome, raw.businessName);
  if (!name) return null;

  const location = obj(raw.location);
  const categories = Array.isArray(raw.categories) ? raw.categories : [];

  const ratingRaw = num(raw.totalScore ?? raw.rating ?? raw.nota);
  const rating = ratingRaw != null && ratingRaw >= 0 && ratingRaw <= 5 ? ratingRaw : null;
  const reviewsRaw = num(raw.reviewsCount ?? raw.reviews ?? raw.avaliacoes);
  const reviewsCount = reviewsRaw != null && reviewsRaw > 0 ? Math.round(reviewsRaw) : 0;

  const images = num(raw.imagesCount) ?? 0;
  const hours = Array.isArray(raw.openingHours) && raw.openingHours.length > 0;

  return {
    placeId: first(raw.placeId, raw.place_id, raw.cid, raw.fid),
    name,
    category: first(raw.categoryName, categories[0], raw.category, raw.categoria),
    address: first(raw.address, raw.street, raw.endereco),
    neighborhood: first(raw.neighborhood, raw.bairro),
    city: first(raw.city, raw.cidade),
    state: first(raw.state, raw.estado, raw.uf),
    phoneRaw: first(raw.phone, raw.phoneUnformatted, raw.telefone, raw.whatsapp, raw.celular),
    websiteRaw: first(raw.website, raw.site, raw.websiteUrl),
    rating,
    reviewsCount,
    mapsUrl: first(raw.url, raw.mapsUrl, raw.googleMapsUrl),
    lat: num(location?.lat ?? raw.latitude ?? raw.lat),
    lng: num(location?.lng ?? raw.longitude ?? raw.lng),
    permanentlyClosed: raw.permanentlyClosed === true,
    hasPresence: images >= 5 || hours,
  };
}
