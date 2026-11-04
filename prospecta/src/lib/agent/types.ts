import type { AgentFlow, WebsiteKind } from "@/lib/leads/types";
import type { Intent, Message } from "@/lib/outreach/types";
import type { InboundMedia } from "@/lib/outreach/classify";
import type { TemplateLead } from "@/lib/outreach/templates";
import type { Decisor } from "./decisor";

/**
 * Agente de atendimento. Lê o que o lead escreveu, entende o assunto, escreve a resposta no jeito do
 * dono e diz o que falta para vender. Nível 2 (assistido): tudo o que ele escreve vira RASCUNHO e só sai
 * depois do OK do dono. As travas de envio (PARE, janela, tetos) não passam por aqui e não mudam.
 */

/** O que o lead quis dizer. Fino demais para o banco (que só guarda `Intent`); vive só no agente. */
export const TOPICS = [
  "optout",
  "abusive",
  "source_of_contact",
  "who",
  "paid",
  "status_check",
  "price",
  "too_expensive",
  "guarantee",
  "payment",
  "domain_hosting",
  "timeline",
  "how_works",
  "send_info",
  "has_site",
  "has_provider",
  "no_need_site",
  "gatekeeper",
  "system_request",
  "wants_site",
  "wants_preview",
  "change_request",
  "compliment",
  "busy",
  "not_now",
  "think",
  "not_interested",
  "yes",
  "answer",
  "greeting",
  "thanks",
  "audio",
  "media",
  "casual",
  "other",
] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABEL: Record<Topic, string> = {
  optout: "Pediu para parar",
  abusive: "Agressivo ou desconfiado",
  source_of_contact: "Perguntou como achamos o número",
  who: "Perguntou quem é",
  paid: "Diz que pagou",
  status_check: "Cobrou o andamento",
  price: "Perguntou o preço",
  too_expensive: "Achou caro",
  guarantee: "Pediu garantia ou contrato",
  payment: "Perguntou do pagamento",
  domain_hosting: "Perguntou de domínio ou mensalidade",
  timeline: "Perguntou o prazo",
  how_works: "Perguntou como funciona",
  send_info: "Pediu exemplos ou informações",
  has_site: "Disse que já tem site",
  has_provider: "Já tem quem faça",
  no_need_site: "Acha que não precisa de site",
  gatekeeper: "Não é quem decide",
  system_request: "Quer um sistema",
  wants_site: "Quer um site",
  wants_preview: "Pediu uma prévia",
  change_request: "Pediu ajuste na prévia",
  compliment: "Gostou",
  busy: "Está sem tempo",
  not_now: "Agora não",
  think: "Vai pensar",
  not_interested: "Sem interesse",
  yes: "Quer ver",
  answer: "Respondeu à pergunta do agente",
  greeting: "Cumprimentou",
  thanks: "Confirmou (ok)",
  audio: "Mandou áudio",
  media: "Mandou imagem ou arquivo",
  casual: "Conversa solta (brincadeira, reunião)",
  other: "Fora do roteiro",
};

/**
 * Perguntas de descoberta. Uma por resposta, sem repetir, e só enquanto ajudam a próxima etapa.
 * "apresentacao" não é pergunta do roteiro: marca a resposta em que o agente se apresentou depois da abertura curta (veja `rules.ts`).
 */
export type DiscoveryId = "objetivo" | "tipo" | "escopo" | "material" | "dor" | "usuarios" | "integracoes" | "prazo" | "apresentacao";

/**
 * O que o lead quer comprar, inferido do que ele escreveu: um site (landing page ou site da empresa), um sistema ou uma
 * automação (robô, atendimento automático...). Sistema e automação têm valor sob medida, então são do dono.
 */
export type Product = "site" | "sistema" | "automacao";

export type NextActionKind =
  | "gerar_previa"
  | "fazer_previa"
  | "orcar_sistema"
  | "enviar_previa"
  | "criar_proposta"
  | "enviar_proposta"
  | "marcar_sinal"
  | "enviar_exemplos"
  | "ajustar_previa"
  | "ouvir_audio"
  | "responder"
  | "esperar";

export interface NextAction {
  kind: NextActionKind;
  label: string;
}

export type Heat = "frio" | "morno" | "quente" | "perdido" | "bloqueado";
export type Phase = "abertura" | "interesse" | "previa" | "proposta" | "fechado" | "perdido" | "bloqueado";
/** BANT em português: necessidade, autoridade, orçamento, prazo. Sempre inferido do que o lead escreveu. */
export type Bant = "sim" | "talvez" | "nao" | "desconhecido";

/** O resumo do lead, calculado só da conversa (sem coluna nova no banco). */
export interface Ficha {
  heat: Heat;
  phase: Phase;
  need: Bant;
  authority: Bant;
  budget: Bant;
  timing: Bant;
  /** Frases curtas do que o lead já mostrou, na ordem. */
  signals: string[];
  asked: DiscoveryId[];
  answers: Partial<Record<DiscoveryId, string>>;
  /** A conversa está esperando a resposta a uma pergunta de descoberta. */
  pending: DiscoveryId | null;
  /** Assunto da última mensagem do lead (com "answer" quando ela respondeu a uma pergunta do agente). */
  lastTopic: Topic | null;
  /** A pergunta de descoberta que a última mensagem do lead respondeu, se respondeu uma. */
  lastAnswered: DiscoveryId | null;
  repliesFromLead: number;
  /** Quem decide, quando a recepção (ou o próprio lead) falou dele: nome, celular, horário e quem passou. Nulo se a conversa não mostrou. */
  decisor: Decisor | null;
  /** O que ele quer comprar (null enquanto a conversa não mostrou). "sistema" vence se ele falou dos dois. */
  product: Product | null;
  /** O lead pediu para ver uma prévia (ou aceitou uma oferta de prévia). */
  previewAsked: boolean;
  /** O dono já mandou a prévia feita por ele (um link, pelo celular ou pelo painel) depois do pedido. */
  previewSentByOwner: boolean;
  /** O último pedido de prévia ainda não foi atendido: está na fila do dono. */
  previewPending: boolean;
  demo: { exists: boolean; sent: boolean; views: number };
  proposal: { status: string; amountCents: number } | null;
  nextAction: NextAction | null;
}

/** Os fatos que o agente PODE afirmar. Qualquer número fora disto é reprovado. */
export interface AgentFacts {
  /** Como a conversa é conduzida: com prévia automática ou qualificando e passando ao dono. */
  flow: AgentFlow;
  senderName: string;
  brandName: string;
  /** O nome completo e o que ele faz, para a resposta em que o agente se apresenta (depois da abertura curta). */
  senderFullName?: string;
  senderRole?: string;
  /** O valor de uma landing page ou site simples, em reais: o agente diz "fica em", nunca "a partir de". */
  priceFrom: number;
  deliveryDays: number;
  entryPct: number;
  pixKey: string;
  pixHolder: string;
  contactPhone: string;
  /** Texto livre do dono (o que vende, para quem, provas). Só a IA usa; as regras não citam. */
  offer: string;
  audience: string;
  proof: string;
  /**
   * O que o dono AUTORIZA o agente a responder por ele, com as palavras dele (Configurações). Preenchido, o assunto
   * correspondente sai sozinho com esse texto; vazio, continua com o dono.
   */
  policies: AgentPolicies;
}

export interface AgentPolicies {
  guarantee: string;
  hosting: string;
  payment: string;
  portfolio: string;
  price: string;
}

export interface AgentProposal {
  status: string;
  title: string;
  amountCents: number;
  entryPct: number;
  deliveryDays: number;
}

export interface AgentContext {
  lead: TemplateLead & { websiteKind: WebsiteKind };
  /** A conversa em ordem, sem rascunhos nem canceladas. */
  messages: Message[];
  inbound: { text: string | null; media: InboundMedia | null; intent: Intent };
  facts: AgentFacts;
  /** Link público da prévia (só quando o painel tem endereço público). */
  demoUrl: string | null;
  proposal: AgentProposal | null;
  ficha: Ficha;
}

export interface Handoff {
  needed: boolean;
  reason: string | null;
}

export interface AgentOutput {
  /** O rascunho. Nulo quando não há o que sugerir (o dono escreve). */
  reply: string | null;
  topic: Topic;
  source: "rules" | "ai";
  handoff: Handoff;
  nextAction: NextAction | null;
  /** Pergunta de descoberta feita nesta resposta. */
  asked: DiscoveryId | null;
  /** A resposta compromete dinheiro (oferta de fechamento, sinal, Pix da proposta). No modo autônomo só sai sozinha com autoClose. */
  commits: boolean;
  /** A resposta é o texto que o dono escreveu em Configurações para este assunto (garantia, hospedagem...). */
  authorized?: boolean;
  /**
   * A resposta entrega o lead à fila do dono (prévia pedida, sistema para orçar): é só um aviso curto e seguro ao lead,
   * então sai sozinha, e a conversa segue em "Precisa de você" com o resumo.
   */
  queued?: boolean;
  /**
   * A resposta é uma pergunta do roteiro de qualificação: sai sozinha e a conversa NÃO precisa do dono ainda (ele só é
   * chamado quando o roteiro termina).
   */
  discovery?: boolean;
  /** A IA respondeu um assunto que as regras não conhecem (pergunta livre). */
  freeform?: boolean;
  /** Nesse caso, a própria IA disse que o dono precisa conferir (ex.: "vou confirmar e já te respondo"). */
  aiAskedHuman?: boolean;
  /** Falta algo que só o dono resolve para a resposta estar completa (hoje: a chave Pix). Impede de sair sozinha. */
  missing?: "pix_key";
  /** Diagnóstico: por que a IA foi recusada, o que o humanizador avisou. */
  notes: string[];
}
