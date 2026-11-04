import type { DiscoveryId, Topic } from "./types";

/**
 * Marca na mensagem quem a escreveu e sobre o quê, no campo `variant` que já existe (sem coluna nova):
 * "agente:price" (regras), "agente-ia:price" (IA) e "agente:q-objetivo" para a pergunta de descoberta.
 * A ficha usa isso para saber o que já foi perguntado e não repetir.
 */
export function agentVariant(
  out: { source: "rules" | "ai"; topic: Topic | string; asked: DiscoveryId | string | null },
  auto = false,
): string {
  return `${out.source === "ai" ? "agente-ia" : "agente"}${auto ? "+auto" : ""}:${out.asked ? `q-${out.asked}` : out.topic}`;
}

/**
 * A resposta em que o agente se apresenta depois da abertura curta (variante "agente:q-apresentacao"). Não é uma pergunta do
 * roteiro (`askedQuestion` não a conhece): só marca que a apresentação já saiu, para não se apresentar duas vezes.
 */
export const INTRO_TOPIC = "apresentacao";

/**
 * A mensagem diz quem está falando ("Sou o Jonathan", "Aqui é o Jonathan", "Meu nome é Jonathan", "Prazer, sou o Jonathan")? A
 * variante só marca a apresentação das regras; a IA e o dono também se apresentam, com outras palavras, e o lead não pode ouvir
 * "sou o Jonathan" duas vezes. Sem nome, vale qualquer "sou o/a Fulano" (nome começando em maiúscula).
 */
export function introducesSelf(body: string, name?: string): boolean {
  const who = name?.trim() ? name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "\\p{Lu}\\p{L}{2,}";
  const flags = name?.trim() ? "iu" : "u";
  return new RegExp(String.raw`(?:\b[Ss]ou|\b[Aa]qui [ée]|\b[Ee]u sou|\b[Mm]eu nome [ée]|\b[Pp]razer,? (?:sou )?)\s+(?:o |a )?${who}\b`, flags).test(body);
}

/** Alguma mensagem nossa, depois da abertura, já se apresentou nesta conversa (saiu ou está na fila)? */
export function alreadyIntroduced(
  messages: { direction: string; kind: string; status: string; variant: string | null; body: string }[],
  name?: string,
): boolean {
  return messages.some(
    (m) =>
      m.direction === "out" &&
      m.kind !== "opening" &&
      m.status !== "cancelled" &&
      m.status !== "failed" &&
      (["apresentacao", "no_need_site"].includes(parseAgentVariant(m.variant)?.topic ?? "") || introducesSelf(m.body, name)),
  );
}

/** Marca a mensagem do dono que entregou a prévia que o lead pediu (fluxo "qualificar"): o agente continua depois dela. */
export const OWNER_PREVIEW_VARIANT = "previa-enviada";

const PARSE = /^(agente|agente-ia)(\+auto)?:(q-)?([a-z_]+)$/;

export interface ParsedAgentVariant {
  /** A mensagem saiu sozinha, sem o dono aprovar (nível 3). */
  auto: boolean;
  source: "rules" | "ai";
  /** Quando é uma pergunta de descoberta, o assunto é a pergunta (ex.: "objetivo"). */
  topic: string;
  question: boolean;
}

export function parseAgentVariant(variant: string | null | undefined): ParsedAgentVariant | null {
  const m = PARSE.exec(variant ?? "");
  return m ? { source: m[1] === "agente-ia" ? "ai" : "rules", auto: !!m[2], topic: m[4], question: !!m[3] } : null;
}

const QUESTIONS: readonly DiscoveryId[] = ["objetivo", "tipo", "escopo", "material", "dor", "usuarios", "integracoes", "prazo"];

/** A pergunta de descoberta feita por esta mensagem, se for uma. */
export function askedQuestion(variant: string | null | undefined): DiscoveryId | null {
  const p = parseAgentVariant(variant);
  if (!p?.question) return null;
  return QUESTIONS.find((q) => q === p.topic) ?? null;
}
