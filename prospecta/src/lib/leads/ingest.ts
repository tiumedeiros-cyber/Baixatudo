import { parsePhoneBR } from "@/lib/brazil/phone";
import { norm } from "@/lib/utils";
import type { Repo } from "@/lib/repo/types";
import { scoreLead, type ScoreResult } from "./score";
import { classifyWebsite } from "./site";
import { toPlaceDraft, type PlaceDraft, type RawPlace } from "./to-place";
import type { IneligibleReason, Lead, LeadSource, NewLead, Settings } from "./types";

export interface BuildContext {
  niche: string | null;
  city: string | null;
  searchId: string | null;
  source: LeadSource;
  settings: Settings;
  /** Telefones (E.164) de quem pediu para não receber mensagens. */
  optouts: Set<string>;
}

/** Chave estável para não repetir o mesmo negócio em buscas diferentes. */
export function dedupeKeyFor(draft: PlaceDraft, phoneE164: string | null): string {
  if (draft.placeId) return `p:${draft.placeId}`;
  return `n:${norm(draft.name)}|${phoneE164 ?? norm(draft.city)}`;
}

/** Nota zerada, com o motivo explicado, para leads que não podem ser abordados de jeito nenhum. */
export function deadScore(reason: IneligibleReason | null): ScoreResult | null {
  if (reason !== "fechado" && reason !== "optout") return null;
  return {
    score: 0,
    items: [
      {
        key: "situacao",
        label: "Situação",
        points: 0,
        max: 100,
        detail:
          reason === "fechado"
            ? "Negócio fechado definitivamente no Google Maps"
            : "Pediu para não receber mensagens",
      },
    ],
  };
}

export function buildLead(draft: PlaceDraft, ctx: BuildContext): NewLead {
  const phone = parsePhoneBR(draft.phoneRaw);
  const web = classifyWebsite(draft.websiteRaw);

  const optout = !!phone.e164 && ctx.optouts.has(phone.e164);
  const ineligibleReason: IneligibleReason | null = draft.permanentlyClosed
    ? "fechado"
    : optout
      ? "optout"
      : !phone.isMobile
        ? "sem_celular"
        : null;

  const scored = scoreLead(
    {
      websiteKind: web.kind,
      rating: draft.rating,
      reviewsCount: draft.reviewsCount,
      isMobile: phone.isMobile,
      hasPhone: !!phone.e164,
      niche: ctx.niche,
      category: draft.category,
      hasPresence: draft.hasPresence,
    },
    { highTicketTerms: ctx.settings.highTicketTerms },
  );
  // Negócio fechado ou número bloqueado nunca vira prioridade, por melhor que seja o perfil.
  const { score, items } = deadScore(ineligibleReason) ?? scored;

  return {
    dedupeKey: dedupeKeyFor(draft, phone.e164),
    placeId: draft.placeId,
    name: draft.name,
    category: draft.category,
    niche: ctx.niche,
    city: draft.city ?? ctx.city,
    state: draft.state,
    address: draft.address,
    neighborhood: draft.neighborhood,
    phoneRaw: draft.phoneRaw,
    phoneE164: phone.e164,
    isMobile: phone.isMobile,
    whatsappStatus: "unknown",
    websiteRaw: draft.websiteRaw,
    websiteKind: web.kind,
    websiteSignals: web.kind === "weak" ? ["construtor_gratuito"] : [],
    siteCheckedAt: null,
    rating: draft.rating,
    reviewsCount: draft.reviewsCount,
    mapsUrl: draft.mapsUrl,
    lat: draft.lat,
    lng: draft.lng,
    permanentlyClosed: draft.permanentlyClosed,
    score,
    scoreBreakdown: items,
    eligible: ineligibleReason === null,
    ineligibleReason,
    stage: "novo",
    notes: "",
    dealValue: null,
    source: ctx.source,
    searchId: ctx.searchId,
  };
}

export interface IngestOptions {
  niche: string | null;
  city: string | null;
  searchId: string | null;
  source: LeadSource;
}

export interface IngestResult {
  received: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  eligible: number;
  leads: Lead[];
}

/**
 * Pipeline único de entrada de leads (Apify, JSON importado, demonstração):
 * normaliza, remove repetidos (no lote e na base), pontua, marca elegibilidade e grava.
 */
export async function ingestPlaces(
  repo: Repo,
  raws: RawPlace[],
  opts: IngestOptions,
): Promise<IngestResult> {
  const settings = await repo.getSettings();

  let invalid = 0;
  const batch: { draft: PlaceDraft; key: string; phone: string | null }[] = [];
  const seenKeys = new Set<string>();
  const seenPhones = new Set<string>();
  let duplicates = 0;

  for (const raw of raws) {
    const draft = toPlaceDraft(raw);
    if (!draft) {
      invalid++;
      continue;
    }
    const phone = parsePhoneBR(draft.phoneRaw).e164;
    const key = dedupeKeyFor(draft, phone);
    if (seenKeys.has(key) || (phone && seenPhones.has(phone))) {
      duplicates++;
      continue;
    }
    seenKeys.add(key);
    if (phone) seenPhones.add(phone);
    batch.push({ draft, key, phone });
  }

  const existing = await repo.findExisting({ dedupeKeys: [...seenKeys], phones: [...seenPhones] });
  const fresh = batch.filter(
    (b) => !existing.dedupeKeys.has(b.key) && !(b.phone && existing.phones.has(b.phone)),
  );
  duplicates += batch.length - fresh.length;

  const optouts = await repo.findOptouts(fresh.map((f) => f.phone).filter((p): p is string => !!p));
  const ctx: BuildContext = { ...opts, settings, optouts };
  const newLeads = fresh.map((f) => buildLead(f.draft, ctx));

  const inserted = newLeads.length > 0 ? await repo.insertLeads(newLeads) : [];
  if (inserted.length > 0) {
    await repo.addEvents(
      inserted.map((lead) => ({
        leadId: lead.id,
        type: "lead_criado" as const,
        payload: { name: lead.name, score: lead.score, source: opts.source, searchId: opts.searchId },
      })),
    );
  }

  return {
    received: raws.length,
    invalid,
    duplicates,
    inserted: inserted.length,
    eligible: inserted.filter((l) => l.eligible).length,
    leads: inserted,
  };
}
