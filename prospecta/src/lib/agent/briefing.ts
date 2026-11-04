import { entryCents, formatCents } from "@/lib/deals/money";
import type { Proposal } from "@/lib/deals/types";
import type { Lead, WebsiteKind } from "@/lib/leads/types";
import type { Message } from "@/lib/outreach/types";
import { parsePhoneBR } from "@/lib/brazil/phone";
import { ANSWER_LABEL, DISCOVERY_PLAN } from "./discovery";
import { buildFicha } from "./ficha";
import type { DiscoveryId } from "./types";
import { parseAgentVariant } from "./variant";

/**
 * O briefing que o projeto já nasce com quando o dono marca o sinal: o que o lead quer, o que respondeu ao agente, o que
 * foi vendido e as últimas mensagens da conversa. Texto simples (vai num campo de texto que o dono edita). É um ponto de
 * partida: tudo vem do que o lead escreveu, então fica marcado como "confira e complete com o cliente".
 */

const MAX_TRANSCRIPT = 14;
const MAX_LINE = 220;

const SITE_LABEL: Record<WebsiteKind, string> = {
  none: "não tem site",
  social: "só rede social, sem site",
  weak: "tem site fraco",
  real: "tem site",
};

const MEDIA_LABEL: Record<string, string> = {
  audio: "áudio",
  image: "imagem",
  video: "vídeo",
  document: "arquivo",
  sticker: "figurinha",
  contact: "contato",
  location: "localização",
};

export interface BriefingInput {
  lead: Lead;
  proposal: Pick<Proposal, "title" | "amountCents" | "entryPct" | "deliveryDays">;
  /** A conversa em ordem cronológica (pode incluir rascunhos e canceladas: são ignorados). */
  messages: Message[];
  /** Data de entrega combinada (AAAA-MM-DD), se já calculada. */
  dueDate: string | null;
  /** Quando o briefing foi montado. */
  now: Date;
}

const ddmm = (ymd: string) => ymd.split("-").reverse().join("/");

function clip(text: string, max = MAX_LINE): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** "(audio)" vira "(áudio)"; o resto da mensagem fica como está. */
function readable(body: string): string {
  const media = /^\((\w+)\)$/.exec(body.trim());
  return media ? `(${MEDIA_LABEL[media[1]] ?? media[1]})` : clip(body);
}

export function buildBriefing(input: BriefingInput): string {
  const { lead, proposal, dueDate } = input;
  const real = input.messages.filter((m) => !["draft", "cancelled", "failed"].includes(m.status));
  // a ficha com o fluxo "qualificar" sabe dizer o que ele quer (site ou sistema) e guarda as respostas dele
  const ficha = buildFicha({ lead, conversation: null, messages: real, demos: [], proposals: [], flow: "qualificar" });

  const phone = parsePhoneBR(lead.phoneRaw).display ?? lead.phoneRaw;
  const place = [lead.neighborhood, lead.city].filter(Boolean).join(", ");
  const google = lead.rating != null ? `nota ${lead.rating.toFixed(1).replace(".", ",")} no Google${lead.reviewsCount ? ` (${lead.reviewsCount} avaliações)` : ""}` : null;

  const lines: string[] = [
    `BRIEFING AUTOMÁTICO (montado do atendimento em ${ddmm(input.now.toISOString().slice(0, 10))}). Confira e complete com o cliente.`,
    "",
    "CLIENTE",
    [lead.name, place || null, phone || null].filter(Boolean).join(" · "),
    [lead.category ?? lead.niche, google].filter(Boolean).join(" · ") || "Ramo não informado",
    `Hoje: ${SITE_LABEL[lead.websiteKind]}${lead.websiteRaw ? ` (${clip(lead.websiteRaw, 120)})` : ""}`,
  ];
  if (lead.address) lines.push(`Endereço: ${clip(lead.address, 160)}`);

  lines.push("", "O QUE ELE QUER");
  lines.push(
    ficha.product === "sistema"
      ? "Quer um SISTEMA (não só um site): o escopo depende do que ele descreveu abaixo."
      : ficha.product === "automacao"
        ? "Quer uma AUTOMAÇÃO (robô, atendimento automático...): o escopo depende do que ele descreveu abaixo."
        : ficha.product === "site"
          ? "Quer um SITE (landing page ou site da empresa)."
          : "O atendimento não deixou claro se é site ou sistema: confirme com ele.",
  );
  // as respostas dele, na ordem do roteiro de perguntas
  const order: DiscoveryId[] = ["tipo", ...(ficha.product ? DISCOVERY_PLAN[ficha.product] : (["objetivo", "escopo"] as DiscoveryId[]))];
  for (const id of order) {
    const answer = ficha.answers[id];
    if (answer) lines.push(`${ANSWER_LABEL[id]}, nas palavras dele: “${clip(answer)}”`);
  }
  // o sistema só sabe que você mandou a prévia quando foi por um link; sem ele, pede para conferir em vez de afirmar
  if (ficha.previewAsked) lines.push(ficha.previewSentByOwner ? "Pediu prévia: você já mandou." : "Pediu prévia na conversa: confira se já foi enviada.");

  const entry = entryCents(proposal);
  lines.push(
    "",
    "VENDA",
    `${proposal.title} · ${formatCents(proposal.amountCents)} · sinal de ${proposal.entryPct}% (${formatCents(entry)}) · entrega em até ${proposal.deliveryDays} dias${dueDate ? ` (até ${ddmm(dueDate)})` : ""}`,
  );

  const talk = real.filter((m) => m.kind !== "opening" || m.direction === "in").slice(-MAX_TRANSCRIPT);
  if (talk.length > 0) {
    lines.push("", talk.length === 1 ? "CONVERSA (a única mensagem)" : `CONVERSA (últimas ${talk.length} mensagens)`);
    for (const m of talk) {
      const who = m.direction === "in" ? "Ele" : parseAgentVariant(m.variant)?.auto ? "Agente" : "Você";
      lines.push(`${who}: ${readable(m.body)}`);
    }
  }

  lines.push(
    "",
    "AINDA FALTA PEDIR AO CLIENTE",
    "- logo e cores da marca",
    "- fotos (equipe, espaço, trabalhos)",
    "- textos e lista dos serviços, com preços se quiser mostrar",
    "- endereço, horário e links (Instagram, WhatsApp, Google)",
    "- domínio, se ele já tem um",
  );

  return lines.join("\n").slice(0, 7500);
}
