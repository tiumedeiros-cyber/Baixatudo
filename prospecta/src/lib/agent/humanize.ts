import { norm } from "@/lib/utils";

/**
 * Humanizador de mensagens de WhatsApp em português.
 *
 * Adaptado de blader/humanizer (MIT, baseado em "Signs of AI writing" da Wikipédia): os padrões
 * que denunciam texto de IA (contraste "não é X, é Y", fecho dramático, dois-pontos em rótulo, traço
 * como conector, palavras de vitrine, sobra de chatbot...) viraram regras que rodam sobre TODA mensagem
 * que o agente escreve e sobre todos os modelos de texto do painel. O princípio do original vale aqui:
 * manter o que o texto diz, não inventar nada, e cada frase precisa acrescentar algo.
 *
 * Duas saídas: `humanizeText` faz só correções mecânicas e seguras (traço, emoji, aspas curvas,
 * negrito); `lintMessage` aponta o que sobrou. Quem decide o que fazer com os apontamentos é quem chama.
 */

export type MessageType = "opening" | "followup" | "reply";
export type Severity = "error" | "warn";

export interface LintIssue {
  rule: string;
  severity: Severity;
  message: string;
  match?: string;
}

/** Tamanho em caracteres. Passou do "soft" é aviso; passou do "hard" é erro. */
export const LENGTH_LIMITS: Record<MessageType, { soft: number; hard: number }> = {
  // quem sou, o elogio com a dor e a solução com a pergunta, em 2 ou 3 mensagens (a abertura não leva a linha "responda PARE")
  opening: { soft: 330, hard: 380 },
  followup: { soft: 190, hard: 240 },
  reply: { soft: 260, hard: 360 },
};

/** Avisos a partir deste número reprovam a mensagem do agente (texto cheio de tique de IA). */
export const MAX_WARNINGS = 2;

type Term = string; // termo sem acento e em minúsculas; "radical*" casa o começo da palavra

interface TermRule {
  rule: string;
  severity: Severity;
  message: string;
  terms: Term[];
}

function termRegex(term: Term): RegExp {
  const stem = term.endsWith("*");
  const body = (stem ? term.slice(0, -1) : term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${body}${stem ? "" : "(?![a-z0-9])"}`);
}

const TERM_RULES: TermRule[] = [
  {
    rule: "residuo-de-chatbot",
    severity: "error",
    message: "Sobra de chatbot (despedida ou oferta de ajuda). Tire e termine no último fato.",
    terms: [
      "espero ter ajudado",
      "espero que isso ajude",
      "espero que ajude",
      "fico a disposicao",
      "estou a disposicao",
      "estou aqui para ajudar",
      "estou aqui pra ajudar",
      "como posso ajudar",
      "posso ajudar em mais alguma",
      "entendo perfeitamente",
      "compreendo perfeitamente",
      "compreendo sua preocupacao",
      "otima pergunta",
      "excelente pergunta",
      "boa pergunta",
      "nao hesite",
      "fique a vontade para",
      "qualquer duvida, estou",
      "qualquer duvida estou",
      "qualquer duvida, fico",
      "se precisar de mais alguma",
      "como um assistente",
      "como uma ia",
      "modelo de linguagem",
    ],
  },
  {
    rule: "palavra-de-vitrine",
    severity: "error",
    message: "Palavra de propaganda que soa como IA ou como promessa exagerada.",
    terms: [
      "incrivel",
      "fantastic*",
      "maravilhos*",
      "revolucion*",
      "potencializ*",
      "alavanc*",
      "impulsion*",
      "sinergia",
      "solucao completa",
      "solucoes completas",
      "proximo nivel",
      "de ponta",
      "oportunidade unica",
      "imperdivel",
      "aproveite",
      "garantimos",
      "garantia de resultado",
      "melhor do mercado",
      "numero 1",
      "lider de mercado",
    ],
  },
  {
    rule: "palavra-de-ia",
    severity: "warn",
    message: "Palavra que modelos de IA repetem mais do que as pessoas.",
    terms: [
      "fundamental",
      "essencial",
      "crucial",
      "robust*",
      "inovador*",
      "inovacao",
      "diferenciad*",
      "excelencia",
      "otimiz*",
      "experiencia unica",
      "jornada",
      "ecossistema",
      "cenario",
      "no mundo digital",
      "presenca digital",
      "vitrine digital",
      "cartao de visita digital",
      "destacar-se",
      "se destacar",
      "destaque-se",
      "sem compromisso",
    ],
  },
  {
    rule: "preparacao-de-ponto",
    severity: "warn",
    message: "Frase que anuncia o ponto em vez de fazê-lo. Vá direto ao assunto.",
    terms: [
      "vou ser direto",
      "vou ser sincero",
      "para ser sincero",
      "pra ser sincero",
      "sendo honesto",
      "sinceramente",
      "deixa eu te explicar",
      "deixa eu te contar",
      "olha so",
      "vamos la",
      "a verdade e que",
      "o fato e que",
      "antes de mais nada",
      "gostaria de informar",
      "gostaria de te apresentar",
      "venho por meio",
      "prezad*",
      "estimad*",
    ],
  },
  {
    rule: "frase-de-efeito",
    severity: "warn",
    message: "Frase que soa profunda e não acrescenta fato. Troque pela afirmação concreta.",
    terms: [
      "no fundo",
      "o segredo e",
      "a chave e",
      "o ponto e que",
      "o que realmente importa",
      "no final do dia",
      "e uma questao de",
    ],
  },
  {
    rule: "discute-com-ninguem",
    severity: "warn",
    message: "Defende-se de uma objeção que ninguém fez.",
    terms: [
      "nao estou dizendo",
      "nao me entenda mal",
      "vale ressaltar",
      "vale destacar",
      "cabe ressaltar",
      "e importante ressaltar",
      "e importante destacar",
      "e importante lembrar",
    ],
  },
];

const TERM_REGEX = TERM_RULES.map((r) => ({ ...r, regexes: r.terms.map((t) => [t, termRegex(t)] as const) }));

const EMOJI = /[\p{Extended_Pictographic}‍️]/gu;
const HAS_EMOJI = /\p{Extended_Pictographic}/u;
// Rodam sobre o texto em minúsculas COM acento, porque "é" (verbo) e "e" (conjunção) não podem se confundir.
const CONTRAST = [
  // "não é só um site, é uma vitrine" / "não é X: é Y"
  /(?<![\p{L}])não é (?:apenas |só |somente |simplesmente )?[^.!?\n]{1,60}[,;:]\s*(?:é|mas|e sim)(?![\p{L}])/u,
  // "não apenas X, mas também Y"
  /(?<![\p{L}])não (?:apenas|só|somente) [^.!?\n]{1,60},? mas (?:também )?/u,
  // "isso não significa X. Significa Y"
  /(?<![\p{L}])(?:isso )?não significa [^.!?\n]{1,60}[.;]\s*(?:isso )?significa/u,
];
const CLOSER_LINE = /^(?:e (?:simples|so isso)|simples assim|e isso|esse e o ponto|fim de papo|sem enrolacao)[.!]?$/;
const LABEL_LINE = /^(?:\p{Lu}\p{L}*)(?:\s\p{L}+){0,2}:\s+\S/mu;

/** Correções mecânicas e seguras. Nunca troca palavra nem muda o sentido. */
export function humanizeText(input: string): string {
  let t = input;
  t = t.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/`/g, "'");
  t = t.replace(/…/g, "...");
  t = t.replace(EMOJI, "");
  // negrito, itálico e cabeçalho de markdown; marcador de lista no começo da linha
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "$1");
  t = t.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "$1");
  t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "").replace(/^[ \t]*(?:[-•*]|\d+[.)])[ \t]+/gm, "");
  // traço como conector vira vírgula: "A — B", "A – B", "A -- B", "A - B" (sem atravessar linhas)
  t = t.replace(/[ \t]*(?:—|–|--)[ \t]*/g, ", ").replace(/[ \t]+-[ \t]+/g, ", ");
  // espaços e linhas
  t = t.replace(/[ \t]+/g, " ").replace(/ +([,.!?;:])/g, "$1").replace(/,\s*,/g, ",").replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n").replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?");
  return t.trim();
}

function countSentences(text: string): number {
  return text
    .replace(/\d[.,]\d/g, "0") // 4,9 e 1.200 não terminam frase
    .replace(/\b(Dra?|Sra?|Profa?)\./g, "$1") // "Dra. Liane" não termina frase
    .replace(/R\$\s?[\d.,]+/g, "R$0")
    .split(/[.!?]+(?:\s|$)/)
    .filter((s) => s.trim().length > 2).length;
}

/** Aponta o que denuncia texto de IA ou foge do jeito de escrever no WhatsApp. Não altera o texto. */
export function lintMessage(text: string, type: MessageType): LintIssue[] {
  const issues: LintIssue[] = [];
  const add = (rule: string, severity: Severity, message: string, match?: string) => issues.push({ rule, severity, message, match });
  const plain = norm(text);

  if (/[—–]|(?:^|\s)--(?:\s|$)|\s-\s/.test(text)) add("traco-como-conector", "error", "Traço usado para ligar frases. Use ponto, vírgula ou parênteses.");
  if (HAS_EMOJI.test(text)) add("emoji", "error", "Sem emoji nas mensagens do painel.");
  if (/[“”‘’]/.test(text)) add("aspas-curvas", "warn", "Aspas curvas; use aspas retas.");
  if (/\*\*|(?<![\w*])\*[^*\n]+\*(?![\w*])|^\s{0,3}#{1,6}\s/m.test(text)) add("negrito-ou-titulo", "error", "Negrito ou título em mensagem de WhatsApp.");
  const listLines = text.split("\n").filter((l) => /^\s*(?:[-•*]|\d+[.)])\s+/.test(l)).length;
  if (listLines >= 2) add("lista", "error", "Lista com marcadores. Escreva em frases curtas.");
  if (LABEL_LINE.test(text)) add("rotulo-com-dois-pontos", "warn", 'Linha que começa com rótulo e dois-pontos ("Prazo: ...").');

  const lower = text.toLowerCase();
  for (const re of CONTRAST) {
    const m = re.exec(lower);
    if (m) {
      add("contraste-nao-e", "error", 'Contraste "não é X, é Y": diga direto o que é.', m[0]);
      break;
    }
  }

  for (const r of TERM_REGEX) {
    for (const [term, re] of r.regexes) {
      if (re.test(plain)) {
        add(r.rule, r.severity, r.message, term.replace(/\*$/, ""));
        break; // um apontamento por regra basta
      }
    }
  }

  const lines = text.split(/\n+/).map((l) => norm(l).replace(/[^\p{L}\p{N}\s.!]/gu, "").trim());
  const closer = lines.find((l) => CLOSER_LINE.test(l));
  if (closer) add("fecho-dramatico", "warn", "Linha de fecho que repete o ponto.", closer);

  const limits = LENGTH_LIMITS[type];
  if (text.length > limits.hard) add("longa-demais", "error", `Passa de ${limits.hard} caracteres (${text.length}). Corte.`);
  else if (text.length > limits.soft) add("longa", "warn", `Passa de ${limits.soft} caracteres (${text.length}). Dá para encurtar.`);

  const questions = (text.match(/\?/g) ?? []).length;
  if (questions > 1) add("varias-perguntas", "warn", "Mais de uma pergunta. Uma pergunta por mensagem.");
  if ((text.match(/!/g) ?? []).length > (type === "reply" ? 2 : 1)) add("exclamacao-demais", "warn", "Exclamação demais.");
  if (type === "reply" && countSentences(text) > 4) add("frases-demais", "warn", "Mais de 4 frases. WhatsApp pede curto.");
  if (text.split("\n").length > 5) add("linhas-demais", "warn", "Muitas linhas.");

  return issues;
}

export interface Checked {
  text: string;
  issues: LintIssue[];
  /** Sem erro e com poucos avisos: pode seguir. */
  ok: boolean;
}

/** Corrige o que é mecânico e avalia o resultado. */
export function checkMessage(text: string, type: MessageType): Checked {
  const fixed = humanizeText(text);
  const issues = lintMessage(fixed, type);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;
  return { text: fixed, issues, ok: errors === 0 && warns <= MAX_WARNINGS };
}
