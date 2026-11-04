/**
 * O "jeito" de uma abertura: quatro peças que se combinam (saudação, apresentação, pergunta final e ângulo). O WhatsApp
 * derruba contas que mandam o mesmo texto para muita gente; por isso cada abertura sai com uma combinação diferente das
 * recentes (veja `variation.ts`). Aqui ficam só os tipos, as tabelas e o código curto que a variante da mensagem carrega
 * (`abertura-none-elogio~g1i2q3`), para o painel saber depois o que já foi usado.
 */

export interface OpeningStyle {
  /** Qual saudação ("Oi, Dra. X!", "Dra. X, oi!", "Olá, Dra. X."...). */
  greet: number;
  /** Como a pessoa se apresenta ("Sou o…", "Aqui é o…", "…aqui", "Prazer, …"). */
  intro: number;
  /** Qual jeito de fazer a pergunta final. */
  ask: number;
  /** Como ele diz o que faz ("desenvolvedor", "desenvolvedor de sites"...). Ausente = o texto das Configurações. */
  role?: number;
  /** O ângulo (id do banco de ângulos). Nulo = o de sempre do lead. */
  angle: string | null;
}

export const STYLE_SIZES = { greet: 5, intro: 5, ask: 4, role: 8 } as const;

/**
 * O jeito da primeira abordagem. "curta": UMA mensagem curtinha (cumprimento, o primeiro nome e uma pergunta fácil) feita só para
 * a pessoa responder; quem apresenta o assunto é a resposta do agente. "completa": as três mensagens de sempre (quem sou, o
 * elogio com a dor e a solução com a pergunta).
 */
export type OpeningMode = "curta" | "completa";

/** As peças do modo curto: saudações, apresentações e jeitos de fazer a pergunta (cada ângulo tem os seus). Sem "role". */
export const STYLE_SIZES_SHORT = { greet: 6, intro: 4, ask: 3 } as const;

/** Esta variante é de uma abertura curta? Os ângulos do modo curto começam com "c-" ("abertura-none-c-google~g1i2q0"). */
export function isShortVariant(variant: string | null | undefined): boolean {
  return !!variant && /^abertura-(?:none|social|weak)-c-/.test(variant);
}

export function styleCode(s: Pick<OpeningStyle, "greet" | "intro" | "ask" | "role">): string {
  return `g${s.greet}i${s.intro}q${s.ask}${s.role !== undefined ? `r${s.role}` : ""}`;
}

/** Lê o código de estilo no fim da variante. Nulo se a variante não tem. (O "r" do ofício não existe nas variantes antigas.) */
export function parseStyleCode(variant: string | null | undefined): Pick<OpeningStyle, "greet" | "intro" | "ask" | "role"> | null {
  const m = variant ? /~g(\d+)i(\d+)q(\d+)(?:r(\d+))?$/.exec(variant) : null;
  return m ? { greet: Number(m[1]), intro: Number(m[2]), ask: Number(m[3]), ...(m[4] !== undefined ? { role: Number(m[4]) } : {}) } : null;
}

/** A variante sem o código de estilo: é ela que agrupa o teste A/B por ângulo. */
export function stripStyle(variant: string): string {
  return variant.replace(/~g\d+i\d+q\d+(?:r\d+)?$/, "");
}

/** Perguntas finais que significam o mesmo; a primeira é a de sempre (sem estilo, só ela sai). */
export const EXPLAIN_ASKS = [
  "Posso te explicar como funciona?",
  "Quer que eu te explique como funciona?",
  "Faz sentido eu te explicar como funciona?",
  "Posso te mostrar como funciona?",
] as const;

export const TALK_ASKS = [
  "Vale uma conversa rápida?",
  "Podemos conversar rapidinho?",
  "Topa uma conversa rápida?",
  "Posso te chamar para uma conversa rápida?",
] as const;
