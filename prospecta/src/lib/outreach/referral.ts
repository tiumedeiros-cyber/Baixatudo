import type { Decisor } from "@/lib/agent/decisor";
import type { Lead } from "@/lib/leads/types";
import type { Repo } from "@/lib/repo/types";
import { adaptGreeting } from "./greeting";
import { localParts } from "./guardrails";
import { phoneVariants } from "./provider";
import { addressee, openingGroup, shortName } from "./templates";
import type { Conversation } from "./types";

/**
 * A recepção passou o contato de quem decide ("fala com a Dra. Joyce, (85) 99999-0000"). O que vale é falar com essa pessoa: o motor cria
 * um lead novo ligado ao original (mesmo negócio, mesmo número do WhatsApp) e deixa a abertura como RASCUNHO na Fila. Nada sai sem o
 * dono aprovar: é um primeiro contato com alguém novo. Quem já está na base, quem pediu para não receber e o mesmo número da
 * conversa não geram nada.
 */

export type ReferralResult = { created: true; leadId: string; conversationId: string; body: string } | { created: false; reason: string };

/** A abertura para quem decide: curta, cita quem indicou e termina em uma pergunta fácil. "Bom dia" vira "Boa tarde" no envio. */
export function referralOpening(opts: { senderName: string; business: string; decisor: Pick<Decisor, "viaName">; addressee: string | null }): string {
  const who = opts.decisor.viaName ? `${opts.decisor.viaName}, da ${opts.business},` : `O pessoal da ${opts.business}`;
  return `Bom dia${opts.addressee ? `, ${opts.addressee}` : ""}! Aqui é o ${opts.senderName}. ${who} me passou o seu contato. Posso te fazer uma pergunta rápida?`;
}

export async function referDecisor(
  repo: Repo,
  p: { conv: Conversation; lead: Lead; decisor: Decisor; now: Date },
): Promise<ReferralResult> {
  const { conv, lead, decisor, now } = p;
  const phone = decisor.phone;
  if (!phone) return { created: false, reason: "sem celular" };

  const variants = phoneVariants(phone);
  const sameAsConversation = new Set(phoneVariants(conv.phoneE164));
  if (variants.some((v) => sameAsConversation.has(v))) return { created: false, reason: "é o mesmo número da conversa" };

  const key = `indicacao:${variants[0]}`;
  const existing = await repo.findExisting({ dedupeKeys: [key], phones: variants });
  if (existing.dedupeKeys.size > 0 || existing.phones.size > 0) return { created: false, reason: "esse número já está na base" };
  if ((await repo.findOptouts(variants)).size > 0) return { created: false, reason: "esse número pediu para não receber" };

  const settings = await repo.getSettings();
  const business = shortName(lead.name);
  const name = `${decisor.name ?? "Responsável"} - ${business}`;
  const via = decisor.via ?? "a recepção";
  const [created] = await repo.insertLeads([
    {
      dedupeKey: key,
      placeId: null,
      name,
      category: lead.category,
      niche: lead.niche,
      city: lead.city,
      state: lead.state,
      address: lead.address,
      neighborhood: lead.neighborhood,
      phoneRaw: decisor.phoneDisplay ?? phone,
      phoneE164: phone,
      isMobile: true,
      whatsappStatus: "unknown",
      websiteRaw: lead.websiteRaw,
      websiteKind: lead.websiteKind,
      websiteSignals: lead.websiteSignals,
      siteCheckedAt: lead.siteCheckedAt,
      rating: lead.rating,
      reviewsCount: lead.reviewsCount,
      mapsUrl: lead.mapsUrl,
      lat: lead.lat,
      lng: lead.lng,
      permanentlyClosed: false,
      score: lead.score,
      scoreBreakdown: lead.scoreBreakdown,
      eligible: true,
      ineligibleReason: null,
      stage: "qualificado",
      notes: `Indicado por ${via}, de ${lead.name}${decisor.when ? ` (melhor horário: ${decisor.when})` : ""}.`,
      dealValue: null,
      source: "manual",
      searchId: null,
    },
  ]);

  const referred = await repo.ensureConversation(created.id, phone, conv.accountId);
  const body = adaptGreeting(referralOpening({ senderName: settings.senderName, business, decisor, addressee: addressee(name) }), now, settings.automation.timezone);
  const day = localParts(now, settings.automation.timezone).ymd;
  await repo.createMessages([
    {
      conversationId: referred.id,
      leadId: created.id,
      direction: "out",
      kind: "opening",
      step: 0,
      body,
      // "-c-" é a marca da abertura curta: quando ele responder, o agente segue o mesmo roteiro (apresentação, dor, solução)
      variant: `abertura-${openingGroup(lead.websiteKind)}-c-indicacao`,
      status: "draft",
      createdBy: "system",
      batchDay: day,
    },
  ]);
  await repo.addEvents([
    { leadId: lead.id, type: "automacao", payload: { text: `${via} passou o contato de ${decisor.name ?? "quem decide"} (${decisor.phoneDisplay ?? phone}): criei o lead e deixei a abertura como rascunho na Fila para você aprovar` } },
    { leadId: created.id, type: "automacao", payload: { text: `lead criado por indicação de ${via}, de ${lead.name}. A abertura está como rascunho na Fila` } },
  ]);
  return { created: true, leadId: created.id, conversationId: referred.id, body };
}
