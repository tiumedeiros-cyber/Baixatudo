import type { AgentFlow, WebsiteKind } from "@/lib/leads/types";
import { norm } from "@/lib/utils";
import { EXPLAIN_ASKS, TALK_ASKS, styleCode, type OpeningMode, type OpeningStyle } from "./style";

/**
 * Mensagens da primeira abordagem e dos follow-ups. Regras de ouro: dizer quem somos, usar UM dado
 * real do lead, não mandar link na abertura e uma única pergunta. A abertura não leva "responda PARE"; os follow-ups levam.
 * Texto de WhatsApp: curto, simples, sem emoji, sem elogio que ninguém conferiu e sem promessa de preço.
 * Toda frase passa pelas regras do humanizador (`agent/humanize.ts`); o teste confere cada modelo.
 * As respostas a quem escreve ficam no agente (`lib/agent`).
 *
 * Dois fluxos (`AgentFlow`): "previa" oferece uma prévia do site na abordagem; "qualificar" não oferece prévia
 * e pergunta se faz sentido conversar sobre um site ou um sistema, para o agente qualificar e o dono entrar depois.
 */

export interface TemplateLead {
  id: string;
  name: string;
  neighborhood: string | null;
  city: string | null;
  category: string | null;
  niche: string | null;
  rating: number | null;
  reviewsCount: number;
  websiteKind: WebsiteKind;
}

export interface TemplateContext {
  senderName: string;
  brandName: string;
  /** Como ele se apresenta na primeira abordagem: "Sou o Jonathan Kelvin, desenvolvedor". Sem a marca. */
  senderFullName?: string;
  senderRole?: string;
  /** O fluxo do agente. Sem ele vale o antigo (com prévia). */
  flow?: AgentFlow;
  /** O jeito desta abertura (saudação, apresentação, pergunta e ângulo). Sem ele vale o texto de sempre. */
  style?: OpeningStyle;
  /** "curta": uma mensagem curtinha para a pessoa responder (o padrão novo). Sem ele (ou "completa"), as três mensagens de sempre. */
  mode?: OpeningMode;
}

/** Palavras que nunca terminam um nome: sobram quando o corte cai no meio de "Sociedade individual de Advocacia". */
const DANGLING = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "para", "com", "&"]);
/** A forma jurídica no fim do nome ("Sociedade Individual de Advocacia", "LTDA", "ME") não ajuda quem lê o WhatsApp. */
const LEGAL_TAIL = /\s+(sociedade\s+(individual\s+)?de\s+(advocacia|advogados)|ltda\.?|eireli|epp|mei|me|s\/a|s\.a\.?)$/i;

/**
 * Nome curto e limpo: sem emoji, sem o slogan depois do " - ", sem a forma jurídica no fim e com no máximo 48
 * caracteres. O corte cai sempre entre palavras e nunca deixa "de", "da", "e"... pendurados no fim.
 */
export function shortName(name: string): string {
  const noEmoji = name.replace(/[\p{Extended_Pictographic}️‍]/gu, " ");
  const first = noEmoji.split(/\s[-–—|]\s/)[0];
  const clean = first.replace(/\s+/g, " ").trim();
  // só tira a forma jurídica se sobrar um nome de verdade antes dela
  const unsuffixed = clean.replace(LEGAL_TAIL, "").trim();
  const base = unsuffixed.split(" ").length >= 2 ? unsuffixed : clean;
  // um nome que cabe inteiro fica como está ("Studio A"); só o corte pode deixar uma palavra solta no fim
  if (base.length <= 48) return base || name.trim();
  const cut = base.slice(0, 48);
  return trimDangling(cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).trim());
}

function trimDangling(text: string): string {
  const words = text.split(" ");
  while (words.length > 1 && DANGLING.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(" ").trim();
}

/** Escolha estável (o mesmo lead sempre cai na mesma variação), espalhada entre os leads. */
export function pickVariant(id: string, count: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % count;
}

/**
 * Como `pickVariant`, mas com a mistura final dos bits: serve para sortear várias coisas do MESMO lead (cumprimento,
 * apresentação, tom) sem que uma escolha arraste a outra, o que acontece quando só a última letra da chave muda.
 */
export function pickMixed(key: string, count: number): number {
  let h = 2166136261 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % count;
}

function ratingText(rating: number | null): string {
  return rating == null ? "" : rating.toFixed(1).replace(".", ",");
}

/** A nota ("4,9") só quando a prova social é boa o bastante para citar; senão nulo. */
export function proofRating(lead: TemplateLead): string | null {
  return lead.rating != null && lead.rating >= 4.3 && lead.reviewsCount >= 10 ? ratingText(lead.rating) : null;
}

/** " (nota 4,9)" só quando a prova social é boa o bastante para citar. */
function proof(lead: TemplateLead): string {
  const rating = proofRating(lead);
  return rating ? ` (nota ${rating})` : "";
}

function place(lead: TemplateLead): string {
  return lead.neighborhood ?? lead.city ?? "sua região";
}

/** "estética em Fortaleza", "negócios em Fortaleza" ou "negócios da sua região". */
function searched(lead: TemplateLead): string {
  const what = (lead.niche ?? lead.category ?? "").toLowerCase().replace(/\s+/g, " ").trim() || "negócios";
  return lead.city ? `${what} em ${lead.city}` : `${what} na sua região`;
}

/**
 * A linha de saída. A primeira abordagem NÃO leva (decisão do dono em 29/10: a abertura tem que parecer uma pessoa
 * puxando conversa); os follow-ups, que só saem para quem não respondeu, continuam levando.
 */
const OUT = "Para parar de receber, responda PARE.";

type Builder = (lead: TemplateLead, ctx: TemplateContext, nome: string) => string;

const OPENINGS: Record<"none" | "social" | "weak", Builder[]> = {
  none: [
    (l, c, n) =>
      `Oi! Aqui é o ${c.senderName}, da ${c.brandName}. Vi a ${n} no Google${proof(l)} e não achei um site de vocês.\n\nPosso te mostrar uma prévia de como ficaria?`,
    (l, c, n) =>
      `Olá! ${c.senderName} aqui, da ${c.brandName}. Pesquisei ${searched(l)} e a ${n} apareceu${proof(l)}, mas sem site.\n\nQuer ver uma prévia de como ficaria o de vocês?`,
    (l, c, n) =>
      `Oi! Sou o ${c.senderName}, da ${c.brandName}. Quem pesquisa ${searched(l)} encontra a ${n}${proof(l)}, mas não encontra um site.\n\nPosso te mostrar uma prévia?`,
  ],
  social: [
    (l, c, n) =>
      `Oi! Aqui é o ${c.senderName}, da ${c.brandName}. Vi o Instagram da ${n}${proof(l)} e não achei um site de vocês.\n\nPosso te mostrar uma prévia de como ficaria?`,
    (l, c, n) =>
      `Olá! ${c.senderName} aqui, da ${c.brandName}. Achei a ${n} no Google${proof(l)}. Vocês divulgam pelo Instagram, mas ainda sem site.\n\nQuer ver uma prévia do de vocês?`,
    (l, c, n) =>
      `Oi! Sou o ${c.senderName}, da ${c.brandName}. Muita gente só encontra a ${n} pelo Instagram${proof(l)}. Um site traria também quem pesquisa no Google.\n\nPosso te mostrar uma prévia?`,
  ],
  weak: [
    (l, c, n) =>
      `Oi! Aqui é o ${c.senderName}, da ${c.brandName}. Dei uma olhada no site da ${n}${proof(l)} e há pontos que dá para melhorar.\n\nPosso te mostrar uma prévia de como ficaria?`,
    (l, c, n) =>
      `Olá! ${c.senderName} aqui, da ${c.brandName}. Conheci o site da ${n}${proof(l)} e tenho ideias para deixá-lo mais moderno.\n\nQuer ver uma prévia?`,
    (l, c, n) =>
      `Oi! Sou o ${c.senderName}, da ${c.brandName}. Passei pelo site da ${n}${proof(l)} e fiquei com ideias para atrair mais clientes de ${place(l)}.\n\nPosso te mostrar uma prévia?`,
  ],
};

export type OpeningGroup = "none" | "social" | "weak";

/** A linha de saída dos follow-ups. A abertura não a leva; se a IA a escrever, o sistema a tira (`stripFooter`). */
export const OPT_OUT_LINE = OUT;

type PartsBuilder = (lead: TemplateLead, ctx: TemplateContext, nome: string) => string[];

/** Um jeito de puxar assunto. O texto-modelo é o plano B; o `brief` é o que se pede à IA para este lead. */
export interface Angle {
  id: string;
  label: string;
  brief: string;
  /** Os parágrafos (cada um vira uma mensagem), SEM a linha de saída: ela é posta no fim por `buildOpening`. */
  build: PartsBuilder;
  /** O ângulo só vale para alguns leads (ex.: "confirmar o contato" não serve a quem tem nome de pessoa). Sem isto, vale para todos. */
  available?: (lead: TemplateLead) => boolean;
}

/** O nome completo de quem escreve (a abertura se apresenta como pessoa, sem a marca). */
export function fullName(c: TemplateContext): string {
  return c.senderFullName?.trim() || c.senderName;
}

/** O que ele é, em uma palavra ("desenvolvedor"). */
export function roleOf(c: TemplateContext): string {
  return c.senderRole?.trim() || "desenvolvedor";
}

/** Palavras de ramo e de empresa: não identificam uma pessoa nem o negócio (várias empresas têm "Estética" no nome). */
export const GENERIC_WORDS = new Set(
  "estetica clinica studio espaco atelier centro instituto salao barbearia nucleo casa beleza avancada saude odontologia dental advocacia advogados escritorio consultorio spa nails unhas cabelo cabeleireiro corporal facial harmonizacao demo por para dos das the mundo vida dentista dentistas medico medica psicologo psicologa nutricionista fisioterapeuta esteticista advogado advogada cirurgiao".split(" "),
);

const TITLE = /(?:^|[-–—|]\s*)(dra?\.?|doutora?|doutor)\s+(\p{L}{2,})/iu;
/** "Rafael Neves - ADVOCACIA": nome e sobrenome, e depois da barra a profissão. */
const PERSON_DASH =
  /^(\p{Lu}\p{Ll}+)(?:\s+\p{Lu}\p{Ll}+){1,2}\s*[-–—|]\s*(?:advocacia|advogad\w+|odontologia|dentista|psicolog\w+|nutri\w+|fisioterap\w+|arquitet\w+|contabil\w+|medic\w+|veterin\w+|personal|coach|terapeuta|esteticista|cabeleireir\w+|barbeiro|maquiador\w*|manicure|designer|fot[oó]graf\w+)/iu;
/** "Embelezar por Bruna Prado Clínica Estética": o nome depois de "por". */
const BY_PERSON = /\bpor\s+(\p{Lu}\p{Ll}{2,})(?:\s+\p{Lu}\p{Ll}+)?/u;

const capitalize = (w: string) => `${w.charAt(0).toUpperCase()}${w.slice(1).toLowerCase()}`;

/**
 * Como falar COM a pessoa. Quando o nome do negócio traz um título ("Dra. Heloisa Lima - Estética Avançada"), a abordagem
 * chama a pessoa pelo título e o primeiro nome ("Dra. Heloisa"). Quando o nome é claramente o de uma pessoa ("Rafael Neves -
 * ADVOCACIA", "Embelezar por Bruna Prado"), chama pelo primeiro nome. Fora isso não se inventa nome de ninguém: fala-se
 * "você" ou "vocês" (a IA pode chamar pelo primeiro nome quando o nome do negócio deixa claro que é uma pessoa).
 */
export function addressee(name: string): string | null {
  const raw = name.replace(/\s+/g, " ").trim();
  const title = TITLE.exec(raw);
  // "Dra dentista" não é a Dra. Dentista: a palavra depois do título precisa ser um nome, não a profissão
  if (title && !GENERIC_WORDS.has(norm(title[2]))) return `${/^(dr\.?|doutor)$/i.test(title[1]) ? "Dr." : "Dra."} ${capitalize(title[2])}`;
  const person = PERSON_DASH.exec(raw);
  if (person && !GENERIC_WORDS.has(norm(person[1]))) return capitalize(person[1]);
  const by = BY_PERSON.exec(raw);
  if (by) return capitalize(by[1]);
  return null;
}

export type Positioning = "forte" | "bom" | "discreto";

/** O quanto o negócio já está bem posicionado no Google, só pelos dados: serve para decidir se há o que elogiar. */
export function positioning(lead: TemplateLead): Positioning {
  if (lead.rating != null && lead.rating >= 4.5 && lead.reviewsCount >= 30) return "forte";
  return proofRating(lead) ? "bom" : "discreto";
}

/**
 * Advocacia e contabilidade: profissões com regras próprias de publicidade (OAB, CFC) e um jeito mais sóbrio de conversar.
 * A abordagem sempre abre com "Olá" e a IA recebe a instrução de não prometer resultado nem falar em captar clientes.
 */
export function isFormal(lead: Pick<TemplateLead, "name" | "category" | "niche">): boolean {
  return /\b(advoca\w*|advogad\w*|juridic\w*|contabil\w*|contador\w*|oab)\b/.test(norm(`${lead.niche ?? ""} ${lead.category ?? ""} ${lead.name}`));
}

interface Voice {
  /** "Dra. Heloisa" ou nulo. */
  v: string | null;
  /** Profissão de registro formal (advocacia, contabilidade). */
  formal: boolean;
  /** A nota, só quando é boa o bastante para citar. */
  r: string | null;
  /** "Vi seu perfil no Google (nota 5,0)" ou "Vi o perfil de Clínica X no Google (nota 5,0)". */
  seen: string;
  /** "o seu site" ou "o site de Clínica X". */
  site: string;
}

function voice(l: TemplateLead, n: string): Voice {
  const v = addressee(l.name);
  return {
    v,
    formal: isFormal(l),
    r: proofRating(l),
    seen: `Vi ${v ? "seu perfil" : `o perfil de ${n}`} no Google${proof(l)}`,
    site: v ? "o seu site" : `o site de ${n}`,
  };
}

const GREETINGS_INFORMAL: ((v: string | null) => string)[] = [
  (v) => (v ? `Oi, ${v}!` : "Oi!"),
  (v) => (v ? `Olá, ${v}!` : "Olá!"),
  (v) => (v ? `${v}, oi!` : "Oi, pessoal!"),
  (v) => (v ? `Olá, ${v}.` : "Olá."),
  (v) => (v ? `Oi, ${v}.` : "Oi."),
];
const GREETINGS_FORMAL: ((v: string | null) => string)[] = [
  (v) => (v ? `Olá, ${v}.` : "Olá."),
  (v) => (v ? `Olá, ${v}!` : "Olá!"),
  (v) => (v ? `${v}, olá.` : "Olá."),
];

const hi = (x: Voice, word: "Oi" | "Olá" = "Oi", c?: TemplateContext) => {
  if (c?.style) {
    const list = x.formal ? GREETINGS_FORMAL : GREETINGS_INFORMAL;
    return list[c.style.greet % list.length](x.v);
  }
  const w = x.formal ? "Olá" : word;
  return x.v ? `${w}, ${x.v}!` : `${w}!`;
};

/**
 * Como ele diz o que faz. A primeira é o texto das Configurações (a de sempre); as outras evitam que TODA abertura termine a
 * apresentação com a mesma frase longa, que é o que o WhatsApp reconhece como texto repetido. Todas cabem depois de "Sou o X,",
 * "Aqui é o X,", "X aqui," e "Prazer, X,".
 */
export const ROLES: ((c: TemplateContext) => string)[] = [
  (c) => roleOf(c),
  () => "desenvolvedor",
  () => "desenvolvedor web",
  () => "desenvolvedor de sites",
  () => "desenvolvedor de sites e sistemas",
  () => "desenvolvedor e ajudo negócios a serem encontrados no Google",
  () => "criador de sites para negócios locais",
  () => "desenvolvedor e faço sites para negócios locais",
];
const role = (c: TemplateContext) => ROLES[c.style?.role !== undefined ? c.style.role % ROLES.length : 0](c);

/** O que ele diz que faz NESTA abertura: a forma sorteada no estilo ou, sem estilo, o texto das Configurações. */
export const roleFor = role;

/** Como a pessoa se apresenta. Todas levam o nome completo e o ofício; a primeira é a de sempre. */
export const INTROS: ((c: TemplateContext) => string)[] = [
  (c) => `Sou o ${fullName(c)}, ${role(c)}.`,
  (c) => `Aqui é o ${fullName(c)}, ${role(c)}.`,
  (c) => `${fullName(c)} aqui, ${role(c)}.`,
  (c) => `Me chamo ${fullName(c)}, ${role(c)}.`,
  (c) => `Prazer, ${fullName(c)}, ${role(c)}.`,
];
const who = (c: TemplateContext) => INTROS[c.style ? c.style.intro % INTROS.length : 0](c);

/** A pergunta final de uma família; sem estilo é sempre a primeira (o texto de sempre). */
const qa = (c: TemplateContext, family: "explain" | "talk") => {
  const list = family === "explain" ? EXPLAIN_ASKS : TALK_ASKS;
  return list[c.style ? c.style.ask % list.length : 0];
};

/** O elogio, só com o que é verdade nos dados: a nota boa no Google. Sem nota boa, abre com o que viu. */
function praise(x: Voice, n: string): string {
  if (!x.r) return `${x.seen}.`;
  return x.v ? `Sua nota ${x.r} no Google é excelente.` : `A nota ${x.r} de ${n} no Google é excelente.`;
}

/**
 * O banco de ângulos do fluxo "qualificar": sem prévia, em mensagens curtas, falando COM a pessoa e nesta ordem: quem sou
 * (como pessoa, não como marca), o elogio com dado real e a dor, e a solução com UMA pergunta fácil. Cada lead cai em um
 * ângulo; a IA escreve em cima dele e, sem IA ou se o texto for reprovado, vale o modelo do mesmo ângulo.
 */
export const ANGLES: Record<OpeningGroup, Angle[]> = {
  none: [
    {
      id: "elogio",
      label: "Elogio e dor",
      brief: "Elogie a nota ou a presença dele no Google (só se os dados mostrarem) e mostre a dor: quem o encontra ali não tem um site para conhecer os serviços e agendar. Termine oferecendo o site que resolve isso, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [
          `${hi(x, "Oi", c)} ${who(c)}`,
          `${praise(x, n)} Mas sem site, quem chega lá não tem onde conhecer ${x.v ? "seus" : "os"} serviços e agendar.`,
          `Eu crio o site que resolve isso. ${qa(c, "explain")}`,
        ];
      },
    },
    {
      id: "procurada",
      label: "Quem pesquisa",
      brief: "Quem pesquisa o ramo na cidade encontra o negócio no Google, mas não encontra um site para conhecer o trabalho e agendar. Mostre essa dor e ofereça o site, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [
          `${hi(x, "Olá", c)} ${who(c)}`,
          `Quem pesquisa ${searched(l)} encontra ${x.v ? "você" : n}${proof(l)}, mas não acha um site para conhecer o trabalho e agendar.`,
          `Eu crio esse site. ${qa(c, "talk")}`,
        ];
      },
    },
    {
      id: "agenda",
      label: "Já poderia agendar",
      brief: "Quem chega pelo Google já poderia agendar direto, mas não existe um site para isso. Mostre essa dor (cliente chegando e sem onde agendar) e ofereça o site, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [
          `${hi(x, "Oi", c)} ${who(c)}`,
          `${x.seen}. Quem chega por lá já poderia agendar direto, mas ainda não existe um site para isso.`,
          `Eu crio esse site. ${qa(c, "explain")}`,
        ];
      },
    },
    {
      id: "direta",
      label: "Direta, curta",
      brief: "Duas mensagens curtíssimas: quem você é, e uma só frase que junta o elogio (se houver dado) e a dor (sem site), já com a solução e a pergunta.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [`${hi(x, "Oi", c)} ${who(c)}`, `${x.seen}, mas sem site. Eu crio o site que resolve isso. ${qa(c, "explain")}`];
      },
    },
    {
      id: "simples",
      label: "Simples, em três linhas",
      brief: "Três mensagens curtas e simples: quem você é; o que viu dele no Google e que não achou um site próprio; e que faz sites para negócios assim, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [`${hi(x, "Oi", c)} ${who(c)}`, `${x.seen}, mas não encontrei um site próprio.`, `Faço sites para negócios assim. ${qa(c, "explain")}`];
      },
    },
  ],
  social: [
    {
      id: "elogio",
      label: "Elogio e dor",
      brief: "Elogie a nota ou a presença dele no Google/Instagram (só se os dados mostrarem) e mostre a dor: o trabalho está só no Instagram e quem pesquisa no Google não encontra um site para conhecer e agendar. Ofereça o site, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [
          `${hi(x, "Oi", c)} ${who(c)}`,
          `${praise(x, n)} Mas hoje está só no Instagram, e no Google não há um site para conhecer e agendar.`,
          `Eu crio esse site. ${qa(c, "explain")}`,
        ];
      },
    },
    {
      id: "procurada",
      label: "Quem pesquisa",
      brief: "Muita gente só encontra o negócio pelo Instagram; um site traria também quem pesquisa no Google e quer agendar. Mostre essa dor e ofereça o site, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [
          `${hi(x, "Olá", c)} ${who(c)}`,
          `Muita gente só encontra ${x.v ? "você" : n} pelo Instagram${proof(l)}. Um site traria também quem pesquisa no Google e quer agendar.`,
          `Eu crio esse site. ${qa(c, "explain")}`,
        ];
      },
    },
    {
      id: "vitrine",
      label: "Tudo num lugar só",
      brief: "O Instagram é ótimo, mas um site reúne serviços, resultados e agendamento num lugar só. Elogie algo real dos dados, mostre essa dor e ofereça o site, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [
          `${hi(x, "Oi", c)} ${who(c)}`,
          `${x.seen}. O Instagram é ótimo, mas um site reúne serviços, resultados e agendamento num lugar só.`,
          `Eu crio esse site. ${qa(c, "talk")}`,
        ];
      },
    },
    {
      id: "direta",
      label: "Direta, curta",
      brief: "Duas mensagens curtíssimas: quem você é, e uma só frase com o que viu (Instagram, sem site), a solução e a pergunta.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [`${hi(x, "Oi", c)} ${who(c)}`, `${x.seen}, mas sem site. Eu crio o site que resolve isso. ${qa(c, "explain")}`];
      },
    },
    {
      id: "simples",
      label: "Simples, em três linhas",
      brief: "Três mensagens curtas e simples: quem você é; o que viu dele (Instagram e Google, sem site próprio); e que faz sites para negócios assim, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [`${hi(x, "Oi", c)} ${who(c)}`, `${x.seen}, mas não encontrei um site próprio.`, `Faço sites para negócios assim. ${qa(c, "explain")}`];
      },
    },
  ],
  weak: [
    {
      id: "elogio",
      label: "Elogio e dor",
      brief: "Elogie a nota dele no Google (só se os dados mostrarem) e mostre a dor: o site atual pode atrair e agendar bem mais clientes, sem apontar defeito específico. Ofereça melhorar, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [
          `${hi(x, "Oi", c)} ${who(c)}`,
          `${praise(x, n)} Vi também ${x.v ? "o seu site" : "o site de vocês"} e acho que ele pode atrair e agendar bem mais clientes.`,
          "Eu faço sites assim. Posso te contar como?",
        ];
      },
    },
    {
      id: "ideias",
      label: "Tenho ideias",
      brief: "Você conheceu o site dele e tem ideias para deixá-lo mais moderno e fácil de agendar, sem apontar defeito específico. Pergunte se pode contar quais.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [`${hi(x, "Olá", c)} ${who(c)}`, `Conheci ${x.site}${proof(l)} e tenho ideias para deixá-lo mais moderno e fácil de agendar.`, "Posso te contar quais?"];
      },
    },
    {
      id: "clientes",
      label: "Atrair clientes",
      brief: "Você passou pelo site dele e ficou com ideias para atrair mais clientes da região. Mostre essa dor e ofereça cuidar disso, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [`${hi(x, "Oi", c)} ${who(c)}`, `Passei por ${x.site}${proof(l)} e fiquei com ideias para atrair mais clientes de ${place(l)}.`, "Eu cuido disso. Posso te explicar?"];
      },
    },
    {
      id: "direta",
      label: "Direta, curta",
      brief: "Duas mensagens curtíssimas: quem você é, e uma só frase com o que viu no site, a solução e a pergunta.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [`${hi(x, "Oi", c)} ${who(c)}`, `Vi ${x.site}${proof(l)} e tenho ideias para melhorá-lo. ${qa(c, "talk")}`];
      },
    },
    {
      id: "simples",
      label: "Simples, em três linhas",
      brief: "Três mensagens curtas e simples: quem você é; que viu o site dele e vê espaço para melhorar, sem apontar defeito específico; e que faz sites assim, com uma pergunta fácil.",
      build: (l, c, n) => {
        const x = voice(l, n);
        return [`${hi(x, "Oi", c)} ${who(c)}`, `Vi ${x.site}${proof(l)} e vejo espaço para melhorar.`, `Faço sites assim. ${qa(c, "talk")}`];
      },
    },
  ],
};

// ───────────────────────── a abertura curta ─────────────────────────

/**
 * Nome curto para dizer em voz alta: o do negócio sem slogan, sem a lista de serviços depois de ":" ou "," e com no máximo 30
 * caracteres ("SS Odontologia Jangurussu: Prótese, Ortodontia, Dentista" vira "SS Odontologia Jangurussu").
 */
export function callName(lead: Pick<TemplateLead, "name">): string {
  // "Funilaria, Pintura e Estética Automotiva - Marcelo Martelo de Ouro": quando o começo é uma lista de serviços, o nome é o que vem depois do traço
  const [head, ...tail] = lead.name.split(/\s[-–—|]\s/);
  const brand = head.includes(",") ? tail.map((t) => shortName(t)).find((t) => t.length >= 4 && t.length <= 30 && !t.includes(",")) : undefined;
  // sem o que vem depois de ":" ou "|" e sem o que está entre parênteses ("Soriel Odontologia (UNIDADE 2)")
  const base = (brand ?? shortName(lead.name)).replace(/\s*\([^)]*\)/g, "").split(/[:|]/)[0].trim();
  if (base.length <= 30) return base;
  let out = "";
  for (const word of base.split(" ")) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > 30) break;
    out = next;
  }
  return trimDangling(out || base.slice(0, 30).trim());
}

/** Negócios em que o tom é de conversa de balcão ("Opa, pessoal!"): barbearia, oficina, martelinho, pet shop... Nunca advocacia nem contabilidade. */
const CASUAL_NICHES = /\b(barbear\w*|barbeir\w*|oficina|mecanic\w*|martelinho|automotiv\w*|lava ?jato|funilaria|borracharia|pet ?shop|pizzaria|hamburguer\w*|lanchonete|academia|tatuag\w*)\b/;

export function isCasual(lead: Pick<TemplateLead, "name" | "category" | "niche">): boolean {
  return !isFormal(lead) && CASUAL_NICHES.test(norm(`${lead.niche ?? ""} ${lead.category ?? ""} ${lead.name}`));
}

/**
 * Os cumprimentos da abertura curta. "Bom dia" é trocado por "Boa tarde" ou "Boa noite" na hora do envio (veja `greeting.ts`),
 * porque o texto é escrito de madrugada e sai de manhã ou de tarde. O primeiro nome vai só quando o nome do negócio é de gente.
 */
const SHORT_GREETS: ((v: string | null, casual: boolean) => string)[] = [
  (v) => (v ? `Bom dia, ${v}!` : "Bom dia!"),
  (v) => (v ? `Oi, ${v}!` : "Oi!"),
  (v) => (v ? `Olá, ${v}!` : "Olá!"),
  (v) => (v ? `${v}, bom dia!` : "Bom dia, pessoal!"),
  (v) => (v ? `Olá, ${v}, bom dia!` : "Olá, bom dia!"),
  (v, casual) => (casual ? (v ? `Opa, ${v}!` : "Opa, pessoal!") : v ? `${v}, olá!` : "Olá, pessoal!"),
];
/** Advocacia e contabilidade: sóbrio, sem exclamação nem "oi". */
const SHORT_GREETS_FORMAL: ((v: string | null) => string)[] = [
  (v) => (v ? `Bom dia, ${v}.` : "Bom dia."),
  (v) => (v ? `Olá, ${v}.` : "Olá."),
  (v) => (v ? `${v}, bom dia.` : "Bom dia, prezados."),
];

/** Só o primeiro nome: a apresentação completa (nome inteiro e o que faz) vem na resposta, quando a pessoa já respondeu. */
const SHORT_INTROS: ((c: TemplateContext) => string)[] = [
  (c) => `Aqui é o ${c.senderName}.`,
  (c) => `${c.senderName} aqui.`,
  (c) => `Meu nome é ${c.senderName}.`,
  (c) => `Sou o ${c.senderName}.`,
];

/** "Bom dia, Dra. Liane! Aqui é o Jonathan." */
function shortOpen(l: TemplateLead, c: TemplateContext): string {
  const v = addressee(l.name);
  const g = c.style?.greet ?? 0;
  const greet = isFormal(l) ? SHORT_GREETS_FORMAL[g % SHORT_GREETS_FORMAL.length](v) : SHORT_GREETS[g % SHORT_GREETS.length](v, isCasual(l));
  return `${greet} ${SHORT_INTROS[(c.style?.intro ?? 0) % SHORT_INTROS.length](c)}`;
}

/** Um dos jeitos de fazer a pergunta (o estilo escolhe qual); sem estilo, o primeiro. */
const shortAsk = (c: TemplateContext, list: string[]) => list[(c.style?.ask ?? 0) % list.length];

const QUICK_ASKS = ["Posso te fazer uma pergunta rápida?", "Posso te perguntar uma coisa?", "Tem um minutinho para te perguntar uma coisa?"];

/**
 * Os jeitos de puxar assunto da abertura curta. TODOS são UMA mensagem de uma pergunta só, sem falar do que o Jonathan vende:
 * o objetivo é a pessoa responder (uma conversa de verdade é o que o WhatsApp espera de uma conta saudável). Quem apresenta o
 * assunto, com o elogio e a dor, é a resposta do agente depois que a pessoa respondeu.
 */
export const SHORT_ANGLES: Angle[] = [
  {
    id: "c-confirma",
    label: "Confirma o contato",
    brief: "Pergunte, numa frase só, se aquele é o WhatsApp do negócio. Nada além disso.",
    available: (l) => addressee(l.name) === null,
    build: (l, c, n) => [`${shortOpen(l, c)} ${shortAsk(c, [`Esse é o WhatsApp de ${n}?`, `Falo com quem cuida de ${n}?`, `Estou falando com ${n} mesmo?`])}`],
  },
  {
    id: "c-google",
    label: "Vi no Google",
    brief: "Diga que viu o perfil dele no Google e peça licença para fazer uma pergunta rápida.",
    build: (l, c, n) => [`${shortOpen(l, c)} Vi ${addressee(l.name) ? "seu perfil" : `o perfil de ${n}`} no Google. ${shortAsk(c, QUICK_ASKS)}`],
  },
  {
    id: "c-contato",
    label: "Achei o contato",
    brief: "Diga de onde veio o contato (o Google) e peça licença para fazer uma pergunta rápida.",
    build: (l, c, n) => [`${shortOpen(l, c)} Achei ${addressee(l.name) ? "seu contato" : `o contato de ${n}`} no Google. ${shortAsk(c, [...QUICK_ASKS].reverse())}`],
  },
  {
    id: "c-quem",
    label: "Quem cuida",
    brief: "Pergunte quem cuida da divulgação do negócio.",
    build: (l, c, n) => {
      const asks = addressee(l.name)
        ? ["Quem cuida da sua divulgação por aí?", "Quem é que cuida da sua divulgação?", "Com quem eu falo sobre a sua divulgação?"]
        : [`Quem cuida da divulgação de ${n}?`, `Com quem eu falo sobre a divulgação de ${n}?`, `Quem é o responsável pela divulgação de ${n}?`];
      return [`${shortOpen(l, c)} ${shortAsk(c, asks)}`];
    },
  },
  {
    id: "c-rapida",
    label: "Pergunta rápida",
    brief: "Diga que tem uma pergunta rápida e peça licença para fazer.",
    build: (l, c, n) => {
      const v = addressee(l.name);
      return [`${shortOpen(l, c)} ${shortAsk(c, [`Tenho uma pergunta rápida ${v ? "para você" : `sobre ${n}`}. Posso fazer?`, `Posso te fazer uma pergunta rápida sobre ${v ? "o seu negócio" : n}?`, "Queria te perguntar uma coisa rápida. Posso?"])}`];
    },
  },
  {
    id: "c-oi",
    label: "Só um oi",
    brief: "Só cumprimente, diga o seu primeiro nome e pergunte se está tudo bem.",
    build: (l, c) => [`${shortOpen(l, c)} ${shortAsk(c, ["Tudo bem?", "Tudo certo por aí?", "Como vão as coisas por aí?"])}`],
  },
];

/** Os ângulos da abertura curta que servem a este lead. */
export function availableShortAngles(lead: TemplateLead): Angle[] {
  return SHORT_ANGLES.filter((a) => !a.available || a.available(lead));
}

/** O ângulo da abertura curta: o do estilo, se houver e servir; senão estável por lead (o mesmo lead sempre cai no mesmo). */
export function shortAngleFor(lead: TemplateLead, style?: Pick<OpeningStyle, "angle"> | null): Angle {
  const list = availableShortAngles(lead);
  return (style?.angle ? list.find((a) => a.id === style.angle) : undefined) ?? list[pickVariant(lead.id, list.length)];
}

export function openingGroup(kind: WebsiteKind): OpeningGroup {
  if (kind === "none") return "none";
  if (kind === "social") return "social";
  return "weak";
}

/** O ângulo deste lead: o do estilo, se houver; senão estável (o mesmo lead sempre cai no mesmo) e espalhado entre os leads. */
export function angleFor(lead: TemplateLead, style?: Pick<OpeningStyle, "angle"> | null): Angle {
  const list = ANGLES[openingGroup(lead.websiteKind)];
  const chosen = style?.angle ? list.find((a) => a.id === style.angle) : undefined;
  // sem estilo, o ângulo "simples" não entra no sorteio: o texto de cada lead continua o de sempre
  const base = list.filter((a) => a.id !== "simples");
  return chosen ?? base[pickVariant(lead.id, base.length)];
}

export interface OpeningText {
  body: string;
  variant: string;
  /** Os parágrafos, cada um uma mensagem. */
  parts: string[];
  group: OpeningGroup;
  /** O ângulo usado (fluxo "qualificar"); no fluxo antigo, o número do modelo. */
  angle: string;
}

/** Limpa os parágrafos da abertura. Sem a linha "responda PARE": a primeira mensagem é só conversa. */
export function assembleOpening(parts: string[]): string[] {
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function buildOpening(lead: TemplateLead, ctx: TemplateContext): OpeningText {
  const group = openingGroup(lead.websiteKind);
  const nome = shortName(lead.name);
  if (ctx.flow === "qualificar" && ctx.mode === "curta") {
    const angle = shortAngleFor(lead, ctx.style);
    const parts = assembleOpening(angle.build(lead, ctx, callName(lead)));
    const suffix = ctx.style ? `~${styleCode(ctx.style)}` : "";
    return { body: parts.join("\n\n"), variant: `abertura-${group}-${angle.id}${suffix}`, parts, group, angle: angle.id };
  }
  if (ctx.flow === "qualificar") {
    const angle = angleFor(lead, ctx.style);
    const parts = assembleOpening(angle.build(lead, ctx, nome));
    const suffix = ctx.style ? `~${styleCode(ctx.style)}` : "";
    return { body: parts.join("\n\n"), variant: `abertura-${group}-${angle.id}${suffix}`, parts, group, angle: angle.id };
  }
  const list = OPENINGS[group];
  const i = pickVariant(lead.id, list.length);
  const body = list[i](lead, ctx, nome);
  return { body, variant: `abertura-${group}-${i + 1}`, parts: body.split("\n\n"), group, angle: String(i + 1) };
}

/**
 * O 1º follow-up de quem recebeu a abertura curta e não respondeu: uma mensagem só, que já diz o que foi visto e o que falta
 * (a nota só quando é boa), com uma pergunta fácil. Advocacia e contabilidade ficam sóbrias.
 */
function shortFollowUp(lead: TemplateLead, ctx: TemplateContext): string {
  const x = voice(lead, callName(lead));
  const s = ctx.senderName;
  if (x.formal) {
    return `Olá${x.v ? `, ${x.v}` : ""}. Retomo uma única vez a minha mensagem: gostaria de falar de um site que apresente o seu trabalho com clareza. Posso explicar? ${OUT}`;
  }
  const greet = `Bom dia${x.v ? `, ${x.v}` : ""}!`;
  const ask = lead.websiteKind === "none" || lead.websiteKind === "social" ? "Posso te contar como resolvo isso?" : "Posso te contar quais?";
  const build = (withProof: boolean) => {
    const seen = withProof ? x.seen : `Vi ${x.v ? "seu perfil" : `o perfil de ${callName(lead)}`} no Google`;
    const situation =
      lead.websiteKind === "none"
        ? `${seen}, mas não achei um site ${x.v ? "seu" : "de vocês"}.`
        : lead.websiteKind === "social"
          ? `${seen}, mas só achei o Instagram, sem site.`
          : `Vi ${x.site}${withProof ? proof(lead) : ""} e tenho ideias para melhorá-lo.`;
    return `${greet} ${s} aqui de novo. ${situation} ${ask} ${OUT}`;
  };
  // nome comprido: a nota sai para a cutucada caber numa mensagem curta
  const body = build(true);
  return body.length > 190 ? build(false) : body;
}

/**
 * O 1º follow-up de quem só recebeu a resposta automática do negócio (nenhuma pessoa escreveu): em vez de repetir a abertura, diz que
 * a mensagem caiu no atendimento automático e pergunta quem cuida da divulgação. Uma pergunta só, com a saída, curta.
 */
export function buildBotFollowUp(lead: TemplateLead, ctx: TemplateContext): { body: string; variant: string } {
  const v = addressee(lead.name);
  const nome = shortName(lead.name);
  const s = ctx.senderName;
  const build = (where: string) => {
    if (isFormal(lead)) return `Olá${v ? `, ${v}` : ""}. A minha mensagem foi respondida pelo atendimento automático. Poderia me indicar quem cuida da divulgação${where}? ${OUT}`;
    const ask = v ? "Você consegue me responder por aqui, ou quem cuida da divulgação?" : `Quem cuida da divulgação${where} consegue falar comigo por aqui?`;
    return `Bom dia${v ? `, ${v}` : ""}! ${s} de novo. Minha mensagem caiu no atendimento automático. ${ask} ${OUT}`;
  };
  // nome comprido: sai da pergunta para a cutucada continuar curta
  const body = build(v ? "" : ` da ${nome}`);
  return { body: body.length > 190 ? build(v ? "" : " daí") : body, variant: "followup-bot" };
}

export function buildFollowUp(
  lead: TemplateLead,
  step: 1 | 2,
  ctx: TemplateContext,
): { body: string; variant: string } {
  const nome = shortName(lead.name);
  if (ctx.flow === "qualificar") return buildQualifyFollowUp(lead, step, ctx, nome);
  if (step === 1) {
    return {
      body: `Oi, ${ctx.senderName} da ${ctx.brandName} de novo. Viu minha mensagem sobre o site da ${nome}? Se quiser a prévia, é só responder "pode". ${OUT}`,
      variant: "followup-1",
    };
  }
  return {
    body: `Última mensagem, prometo. Se um dia quiser ver como ficaria o site da ${nome}, é só me chamar. Abraço, ${ctx.senderName}. ${OUT}`,
    variant: "followup-2",
  };
}

/**
 * O follow-up do fluxo "qualificar". Mesmas regras de ouro (curto, sem link, sem prévia, com a saída), com o que 26/10 mostrou:
 * chamar a pessoa pelo nome quando ele aparece ("Oi, Dra. Fernanda!") em vez de repetir o nome inteiro da empresa ("o site da
 * Dra. Fernanda Teixeira Advogados Associados"), um jeito mais leve de puxar de volta ("só passando para saber") e, em advocacia
 * e contabilidade, um tom sóbrio, sem "de novo" nem intimidade.
 */
function buildQualifyFollowUp(lead: TemplateLead, step: 1 | 2, ctx: TemplateContext, nome: string): { body: string; variant: string } {
  const v = addressee(lead.name);
  const formal = isFormal(lead);
  const s = ctx.senderName;
  // a abertura curta não falou de site: se ninguém respondeu, a cutucada já traz o assunto (uma mensagem só, com uma pergunta)
  if (step === 1 && ctx.mode === "curta") return { body: shortFollowUp(lead, ctx), variant: "followup-1" };
  if (step === 1) {
    const body = formal
      ? `Olá${v ? `, ${v}` : ""}. Retomo uma única vez a minha mensagem sobre o site${v ? "" : ` da ${nome}`}. Se houver interesse, é só responder "pode". ${OUT}`
      : v
        ? `Bom dia, ${v}! Aqui é o ${s} de novo. Só passando para saber se você viu minha mensagem sobre o site. Se fizer sentido, é só responder "pode". ${OUT}`
        : `Bom dia! Aqui é o ${s} de novo. Vocês viram minha mensagem sobre o site da ${nome}? Se fizer sentido, é só responder "pode". ${OUT}`;
    return { body, variant: "followup-1" };
  }
  const body = formal
    ? `Esta é a minha última mensagem${v ? `, ${v}` : ""}. Se um dia houver interesse em um site${v ? "" : ` para a ${nome}`}, é só me chamar. ${OUT}`
    : `Última mensagem, prometo${v ? `, ${v}` : ""}. Se um dia quiser um site${v ? "" : ` para a ${nome}`}, é só me chamar. Abraço, ${s}. ${OUT}`;
  return { body, variant: "followup-2" };
}
