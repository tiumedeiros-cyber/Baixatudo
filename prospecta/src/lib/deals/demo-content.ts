import { parsePhoneBR } from "@/lib/brazil/phone";
import type { Lead } from "@/lib/leads/types";
import { norm } from "@/lib/utils";
import type { DemoContent, DemoPalette, DemoService, DemoTemplate } from "./types";

/** Escolhe o modelo pelo nicho ou categoria do lead. A ordem importa: "clínica de estética" é estética. */
export function pickTemplate(niche: string | null, category: string | null): DemoTemplate {
  const text = norm(`${niche ?? ""} ${category ?? ""}`);
  if (/barbear|barber/.test(text)) return "barbearia";
  if (/estetic|beleza|depila|sobrancel|cilios|\bspa\b|manicure|nail|salao|cabeleir|massag|podolog|micropig|harmoniz|unha/.test(text)) {
    return "estetica";
  }
  if (/odont|dent|clinic|medic|fisio|psicolog|nutri|saude|ortodon|oftalm|dermat|veterin|pediatr/.test(text)) {
    return "clinica";
  }
  return "generico";
}

export function defaultPalette(template: DemoTemplate): DemoPalette {
  switch (template) {
    case "estetica":
      return "rose";
    case "barbearia":
      return "noir";
    case "clinica":
      return "ocean";
    default:
      return "sage";
  }
}

const SERVICES: Record<DemoTemplate, DemoService[]> = {
  estetica: [
    { name: "Limpeza de pele", description: "Cuidado completo para uma pele com aspecto mais saudável e luminoso." },
    { name: "Design de sobrancelhas", description: "Formato pensado para valorizar o seu olhar." },
    { name: "Depilação", description: "Conforto e acabamento delicado, do jeito que você gosta." },
    { name: "Massagem relaxante", description: "Um momento para desacelerar e aliviar a tensão do dia." },
    { name: "Drenagem linfática", description: "Sensação de leveza e bem-estar." },
    { name: "Cílios e olhar", description: "Realce natural, no seu estilo." },
  ],
  barbearia: [
    { name: "Corte clássico", description: "Tesoura e máquina, do jeito certo para o seu rosto." },
    { name: "Barba com toalha quente", description: "Acabamento preciso e a experiência de uma barbearia de verdade." },
    { name: "Degradê", description: "Transição limpa e bem definida." },
    { name: "Sobrancelha", description: "Alinhamento discreto, sem exagero." },
    { name: "Combo corte e barba", description: "O pacote completo em um só horário." },
  ],
  clinica: [
    { name: "Primeira consulta", description: "Conversa e avaliação para entender o que você precisa." },
    { name: "Acompanhamento", description: "Retornos para cuidar do seu resultado com continuidade." },
    { name: "Atendimento individual", description: "Tempo e atenção dedicados a cada paciente." },
    { name: "Agendamento simples", description: "Marque o seu horário direto pelo WhatsApp." },
  ],
  generico: [
    { name: "Atendimento personalizado", description: "Conversamos sobre o que você precisa antes de começar." },
    { name: "Orçamento sem compromisso", description: "Você sabe o valor antes de decidir." },
    { name: "Serviço sob medida", description: "Feito para o seu caso, não de prateleira." },
  ],
};

const CLOSER: Record<DemoTemplate, string> = {
  estetica: "Agende o seu horário e venha conhecer.",
  barbearia: "Chegue, sente e saia com o visual em dia.",
  clinica: "Agende uma conversa e tire as suas dúvidas.",
  generico: "Fale com a gente e peça o seu orçamento.",
};

const CATEGORY_FALLBACK: Record<DemoTemplate, string> = {
  estetica: "Estética e beleza",
  barbearia: "Barbearia",
  clinica: "Clínica",
  generico: "Negócio local",
};

const CTA_NOUN: Record<DemoTemplate, string> = {
  estetica: "horário",
  barbearia: "horário",
  clinica: "consulta",
  generico: "orçamento",
};

export function ctaLabel(template: DemoTemplate): string {
  return template === "generico" ? "Pedir orçamento" : `Agendar ${CTA_NOUN[template]}`;
}

/** Abaixo disso a nota não aparece na vitrine do negócio (a avaliação continua nos dados do painel). */
export const SHOWCASE_MIN_RATING = 4;

function ratingText(rating: number): string {
  return rating.toFixed(1).replace(".", ",");
}

/** Só aceita link de Instagram ou Facebook. Qualquer outro endereço (ou esquema) é descartado. */
export function safeSocialUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "instagram.com" && host !== "facebook.com") return null;
    return `https://${host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export interface DemoContext {
  brandName: string;
  senderName: string;
  /** Telefone do dono (qualquer formato brasileiro), usado no botão "Gostei, quero este site". */
  ownerPhone: string | null;
}

/**
 * Monta a foto do negócio para a prévia. Usa só o que o Google Maps mostra publicamente.
 * Os serviços são EXEMPLOS do ramo, e a página avisa isso: nada aqui é inventado como se fosse
 * dado do negócio.
 */
export function buildDemoContent(lead: Lead, ctx: DemoContext, template: DemoTemplate): DemoContent {
  const name = lead.name.trim();
  const place = [lead.neighborhood, lead.city].filter(Boolean).join(", ");
  const phone = parsePhoneBR(lead.phoneRaw);
  const owner = parsePhoneBR(ctx.ownerPhone);

  const about: string[] = [`A ${name} atende ${place ? `em ${place}` : "na sua região"}.`];
  // a vitrine só mostra a nota quando ela ajuda o negócio; o volume de avaliações pode aparecer mesmo assim
  const goodRating = lead.rating != null && lead.rating >= SHOWCASE_MIN_RATING;
  if (goodRating && lead.reviewsCount >= 5) {
    about.push(`Nota ${ratingText(lead.rating!)} no Google, com ${lead.reviewsCount} avaliações de clientes.`);
  } else if (goodRating) {
    about.push(`Nota ${ratingText(lead.rating!)} no Google.`);
  } else if (lead.reviewsCount >= 30) {
    about.push(`${lead.reviewsCount} avaliações de clientes no Google.`);
  }
  about.push(CLOSER[template]);

  const whatsappDigits = phone.isMobile && phone.e164 ? phone.e164.replace(/\D/g, "") : null;
  const highlights: string[] = [];
  if (goodRating) highlights.push(`Nota ${ratingText(lead.rating!)} no Google`);
  if (lead.reviewsCount >= 10) highlights.push(`${lead.reviewsCount} avaliações`);
  if (place) highlights.push(`Em ${place}`);
  if (whatsappDigits) highlights.push("Atendimento pelo WhatsApp");

  return {
    businessName: name,
    category: lead.category?.trim() || CATEGORY_FALLBACK[template],
    tagline: lead.neighborhood ? `${CATEGORY_FALLBACK[template]} em ${lead.neighborhood}` : CATEGORY_FALLBACK[template],
    about: about.join(" "),
    services: SERVICES[template].map((s) => ({ ...s })),
    highlights: highlights.slice(0, 4),
    city: lead.city,
    neighborhood: lead.neighborhood,
    address: lead.address,
    phoneDisplay: phone.display ?? lead.phoneRaw,
    whatsappDigits,
    instagramUrl: lead.websiteKind === "social" ? safeSocialUrl(lead.websiteRaw) : null,
    rating: lead.rating,
    reviewsCount: lead.reviewsCount,
    madeBy: { brand: ctx.brandName, sender: ctx.senderName },
    ownerWhatsappDigits: owner.e164 ? owner.e164.replace(/\D/g, "") : null,
  };
}

/** Link do WhatsApp com mensagem pronta; só dígitos no número, texto codificado. */
export function whatsappHref(digits: string, text?: string): string {
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
