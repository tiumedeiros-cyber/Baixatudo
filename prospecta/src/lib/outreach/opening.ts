import { z } from "zod";
import { guardReply } from "@/lib/agent/guard";
import { MAX_WARNINGS, checkMessage, humanizeText } from "@/lib/agent/humanize";
import { stripJsonFence, type LlmClient } from "@/lib/agent/llm";
import type { AgentFacts } from "@/lib/agent/types";
import { norm } from "@/lib/utils";
import { MAX_PARTS } from "./parts";
import { styleCode, type OpeningStyle } from "./style";
import {
  addressee,
  angleFor,
  assembleOpening,
  buildOpening,
  callName,
  GENERIC_WORDS,
  fullName,
  isCasual,
  isFormal,
  roleFor,
  openingGroup,
  pickMixed,
  positioning,
  proofRating,
  roleOf,
  shortAngleFor,
  shortName,
  type Angle,
  type OpeningGroup,
  type OpeningText,
  type TemplateContext,
  type TemplateLead,
} from "./templates";

/**
 * A primeira abordagem escrita pelo agente. Para cada lead ele escolhe um ÂNGULO do banco (`templates.ts`), recebe só os
 * dados públicos do negócio (nome, ramo, bairro, cidade, nota, situação na internet) e escreve de 1 a 3 mensagens curtas
 * nesta ordem: quem sou (como pessoa, sem a marca), o elogio com dado real e a dor, e a solução com UMA pergunta. Fala COM a
 * pessoa ("Dra. Heloisa, …"), nunca sobre ela. O texto só vale se passar nas travas abaixo; qualquer falha (sem IA, erro,
 * texto reprovado) cai no modelo do mesmo ângulo, que já nasce em partes. Telefone e chave Pix nunca vão para a IA.
 * A abertura não leva a linha "responda PARE" (decisão do dono em 29/10): se a IA a escrever, o sistema a tira.
 */

export const OPENING_AI_TIMEOUT_MS = 20_000;
/** Cada mensagem curta de verdade; o limite do conjunto (com a saída) vem do humanizador. */
export const MAX_PART_CHARS = 150;
const MAX_TOTAL_CHARS = 375;

export interface WrittenOpening extends OpeningText {
  source: "ia" | "modelo";
  /** Por que a IA não valeu, quando devia valer. Nulo se tudo certo ou se a IA estava desligada. */
  note: string | null;
}

export interface OpeningDeps {
  llm?: LlmClient | null;
  facts: AgentFacts;
  timeoutMs?: number;
}

// ───────────────────────── o pedido à IA ─────────────────────────

const TONES = ["direto e objetivo", "simpático e descontraído", "curioso, de quem acabou de descobrir o negócio"];
const GREETINGS = ["Oi", "Olá"];

const SITE_STATE: Record<OpeningGroup, string> = {
  none: "não tem site",
  social: "só tem Instagram, sem site",
  weak: "tem um site, mas ele é fraco",
};

export function openingSystemPrompt(ctx: TemplateContext): string {
  const full = fullName(ctx);
  return [
    `Você escreve a PRIMEIRA mensagem de WhatsApp de ${full}, ${roleFor(ctx)}, para quem cuida de um negócio local que ele ainda não conhece. ${ctx.senderName} cria sites e sistemas que ajudam negócios a serem encontrados e escolhidos na internet. A mensagem precisa soar como uma pessoa escrevendo no celular, não como propaganda.`,
    "",
    "Estrutura, em 2 ou 3 mensagens curtas, nesta ordem:",
    ctx.style
      ? "1. Cumprimento, tratamento direto e quem você é, como pessoa, exatamente como no exemplo dos dados (inclusive a forma de dizer o que você faz). Não cite nome de empresa ou marca sua."
      : `1. Cumprimento, tratamento direto e quem você é, como pessoa. Ex.: “Oi, Dra. Heloisa! Sou o ${full}, ${roleOf(ctx)}.” Não cite nome de empresa ou marca sua.`,
    "2. Elogio e dor. Elogie algo REAL que está nos dados (a nota, estar bem avaliado no Google) e mostre a dor da situação dele: sem site, quem o encontra no Google não tem onde conhecer os serviços e agendar; só Instagram, quem pesquisa no Google não acha um site; site fraco, dá para ele atrair mais clientes. Se os dados não mostram nada para elogiar, não elogie: comece pelo que você viu.",
    "3. Solução e pergunta. Diga que você cria o site que resolve isso e termine com UMA pergunta fácil de responder com “sim” ou “pode”, natural em português (como “Posso te explicar como funciona?” ou “Vale uma conversa rápida?”). Só uma interrogação em tudo, na última mensagem.",
    "",
    "Regras:",
    `- Cada mensagem tem no máximo ${MAX_PART_CHARS - 30} caracteres. O conjunto fica curto.`,
    "- Fale COM a pessoa (você, seu, sua) e nunca sobre ela em terceira pessoa. Errado: “Achei a Dra. Heloisa no Google.” Certo: “Vi seu perfil no Google.” Siga o tratamento indicado nos dados e não invente o nome de ninguém.",
    "- Como tratar quem lê, pelo nome do negócio: “Dra. Heloisa Lima - Estética Avançada” vira “Oi, Dra. Heloisa!”; “Rafael Neves - ADVOCACIA” vira “Oi, Rafael!” e “Larissa Mendes Estética e Beleza” vira “Oi, Larissa!” (o nome do negócio é o nome da pessoa); “Espaço Prime Estética” não tem nome de gente: “Oi!” e fale “você” ou “vocês”.",
    "- Não diga “tudo bem?”. Nada de “venho por meio”, “gostaria de”, “solução”, “potencializar”.",
    "- Cite UM dado real dele quando houver. Não invente nada além dos dados e não prometa resultado, número de clientes nem posição no Google.",
    "- Não fale de prévia, preço, prazo, desconto, grátis, garantia, contrato nem link. Sem emoji, hífen, travessão, lista ou negrito.",
    "- Não escreva a linha “para parar de receber, responda PARE” nem nada parecido: a abertura é só conversa.",
    "- Português do Brasil, informal e educado, no máximo uma exclamação.",
    "",
    'Responda SOMENTE com JSON, neste formato: {"messages": ["primeira mensagem", "segunda mensagem", "terceira mensagem"]}',
  ].join("\n");
}

const POSITIONING_TEXT = {
  forte: (r: string) => `forte (nota ${r} no Google, muito bem avaliado): vale um elogio claro`,
  bom: (r: string) => `bom (nota ${r} no Google): vale elogiar a nota`,
  discreto: () => "discreto (nada de nota para elogiar): não elogie nota nem avaliações",
};

export function openingUserPrompt(lead: TemplateLead, ctx: TemplateContext, angle: Angle, retryReasons: string[] = []): string {
  const group = openingGroup(lead.websiteKind);
  const rating = proofRating(lead);
  const pos = positioning(lead);
  const ramo = (lead.niche ?? lead.category ?? "").trim();
  const addr = addressee(lead.name);
  const formal = isFormal(lead);
  const greeting = formal ? "Olá" : GREETINGS[pickMixed(`${lead.id}:oi`, GREETINGS.length)];
  const example = angle.build(lead, ctx, shortName(lead.name)).join("\n");
  const lines = [
    "Dados do negócio:",
    `- Nome: ${shortName(lead.name)}`,
    ramo ? `- Ramo: ${ramo}` : null,
    lead.neighborhood ? `- Bairro: ${lead.neighborhood}` : null,
    lead.city ? `- Cidade: ${lead.city}` : null,
    `- Posicionamento no Google: ${rating ? POSITIONING_TEXT[pos === "forte" ? "forte" : "bom"](rating) : POSITIONING_TEXT.discreto()}${rating ? ". Pode citar a nota; não cite número de avaliações" : ""}`,
    `- Situação na internet: ${SITE_STATE[group]}`,
    addr
      ? `- Tratamento: chame de “${addr}” logo no cumprimento (ex.: “${greeting}, ${addr}!”) e fale com ela em segunda pessoa o tempo todo`
      : "- Tratamento: o nome não traz título. Se ele deixar CLARO que é uma pessoa (ex.: “Larissa Mendes Estética”), chame pelo primeiro nome no cumprimento; senão fale “você” ou “vocês” e cite o negócio pelo nome, sem inventar nome de gente",
    formal
      ? "- Registro: profissão de regras próprias de publicidade (advocacia ou contabilidade). Abra com “Olá”, seja sóbrio e respeitoso, sem gíria e sem brincadeira. Não fale em “captar” ou “conseguir” clientes, não prometa resultado nem compare com concorrentes: fale de ser encontrado e de apresentar o trabalho com clareza"
      : null,
    ctx.style
      ? `- Jeito de abrir: use o MESMO cumprimento, a MESMA apresentação e o MESMO jeito de fazer a pergunta final do exemplo abaixo. É de propósito: as mensagens enviadas não podem ficar iguais entre si. Na apresentação diga o que você faz EXATAMENTE como "${roleFor(ctx)}", sem trocar por outra descrição (não escreva "ajudo empresas a se posicionarem na internet" se não for isso). O resto você escreve com as suas palavras.`
      : null,
    "",
    `Ângulo desta mensagem: ${angle.brief}`,
    `Tom: ${formal ? "sóbrio e respeitoso" : TONES[pickMixed(`${lead.id}:tom`, TONES.length)]}`,
    "",
    "Exemplo do mesmo ângulo, só para dar a medida de tamanho, ordem e jeito. Escreva com outras palavras, não copie:",
    example,
  ].filter((l): l is string => l !== null);
  if (retryReasons.length > 0) {
    lines.push("", `A versão anterior foi reprovada por: ${retryReasons.join("; ")}. Escreva de novo corrigindo isso.`);
  }
  return lines.join("\n");
}

const AiOpening = z.object({ messages: z.array(z.string()).min(1).max(6) });

// ───────────────────────── as travas ─────────────────────────

/** A IA escreveu a linha "responda PARE" por conta própria: tira a frase, porque a abertura não a leva. */
function stripFooter(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !/\bPARE\b/i.test(s) && !/parar de receber/i.test(norm(s)))
    .join(" ")
    .trim();
}

const FORBIDDEN =
  /pr[eé]via|prot[oó]tipo|mockup|r\$|reais|gr[aá]tis|gratuit|desconto|promo[cç][aã]o|or[cç]amento|garanti|https?:|www\.|\.com\b/i;

/** As partes do nome do negócio que o identificam (sem acento e sem as palavras de ramo). */
function nameTokens(name: string): string[] {
  return norm(shortName(name))
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !GENERIC_WORDS.has(t) && !/^dra?$|^doutora?$|^doutor$/.test(t));
}

const WORD = String.raw`[^\s,.!?]+`;
/** "Oi, Dra. Heloisa!": a palavra que vem depois do cumprimento (e do título). */
const VOCATIVE = new RegExp(String.raw`^(?:oi|ola|bom dia|boa tarde|boa noite)[,!]?\s+(?:(?:dra?|doutora?|doutor)\.?\s+)?(${WORD})`);
const NOT_A_NAME = new Set(["tudo", "pessoal", "equipe", "time", "galera", "sou", "aqui", "me", "meu", "eu", "tudo", "prazer", "bom", "boa"]);

export type OpeningCheck = { ok: true; parts: string[] } | { ok: false; reasons: string[] };

/** Confere o que a IA escreveu. Devolve os parágrafos prontos ou os motivos da reprovação. */
export function validateOpening(raw: string[], lead: TemplateLead, ctx: TemplateContext, facts: AgentFacts): OpeningCheck {
  const reasons: string[] = [];
  const bodies = raw.map((p) => stripFooter(humanizeText(p))).filter(Boolean);
  if (bodies.length === 0) return { ok: false, reasons: ["mensagem vazia"] };
  if (bodies.length > MAX_PARTS) return { ok: false, reasons: [`mais de ${MAX_PARTS} mensagens`] };

  const joined = bodies.join(" ");
  const plain = norm(joined);
  const noDots = plain.replace(/\./g, "");
  for (const [i, p] of bodies.entries()) {
    if (p.length > MAX_PART_CHARS) reasons.push(`a mensagem ${i + 1} passa de ${MAX_PART_CHARS} caracteres`);
  }

  // quem fala: a pessoa, sem a marca
  if (!plain.includes(norm(fullName(ctx)))) reasons.push(`não se apresenta como ${fullName(ctx)}`);
  if (norm(ctx.brandName) !== norm(fullName(ctx)) && plain.includes(norm(ctx.brandName))) reasons.push(`cita a marca (${ctx.brandName}) na abertura`);
  // a forma de dizer o que faz é sorteada por abertura (para nem todas terminarem a apresentação com a mesma frase): a IA a usa
  if (ctx.style?.role !== undefined && !plain.includes(norm(roleFor(ctx)))) reasons.push(`não diz o que faz como indicado ("${roleFor(ctx)}")`);

  // fala COM a pessoa: o tratamento certo e nada de terceira pessoa
  const addr = addressee(lead.name);
  const tokens = nameTokens(lead.name);
  if (addr && !noDots.includes(norm(addr).replace(/\./g, ""))) reasons.push(`não trata a pessoa por ${addr}`);
  const voc = VOCATIVE.exec(plain);
  const word = voc?.[1] ?? null;
  // "Oi! Jonathan Kelvin aqui…" não é chamar o lead de Jonathan: é quem escreve se apresentando
  const senderWords = norm(fullName(ctx)).split(/[^a-z0-9]+/).filter(Boolean);
  if (word && !NOT_A_NAME.has(word) && !tokens.includes(word) && !senderWords.includes(word)) reasons.push(`chama a pessoa de "${word}", um nome que não vem dos dados`);
  const spokenAbout = tokens.find((t) => new RegExp(String.raw`\b(?:a|o|da|do|na|no|pela|pelo)\s+(?:dra?\.?\s+|doutora?\s+|doutor\s+)?${t}\b`).test(plain));
  if (spokenAbout && (addr || (word && tokens.includes(word)))) reasons.push("fala da pessoa em terceira pessoa em vez de falar com ela");

  // mostra que sabe quem é: uma parte do nome do negócio (pode ser só o tratamento da pessoa)
  if (tokens.length > 0 && !tokens.some((t) => plain.includes(t))) reasons.push("não cita o negócio nem a pessoa pelo nome dos dados");
  if (!/\bsite\b/.test(plain)) reasons.push("não fala de site");
  if (/\btudo bem\b/.test(plain)) reasons.push('não precisa de "tudo bem"');

  const questions = (joined.match(/\?/g) ?? []).length;
  if (questions !== 1 || !bodies[bodies.length - 1].includes("?")) reasons.push("precisa de uma única pergunta, na última mensagem");

  if (FORBIDDEN.test(joined)) reasons.push("fala de prévia, preço, desconto, garantia ou link");
  if (openingGroup(lead.websiteKind) === "none" && /instagram|facebook/.test(plain)) reasons.push("cita rede social de um negócio sem rede nos dados");

  // números: só a nota, e só quando ela é boa o bastante para citar (os dígitos do próprio nome, como "Studio 21", são do nome)
  const rating = proofRating(lead);
  const withoutName = joined.replace(new RegExp(shortName(lead.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  for (const m of withoutName.matchAll(/\d+(?:[.,]\d+)?/g)) {
    if (m[0].replace(".", ",") !== rating) reasons.push(`número que não vem dos dados: ${m[0]}`);
  }
  if (!rating && /\bnota\b|avalia/.test(plain)) reasons.push("cita nota ou avaliações que não vale citar");

  const parts = assembleOpening(bodies);
  const final = parts.join("\n\n");
  if (final.length > MAX_TOTAL_CHARS) reasons.push(`passa de ${MAX_TOTAL_CHARS} caracteres (${final.length})`);

  const checked = checkMessage(final, "opening");
  for (const i of checked.issues) if (i.severity === "error") reasons.push(`${i.rule}: ${i.message}`);
  const warns = checked.issues.filter((i) => i.severity === "warn");
  if (warns.length > MAX_WARNINGS) reasons.push(`texto com tiques de IA: ${warns.map((w) => w.rule).join(", ")}`);

  const guard = guardReply(final, { facts, proposal: null, demoUrl: null });
  reasons.push(...guard.reasons);

  const unique = [...new Set(reasons)];
  return unique.length === 0 ? { ok: true, parts } : { ok: false, reasons: unique };
}

// ───────────────────────── a abertura curta ─────────────────────────

/** A mensagem inteira (sem a linha de saída) cabe em uma linha de celular. */
export const MAX_SHORT_CHARS = 140;

/**
 * Falar do que ele vende não cabe na abertura curta: ela só puxa a conversa. O elogio, a dor e o site vêm na resposta do agente,
 * depois que a pessoa respondeu.
 */
const PITCH = /\b(sites?|sistemas?|aplicativos?|landing|desenvolv\w*|program\w*|criar|crio|criamos|loja virtual|automa\w*|marketing|vender|vendas|ofereco|oferecemos)\b/;

export function shortOpeningSystemPrompt(ctx: TemplateContext): string {
  const s = ctx.senderName;
  return [
    `Você escreve a PRIMEIRA mensagem de WhatsApp de ${s} para quem cuida de um negócio local que ele ainda não conhece. O objetivo é um só: a pessoa RESPONDER. Por isso a mensagem é curtíssima e natural, como quem escreve no celular, e não parece propaganda.`,
    "",
    "Estrutura, em UMA única mensagem:",
    "1. Cumprimento (bom dia, oi, olá), já com o tratamento direto, como no exemplo.",
    `2. Quem você é, só o primeiro nome (${s}), como no exemplo.`,
    "3. Uma única pergunta fácil de responder, no jeito do exemplo.",
    "",
    "Regras:",
    `- No máximo ${MAX_SHORT_CHARS} caracteres no total. Uma só mensagem e uma só interrogação, no fim.`,
    "- Não fale do que você vende nem de site, sistema, preço, prévia, link ou serviço. Não explique nada: o assunto vem na próxima mensagem, depois que a pessoa responder.",
    "- Não elogie, não cite nota nem avaliações e não use números.",
    "- Fale COM a pessoa (você, seu, sua) e nunca sobre ela em terceira pessoa. Siga o tratamento indicado nos dados e não invente o nome de ninguém.",
    "- Sem emoji, hífen, travessão, lista ou negrito. No máximo uma exclamação.",
    "- Não escreva a linha “para parar de receber, responda PARE” nem nada parecido: a abertura é só conversa.",
    "- Português do Brasil, informal e educado.",
    "",
    'Responda SOMENTE com JSON, neste formato: {"messages": ["a mensagem"]}',
  ].join("\n");
}

export function shortOpeningUserPrompt(lead: TemplateLead, ctx: TemplateContext, angle: Angle, retryReasons: string[] = []): string {
  const addr = addressee(lead.name);
  const formal = isFormal(lead);
  const example = angle.build(lead, ctx, callName(lead)).join("\n");
  const lines = [
    "Dados do negócio:",
    `- Nome: ${callName(lead)}`,
    (lead.niche ?? lead.category)?.trim() ? `- Ramo: ${(lead.niche ?? lead.category)!.trim()}` : null,
    lead.city ? `- Cidade: ${lead.city}` : null,
    addr
      ? `- Tratamento: chame de “${addr}” logo no cumprimento e fale com ela em segunda pessoa`
      : "- Tratamento: o nome não traz título. Se ele deixar CLARO que é uma pessoa, chame pelo primeiro nome; senão fale “você” ou “vocês” e cite o negócio pelo nome, sem inventar nome de gente",
    formal
      ? "- Registro: advocacia ou contabilidade. Seja sóbrio e respeitoso, sem gíria, sem exclamação e sem brincadeira"
      : isCasual(lead)
        ? "- Registro: negócio de balcão. Pode ser descontraído (“Opa”, “Fala”), sem exagero"
        : null,
    "",
    `Jeito desta mensagem: ${angle.brief}`,
    "Use o MESMO cumprimento, a MESMA apresentação e o MESMO jeito de perguntar do exemplo abaixo. É de propósito: as mensagens enviadas não podem ficar iguais entre si. Você pode trocar palavras que não mudem o sentido.",
    "",
    "Exemplo (copie a estrutura, com as suas palavras onde puder):",
    example,
  ].filter((l): l is string => l !== null);
  if (retryReasons.length > 0) {
    lines.push("", `A versão anterior foi reprovada por: ${retryReasons.join("; ")}. Escreva de novo corrigindo isso.`);
  }
  return lines.join("\n");
}

/** Confere a abertura curta que a IA escreveu: uma mensagem só, uma pergunta só e nada de falar do que vende. */
export function validateShortOpening(raw: string[], lead: TemplateLead, ctx: TemplateContext, facts: AgentFacts): OpeningCheck {
  const reasons: string[] = [];
  const bodies = raw.map((p) => stripFooter(humanizeText(p))).filter(Boolean);
  if (bodies.length === 0) return { ok: false, reasons: ["mensagem vazia"] };
  if (bodies.length > 1) reasons.push("precisa ser UMA mensagem só");

  const text = bodies.join(" ");
  const plain = norm(text);
  const noDots = plain.replace(/\./g, "");
  if (text.length > MAX_SHORT_CHARS) reasons.push(`passa de ${MAX_SHORT_CHARS} caracteres (${text.length})`);
  if (text.length < 15) reasons.push("curta demais");
  if (!/\b(bom dia|boa tarde|boa noite|oi|ola|opa)\b/.test(plain.slice(0, 40))) reasons.push("não começa com um cumprimento");

  // quem fala: só o primeiro nome, e nunca a marca
  if (!plain.includes(norm(ctx.senderName))) reasons.push(`não diz o primeiro nome (${ctx.senderName})`);
  if (norm(ctx.brandName) !== norm(ctx.senderName) && plain.includes(norm(ctx.brandName))) reasons.push(`cita a marca (${ctx.brandName}) na abertura`);

  // fala COM a pessoa: o tratamento certo e nada de terceira pessoa
  const addr = addressee(lead.name);
  const tokens = nameTokens(lead.name);
  if (addr && !noDots.includes(norm(addr).replace(/\./g, ""))) reasons.push(`não trata a pessoa por ${addr}`);
  const word = VOCATIVE.exec(plain)?.[1] ?? null;
  const senderWords = norm(`${fullName(ctx)} ${ctx.senderName}`).split(/[^a-z0-9]+/).filter(Boolean);
  if (word && !NOT_A_NAME.has(word) && !tokens.includes(word) && !senderWords.includes(word)) reasons.push(`chama a pessoa de "${word}", um nome que não vem dos dados`);
  const spokenAbout = tokens.find((t) => new RegExp(String.raw`\b(?:a|o|da|do|na|no|pela|pelo)\s+(?:dra?\.?\s+|doutora?\s+|doutor\s+)?${t}\b`).test(plain));
  if (spokenAbout && (addr || (word && tokens.includes(word)))) reasons.push("fala da pessoa em terceira pessoa em vez de falar com ela");

  // só puxa a conversa: nada do que ele vende, nada de preço, e nenhum número ou nota
  if (PITCH.test(plain)) reasons.push("fala do que você vende: a abertura curta só puxa a conversa");
  if (FORBIDDEN.test(text)) reasons.push("fala de prévia, preço, desconto, garantia ou link");
  if (/\bnota\b|avalia|elogi|parabens/.test(plain)) reasons.push("elogia ou cita nota: isso fica para a próxima mensagem");
  const withoutName = text.replace(new RegExp(callName(lead).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  for (const m of withoutName.matchAll(/\d+(?:[.,]\d+)?/g)) reasons.push(`número que não vem dos dados: ${m[0]}`);

  const questions = (text.match(/\?/g) ?? []).length;
  if (questions !== 1 || !text.trimEnd().endsWith("?")) reasons.push("precisa de uma única pergunta, no fim");

  const parts = assembleOpening(bodies);
  const final = parts.join("\n\n");
  const checked = checkMessage(final, "opening");
  for (const i of checked.issues) if (i.severity === "error") reasons.push(`${i.rule}: ${i.message}`);
  const warns = checked.issues.filter((i) => i.severity === "warn");
  if (warns.length > MAX_WARNINGS) reasons.push(`texto com tiques de IA: ${warns.map((w) => w.rule).join(", ")}`);

  const guard = guardReply(final, { facts, proposal: null, demoUrl: null });
  reasons.push(...guard.reasons);

  const unique = [...new Set(reasons)];
  return unique.length === 0 ? { ok: true, parts } : { ok: false, reasons: unique };
}

// ───────────────────────── escrever ─────────────────────────

async function ask(llm: LlmClient, system: string, user: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("demorou demais"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([llm.complete({ system, user, signal: controller.signal }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A abertura de um lead: a IA escreve em cima do ângulo dele; se não der, vale o modelo do mesmo ângulo. */
export async function writeOpening(lead: TemplateLead, ctx: TemplateContext, deps: OpeningDeps): Promise<WrittenOpening> {
  const fallback: WrittenOpening = { ...buildOpening(lead, ctx), source: "modelo", note: null };
  if (!deps.llm || ctx.flow !== "qualificar") return fallback;

  const short = ctx.mode === "curta";
  const angle = short ? shortAngleFor(lead, ctx.style) : angleFor(lead, ctx.style);
  const group = openingGroup(lead.websiteKind);
  const system = short ? shortOpeningSystemPrompt(ctx) : openingSystemPrompt(ctx);
  const suffix = ctx.style ? `~${styleCode(ctx.style)}` : "";
  let reasons: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const user = short ? shortOpeningUserPrompt(lead, ctx, angle, reasons) : openingUserPrompt(lead, ctx, angle, reasons);
      const raw = await ask(deps.llm, system, user, deps.timeoutMs ?? OPENING_AI_TIMEOUT_MS);
      let json: unknown;
      try {
        json = JSON.parse(stripJsonFence(raw));
      } catch {
        reasons = ["a resposta não era JSON"];
        continue;
      }
      const parsed = AiOpening.safeParse(json);
      if (!parsed.success) {
        reasons = ["o JSON veio fora do formato"];
        continue;
      }
      const checked = short ? validateShortOpening(parsed.data.messages, lead, ctx, deps.facts) : validateOpening(parsed.data.messages, lead, ctx, deps.facts);
      if (checked.ok) {
        return { body: checked.parts.join("\n\n"), parts: checked.parts, variant: `abertura-${group}-${angle.id}-ia${suffix}`, group, angle: angle.id, source: "ia", note: null };
      }
      reasons = checked.reasons;
    } catch (error) {
      // erro do provedor ou tempo esgotado: tentar de novo só atrasa o lote inteiro
      const why = error instanceof Error ? error.message : String(error);
      return { ...fallback, note: `IA indisponível (${why}). Usei o modelo.` };
    }
  }
  return { ...fallback, note: `IA reprovada pela trava: ${reasons.join("; ")}. Usei o modelo.` };
}

export interface WriteManyOptions {
  /** O estilo de cada abertura, na ordem dos leads (nulo = o de sempre). Vem de `chooseOpeningStyle`. */
  styles?: (OpeningStyle | null)[];
  concurrency?: number;
  /** Depois deste tempo o resto do lote sai pelos modelos, para a tela não ficar presa se a IA travar. */
  deadlineMs?: number;
  now?: () => number;
}

/** Escreve várias aberturas, algumas ao mesmo tempo, na ordem dos leads. */
export async function writeOpenings(leads: TemplateLead[], ctx: TemplateContext, deps: OpeningDeps, opts: WriteManyOptions = {}): Promise<WrittenOpening[]> {
  const now = opts.now ?? Date.now;
  const stop = now() + (opts.deadlineMs ?? 90_000);
  const out: WrittenOpening[] = new Array(leads.length);
  let next = 0;
  const worker = async () => {
    while (next < leads.length) {
      const i = next++;
      const lead = leads[i];
      const late = now() > stop;
      const style = opts.styles?.[i];
      const written = await writeOpening(lead, style ? { ...ctx, style } : ctx, late ? { ...deps, llm: null } : deps);
      out[i] = late && deps.llm ? { ...written, note: "Tempo do lote esgotado: usei o modelo." } : written;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, leads.length)) }, worker));
  return out;
}
