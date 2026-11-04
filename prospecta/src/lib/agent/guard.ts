import { entryCents, remainingCents } from "@/lib/deals/money";
import { norm } from "@/lib/utils";
import { checkMessage } from "./humanize";
import type { AgentContext } from "./types";

/**
 * A trava do agente com IA. Tudo que a IA escrever passa aqui antes de virar rascunho. O que a trava
 * não deixa passar: dinheiro, prazo, porcentagem, link, chave Pix, telefone e promessas que não vêm dos
 * fatos do dono; e texto que denuncia IA (humanizador). Se reprovar, o agente usa a resposta das regras.
 * A IA pode errar à vontade: ela não consegue inventar preço nem prazo para o cliente de verdade.
 *
 * Os "fatos do dono" incluem as respostas que ele escreveu em Configurações (garantia, hospedagem, pagamento,
 * exemplos, desconto): números, prazos, porcentagens e links que aparecem nelas também são válidos.
 */

export interface GuardResult {
  ok: boolean;
  /** O texto já corrigido nos detalhes mecânicos (traço, emoji, aspas). */
  text: string;
  reasons: string[];
}

export interface GuardOptions {
  /**
   * A resposta é o texto do próprio dono (política em Configurações): não passa pelo humanizador nem pelas
   * regras de "promessa" e "negação", porque ali quem decide o que prometer é ele. Dinheiro, prazo, porcentagem,
   * link e telefone continuam conferidos contra os fatos e as respostas dele.
   */
  trusted?: boolean;
}

const WORD_NUMBER: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  quinze: 15, vinte: 20, trinta: 30,
};

const PROMISE =
  /(garanti\w*|sem risco|100 ?%|reembolso|devolvemos|devolucao|contrato|nota fiscal|resultado garantido|dobrar|triplicar|aumentar suas vendas|vender mais garantido)/;

/** O lead não pode ouvir "o dono", "a equipe" ou "sou uma IA": a mensagem sai como se fosse o próprio Jonathan. */
const ASSISTANT_VOICE =
  /\bcom o dono\b|\bo dono (vai|ira|deve|precisa|pode|confirma)|\ba equipe\b|\bnosso sistema\b|assistente virtual|\bsou (uma |um )?(ia|robo|bot|assistente|inteligencia artificial)\b/;

/** A IA não sabe o que o dono NÃO oferece: negar sem estar nos fatos pode matar uma venda ou prometer o contrário depois. */
const DENIES_OFFER = /\b(ainda )?(nao|n) (tenho|temos|faco|fazemos|ofereco|oferecemos|aceito|aceitamos|trabalho|trabalhamos)\b/;

const MONEY = /R\$\s*([\d.]+(?:,\d{1,2})?)|(\d[\d.]*(?:,\d{1,2})?)\s*reais/gi;
const DAYS = /\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\s*(dias?|semanas?|horas?|meses|mes)\b/g;
const PCT = /(\d+(?:,\d+)?)\s*%/g;
const URL = /https?:\/\/\S+|www\.\S+/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const DOMAIN = /(?<![\w.])[a-z0-9-]+\.(?:com|com\.br|br|net|org|app|site|io|dev)\b/gi;
const PHONE = /\d[\d\s().-]{6,}\d/g;

function parseReais(raw: string): number | null {
  const cleaned = raw.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const trimEnd = (s: string) => s.replace(/[.,;:!?)]+$/, "");

export function guardReply(input: string, ctx: Pick<AgentContext, "facts" | "proposal" | "demoUrl">, opts: GuardOptions = {}): GuardResult {
  const reasons: string[] = [];
  const trusted = opts.trusted === true;
  const checked = checkMessage(input, "reply");
  const text = trusted ? input.trim() : checked.text;
  if (!text) return { ok: false, text, reasons: ["resposta vazia"] };
  if (!trusted) {
    for (const i of checked.issues) {
      if (i.severity === "error") reasons.push(`${i.rule}: ${i.message}`);
    }
    const warns = checked.issues.filter((i) => i.severity === "warn");
    if (!checked.ok && reasons.length === 0) reasons.push(`texto com tiques de IA: ${warns.map((w) => w.rule).join(", ")}`);
  }

  const { facts } = ctx;
  const p = ctx.proposal && ctx.proposal.status !== "cancelled" ? ctx.proposal : null;

  // O que o dono escreveu nas respostas dele também vale como fato (números, prazos, porcentagens, links, telefones).
  const policyText = Object.values(facts.policies ?? {}).join("\n");
  const policyFlat = policyText.replace(/ /g, " ");
  const policyPlain = norm(policyText);

  // dinheiro: o preço inicial do dono, os valores da proposta de verdade e o que está nas respostas dele
  const allowedMoney = new Set<number>([facts.priceFrom]);
  if (p) for (const cents of [p.amountCents, entryCents(p), remainingCents(p)]) allowedMoney.add(cents / 100);
  for (const m of policyFlat.matchAll(MONEY)) {
    const v = parseReais(m[1] ?? m[2]);
    if (v !== null) allowedMoney.add(v);
  }
  const flat = text.replace(/ /g, " ");
  for (const m of flat.matchAll(MONEY)) {
    const v = parseReais(m[1] ?? m[2]);
    if (v === null || !allowedMoney.has(v)) reasons.push(`valor em dinheiro que não vem dos fatos: ${m[0].trim()}`);
  }

  // prazo e porcentagem
  const plain = norm(text);
  const allowedDays = new Set<number>([facts.deliveryDays, ...(p ? [p.deliveryDays] : [])]);
  for (const m of policyPlain.matchAll(DAYS)) {
    if (/^dias?$/.test(m[2])) allowedDays.add(/^\d+$/.test(m[1]) ? Number(m[1]) : (WORD_NUMBER[m[1]] ?? -1));
  }
  for (const m of plain.matchAll(DAYS)) {
    if (m[1] === "um" && m[2] === "dia") continue; // "se um dia quiserem..." não é prazo
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBER[m[1]];
    if (!/^dias?$/.test(m[2]) || !allowedDays.has(n)) reasons.push(`prazo que não vem dos fatos: ${m[0]}`);
  }
  const allowedPct = new Set<number>([facts.entryPct, ...(p ? [p.entryPct] : [])]);
  for (const m of policyFlat.matchAll(PCT)) allowedPct.add(Number(m[1].replace(",", ".")));
  for (const m of text.matchAll(PCT)) {
    if (!allowedPct.has(Number(m[1].replace(",", ".")))) reasons.push(`porcentagem que não vem dos fatos: ${m[0]}`);
  }

  // links, e-mail, telefone e chave Pix
  const demo = ctx.demoUrl;
  const policyUrls = [...policyFlat.matchAll(URL)].map((m) => trimEnd(m[0]).toLowerCase());
  for (const m of text.matchAll(URL)) {
    const url = trimEnd(m[0]);
    const fromPolicy = policyUrls.some((u) => url.toLowerCase().startsWith(u));
    if (!(demo && url.startsWith(demo)) && !fromPolicy) reasons.push(`link que não é o da prévia: ${url}`);
  }
  const withoutDemo = demo ? text.split(demo).join(" ") : text;
  const keyDigits = facts.pixKey.replace(/\D/g, "");
  const phoneDigits = facts.contactPhone.replace(/\D/g, "");
  const policyDigits = [...policyFlat.matchAll(PHONE)].map((m) => m[0].replace(/\D/g, "")).filter((d) => d.length >= 8);
  const policyEmails = [...policyFlat.matchAll(EMAIL)].map((m) => trimEnd(m[0]).toLowerCase());
  for (const m of withoutDemo.matchAll(EMAIL)) {
    const e = trimEnd(m[0]).toLowerCase();
    if (e !== facts.pixKey.toLowerCase() && !policyEmails.includes(e)) reasons.push(`e-mail que não é a chave Pix: ${m[0]}`);
  }
  const withoutEmail = withoutDemo.replace(EMAIL, " ");
  for (const m of withoutEmail.matchAll(DOMAIN)) {
    // "instagram.com/kelvin" escrito pelo dono em Configurações é dele; o que a IA inventa não é
    if (!policyPlain.includes(m[0].toLowerCase()) && !policyUrls.some((u) => u.includes(m[0].toLowerCase()))) {
      reasons.push(`endereço de internet que não é o da prévia: ${m[0]}`);
    }
  }
  for (const m of withoutDemo.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 8) continue;
    const known = [keyDigits, phoneDigits, ...policyDigits].filter(Boolean).some((k) => k.includes(digits) || digits.includes(k));
    if (!known) reasons.push(`número de telefone, CPF ou chave que não é do dono: ${m[0].trim()}`);
  }

  if (!trusted) {
    if (ASSISTANT_VOICE.test(plain)) reasons.push("fala como assistente (\"o dono\", \"a equipe\", \"sou uma IA\") em vez de falar como o próprio dono do negócio");
    if (DENIES_OFFER.test(plain)) reasons.push('afirma que "não tem" ou "não faz" algo que não está nos fatos do dono');
    if (PROMISE.test(plain)) reasons.push("promessa que só o dono pode fazer (garantia, contrato, nota, resultado)");
  }

  const unique = [...new Set(reasons)];
  return { ok: unique.length === 0, text, reasons: unique };
}
