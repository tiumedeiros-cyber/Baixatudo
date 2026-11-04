import { norm } from "@/lib/utils";
import type { Message } from "./types";

/**
 * Muitos negócios têm resposta automática no WhatsApp (mensagem de ausência, saudação do WhatsApp Business, menu com
 * "digite 1, 2, 3", robô de atendimento). Elas chegam logo depois da nossa abordagem e NÃO são o dono respondendo: o agente
 * não conversa com elas (viraria um papo de robô com robô, e a nossa pergunta cairia no vazio), não contam como resposta no
 * painel e não mudam a etapa do lead. A mensagem fica gravada, marcada, para o dono ver. Quando a pessoa de verdade
 * responder, a conversa segue normalmente de onde estava.
 *
 * Marcamos pela variante da mensagem recebida (`AUTO_REPLY_VARIANT`) e não por uma intenção nova, para não depender de
 * mudança no banco: a coluna `variant` já existe e é livre.
 */

export const AUTO_REPLY_VARIANT = "resposta-automatica";

export type AutoReplyKind = "menu" | "away" | "intake" | "ack" | "greeting" | "bot";

export interface AutoReplyCheck {
  auto: boolean;
  kind: AutoReplyKind | null;
  score: number;
  /** O que pesou na decisão (para os testes e para o registro do painel). */
  reasons: string[];
}

/** A mensagem recebida foi marcada como resposta automática do negócio. */
export function isAutoReplyMessage(m: Pick<Message, "direction" | "variant">): boolean {
  return m.direction === "in" && m.variant === AUTO_REPLY_VARIANT;
}

// Tudo é comparado sem acento e em minúsculas.
/**
 * A mensagem se declara automática. Só vale quando ela mesma se rotula (em negrito, entre parênteses, em linha própria) ou
 * diz que é a assistente virtual: quem apenas FALA de resposta automática ("já uso uma resposta automática") ou pede um
 * chatbot é uma pessoa de verdade.
 */
const LABEL = String.raw`(mensagem|resposta|atendimento|saudacao) (automatic[ao]|programad[ao])`;
const LABELLED = new RegExp(String.raw`[*_(\[]\s*${LABEL}\s*[*_)\]]`);
const OWN_LINE = new RegExp(String.raw`^\W*(esta e |essa e |isso e )?(uma )?${LABEL}\W*$`);
const SELF_DECLARED =
  /(esta|essa) e uma (mensagem|resposta) automatica|\b(sou|aqui e) (a|o|um|uma) (assistente|atendente) virtual\b|\bsou (um|o|a) ?(chat ?bot|robo)\b|nao responda (a )?esta mensagem|este (e )?(um )?(canal|atendimento) (automatico|exclusivo)/;

const AWAY: RegExp[] = [
  /nao (estamos|estou|podemos|posso) (disponivel|disponiveis|atendendo|atender)/,
  /(no momento|agora) (nao )?(estamos|estou) (fora|ausente|indisponiv\w+|sem)/,
  /\b(responderemos|retornaremos|retornamos|entraremos em contato|responderei)\b/,
  /fora do horario|estamos fora|horario de atendimento|horario de funcionamento|(funcionamos|atendemos) (de|das|nas?|aos|ate) /,
  /em breve (retornaremos|responderemos|te atend\w+|um (de nossos )?(atendente|consultor))/,
  /assim que possivel/,
];

const GREETING: RegExp[] = [
  /seja (muito )?bem[- ]?vind\w+/,
  /bem[- ]?vind\w+ (a|ao|as|aos|de volta)\b/,
  /que bom (ter|receber) (voce|vc) (aqui|por aqui)/,
  /agradecemos (o|seu|sua|pelo|pela) (contato|mensagem|interesse|preferencia)/,
  /obrigad[oa] pel[oa] (contato|mensagem|interesse|preferencia)/,
];

/**
 * Frases de modelo pronto, que uma pessoa dificilmente escreve respondendo a uma mensagem fria. Bastam sozinhas, mesmo em texto
 * curto ("Martins Detailer agradece seu contato. Como podemos ajudar?" é a saudação do WhatsApp Business, não o dono). Um "Como
 * posso ajudar?" solto NÃO está aqui: é o que uma pessoa de verdade também responde.
 */
const TEMPLATE_MARKERS: RegExp[] = [
  // o negócio falando de si na terceira pessoa: "Dalida Massoterapeuta agradece seu contato" (e o erro de digitação "aradece")
  /\b(agradece|aradece|agradese)\s+(o |seu |sua |pelo |pela )?(contato|mensagem|interesse|preferencia)\b/,
  // "bem-vindo(a)" e "bem-vinda(o)": a letra do outro gênero entre parênteses é de modelo
  /\bbem[- ]?vind[oa]\s*\([oa]\)/,
];

/** Jeito de falar das saudações de clínica e loja ("será um prazer cuidar de você", "me conta qual..."): pesa pouco sozinho. */
const SOFT_GREETING: RegExp[] = [
  /\b(sera|e) um prazer (cuidar|atender|ajudar|ter voce)/,
  /para (eu )?te ajudar melhor/,
  /me conta[:,]?\s*\W*(qual|o que|como)/,
  // "se precisar de agendamento ou informações, estamos aqui para ajudar", "estou aqui para te receber"
  /estamos aqui para (te |lhe |vos )?(ajudar|atender)/,
  /estou aqui para (te |lhe )?(receber|ajudar|atender)/,
  /antes de (iniciar|comecar) (qualquer )?(tratamento|atendimento|procedimento)/,
  /conheca (mais )?(sobre )?(o )?nosso trabalho/,
  // "É um prazer tê-lo conosco", "Em que podemos ajudar?": a recepção de modelo de uma clínica, não a resposta à nossa pergunta
  /\be um prazer te-?\s*lo\b|\bprazer (em )?(te|lhe) (receber|atender)\b|\bem que (podemos|posso) (te |lhe )?ajudar\b/,
];

/**
 * A saudação de modelo inteira em poucas palavras ("Seja bem-vindo."): curta demais para pontuar, mas ninguém responde a uma
 * mensagem fria com só isso. Vale sozinha.
 */
const STOCK_WELCOME = /^\W*(?:(?:oi|ola)\W+)?seja\s+(?:muito\s+)?bem[- ]?vind[oa]s?\W*(?:\([oa]\)\W*)?$/;

/**
 * Atendimento que COLETA DADOS de quem escreve: pede nome, serviço, e-mail, CPF ou o procedimento de interesse. É roteiro de
 * recepção (de robô ou de secretária de script), não resposta à nossa mensagem. Cada frase vale uma vez.
 */
const INTAKE: RegExp[] = [
  /para agilizar (o |seu |nosso )?atendimento/,
  /\b(informe|informar|escreva|diga|passe|me informe|nos informe)\b.{0,40}\b(seu nome|nome completo|e-?mail|cpf|servico|procedimento|tratamento|horario)/,
  /qual (o )?(procedimento|tratamento|servico).{0,25}(interesse|deseja|procura|gostaria|quer)|(procedimento|tratamento|servico) (de|que) (seu )?interesse/,
];

/**
 * "Recebemos sua proposta… encaminhei para a equipe… alguém responderá": o recebimento automático de quem tem um assistente de IA
 * ou uma mensagem de modelo para propostas. Uma recepcionista pode escrever igual, então isto SÓ vale quando a mensagem chega
 * em segundos, no primeiro contato (veja `fast`): ninguém lê e responde uma proposta fria em 1 minuto, mas um robô sim.
 */
const ACKNOWLEDGE: RegExp[] = [
  /recebemos (a |sua |a sua )?(proposta|mensagem|solicitacao|contato)/,
  /(ja )?encaminh(ei|amos) (para|a) (a |nossa )?(equipe|setor|time)/,
  /(alguem|um atendente|nossa equipe|a equipe) (respondera|retornara|entrara em contato|dara sequencia|avalia)/,
  /dara sequencia se houver interesse/,
];

const MENU_PHRASE =
  /digite( o numero| \*?\d\*?| a opcao)|escolha (uma|a) (das )?(opcao|opcoes)|selecione (uma|a) opcao|como posso (te )?(direcionar|ajudar hoje)|menu (de|principal)|para .{2,40}(digite|envie|responda) \*?\d\*?/;

const KEYCAP = /[0-9#*]️?⃣/gu;
const NUMBERED_LINE = /^\s*\*?\d{1,2}\s*[-).–—:]\s*\S/gm;
const BOLD = /\*[^*\n]{2,80}\*/g;
const URL = /https?:\/\/\S+|www\.\S+/gi;
const ADDRESS = /\b(rua|av\.|avenida|cep|bairro)\b|\u{1F4CD}/u;

const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/**
 * Decide se o texto parece resposta automática de um negócio. É uma pontuação: sinais fortes (a própria mensagem diz que é
 * automática, é um menu numerado ou é uma frase de modelo pronto, como "X agradece seu contato" e "bem-vindo(a)") bastam; sinais médios (horário de atendimento, "seja bem-vindo", muitos negritos e
 * emojis) precisam se somar. Uma frase solta como "obrigado pelo contato" ou "agora não estou disponível" NÃO basta, para
 * uma pessoa de verdade nunca ser tratada como robô. Texto curto só vale se disser que é automático.
 */
export function detectAutoReply(text: string | null | undefined, opts: { fast?: boolean } = {}): AutoReplyCheck {
  const raw = (text ?? "").trim();
  const none: AutoReplyCheck = { auto: false, kind: null, score: 0, reasons: [] };
  if (!raw) return none;
  const plain = norm(raw).replace(/\s+/g, " ");
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, why: string) => {
    score += points;
    reasons.push(why);
  };

  const lines = raw.split("\n").map((l) => norm(l).replace(/\s+/g, " ").trim());
  const explicit = LABELLED.test(plain) || SELF_DECLARED.test(plain) || lines.some((l) => OWN_LINE.test(l)) || STOCK_WELCOME.test(plain.replace(/\p{Extended_Pictographic}/gu, " ").trim());
  if (explicit) add(3, "diz que é automática");

  const keycaps = count(KEYCAP, raw);
  const numbered = count(NUMBERED_LINE, raw);
  const menu = keycaps >= 2 || numbered >= 3 || MENU_PHRASE.test(plain);
  if (menu) add(3, "menu de opções");

  const away = AWAY.filter((re) => re.test(plain)).length;
  if (away > 0) add(Math.min(4, away * 2), "aviso de ausência ou horário");

  if (GREETING.some((re) => re.test(plain))) add(2, "saudação de boas-vindas");

  if (TEMPLATE_MARKERS.some((re) => re.test(plain))) add(3, "frase de modelo pronto");

  const soft = SOFT_GREETING.filter((re) => re.test(plain)).length;
  if (soft > 0) add(Math.min(2, soft), "jeito de saudação de negócio");

  const intake = INTAKE.filter((re) => re.test(plain)).length;
  if (intake > 0) add(Math.min(4, intake * 2), "pede nome, serviço ou dados (atendimento de recepção)");

  // Chegou em segundos, no primeiro contato: só assim se reconhece o recebimento automático de proposta.
  const ack = opts.fast ? ACKNOWLEDGE.filter((re) => re.test(plain)).length : 0;
  if (ack > 0) add(Math.min(4, ack * 2), "recebimento automático da proposta (chegou em segundos)");
  // O tempo só reconhece o recebimento automático. Chegar rápido, sozinho, nunca faz uma pessoa virar robô ("obrigado pelo
  // contato, vou ver com meu sócio" respondido em 1 minuto é gente).

  if (count(BOLD, raw) >= 3) add(1, "vários trechos em negrito");
  if (count(URL, raw) > 0 && raw.length > 150) add(1, "link em mensagem longa");
  if (count(/\p{Extended_Pictographic}/gu, raw) >= 4) add(1, "muitos emojis");
  if (ADDRESS.test(raw) && /\d{1,2}\s*h|\d{1,2}:\d{2}/.test(plain)) add(1, "endereço e horário");
  if (raw.length > 280) add(1, "texto longo");

  if (!explicit && plain.length < 25) return none;
  if (score < 3) return { ...none, score, reasons };
  const kind: AutoReplyKind = menu
    ? "menu"
    : away > 0
      ? "away"
      : intake > 0
        ? "intake"
        : ack > 0
          ? "ack"
          : explicit && !GREETING.some((re) => re.test(plain))
            ? "bot"
            : "greeting";
  return { auto: true, kind, score, reasons };
}

// ───────────────────────── menu de robô ─────────────────────────

export interface MenuChoice {
  /** O que digitar: o número da opção. */
  option: string;
  /** A opção escolhida, como o robô a escreveu (sem emoji nem acento). */
  label: string;
}

/** Uma linha de menu: "1️⃣ Agendamento", "2- Consulta por convênio", "Digite 3 se não for paciente", "1) Setor financeiro". */
const MENU_LINE = /^\W*(?:digite\s+(?:o\s+)?(?:numero\s+)?)?\*?(\d{1,2})\*?\W*(.*)$/u;

/** O que leva a uma pessoa: atendente, recepção, outros assuntos, dúvidas, comercial, parcerias. */
const TO_A_PERSON = /atendente|humano|recepc|secretaria|falar com (alguem|uma pessoa|a clinica|o setor)|outros? assuntos?|outras? (duvidas?|informacoes?)|duvidas?\b|informacoes\b|sac\b|ouvidoria|administrativ|comercial|parceria|fornecedor|marketing/;
/** Quem não é paciente nem indicação: a opção "nenhuma das anteriores" dos menus de clínica. */
const NEITHER = /nem (paciente|indicacao|cliente)|nao (for|sou|e|seja|ser) (paciente|cliente)\b.*\bnem\b|nenhuma das|nenhum dos/;
/** Opções que fariam o robô abrir um agendamento, cobrança ou resultado em nome de um paciente que não existe. */
const NOT_FOR_US = /agend|marcar|marcacao|consulta|avaliacao|financeiro|pagament|boleto|segunda via|resultado|exame|convenio|particular|orcamento|urgencia|emergencia|cancel|remarc|ja (e|sou) (paciente|cliente)/;

/**
 * Escolhe a opção do menu que leva a uma pessoa de verdade, ou nenhuma. Só vale quando a opção diz com clareza que é um atendente,
 * "outros assuntos", dúvidas, comercial, parcerias ou "não sou paciente nem indicação". Nunca escolhe agendamento, financeiro,
 * convênio ou resultado: o robô abriria um atendimento que não existe. Menu sem opção assim (ou aberto, "digite o que deseja")
 * volta nulo e o agente espera uma pessoa.
 */
export function menuChoice(text: string | null | undefined): MenuChoice | null {
  const options: { n: string; label: string }[] = [];
  for (const line of (text ?? "").split("\n")) {
    const m = MENU_LINE.exec(line.replace(/‎/g, ""));
    if (!m) continue;
    const label = norm(m[2]).replace(/\p{Extended_Pictographic}/gu, " ").replace(/[^a-z0-9\s?]/g, " ").replace(/\s+/g, " ").trim();
    if (label.length < 3) continue;
    if (options.some((o) => o.n === m[1])) continue;
    options.push({ n: m[1], label });
  }
  if (options.length < 2) return null;
  const person = options.find((o) => TO_A_PERSON.test(o.label) && !NOT_FOR_US.test(o.label));
  const pick = person ?? options.find((o) => NEITHER.test(o.label));
  return pick ? { option: pick.n, label: pick.label } : null;
}

export const AUTO_REPLY_LABEL: Record<AutoReplyKind, string> = {
  menu: "Menu automático",
  away: "Aviso de ausência",
  intake: "Atendimento automático que pede seus dados",
  ack: "Recebimento automático",
  greeting: "Saudação automática",
  bot: "Resposta automática",
};

/** Resposta que chega até 3 minutos depois da nossa mensagem (antes ou depois de ela ser marcada como enviada): robô responde em segundos. */
export const FAST_REPLY_MS = 3 * 60_000;

/** `inbound` chegou em segundos de `outbound`? Um robô pode responder à primeira parte enquanto as outras ainda saem: vale também o pouco antes. */
export function arrivedFast(inbound: string | number | Date, outbound: string | number | Date | null | undefined): boolean {
  if (outbound == null) return false;
  const gap = new Date(inbound).getTime() - new Date(outbound).getTime();
  return Number.isFinite(gap) && gap <= FAST_REPLY_MS && gap >= -FAST_REPLY_MS;
}
