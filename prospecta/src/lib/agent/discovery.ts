import { norm } from "@/lib/utils";
import type { DiscoveryId, Product } from "./types";

/**
 * A qualificação guiada do fluxo "qualificar": o que o agente pergunta, em que ordem e quando para. A ideia é o dono
 * receber o MAPA do pedido (o que precisa, como faz hoje, quem usa, o que liga, para quando) sem o lead se sentir num
 * interrogatório: uma pergunta por mensagem, só as que ajudam a construir, e no máximo duas tentativas por pergunta.
 *
 * Site é curto (objetivo e material) porque o valor é de tabela. Sistema e automação têm valor sob medida, então vale
 * mais conversa: é aqui que o agente economiza o tempo do dono.
 */

export const OBJETIVO_QUESTION = "O que você mais quer que o site faça: mostrar os serviços, receber contatos ou passar mais confiança?";

/** Sistema e automação: o valor depende do que ele precisa, então é do dono. */
export type CustomProduct = Exclude<Product, "site">;
export const isCustom = (p: Product | null): p is CustomProduct => p === "sistema" || p === "automacao";

export const PRODUCT_LABEL: Record<Product, string> = { site: "Site", sistema: "Sistema", automacao: "Automação" };
export const PRODUCT_WANTS: Record<Product, string> = { site: "Quer site", sistema: "Quer sistema", automacao: "Quer automação" };

/** Em ordem: a primeira pergunta sem resposta é a próxima. */
export const DISCOVERY_PLAN: Record<Product, DiscoveryId[]> = {
  site: ["objetivo", "material"],
  sistema: ["escopo", "dor", "usuarios", "integracoes", "prazo"],
  automacao: ["escopo", "dor", "usuarios", "integracoes", "prazo"],
};

/** Quantas vezes uma pergunta pode ser feita antes de o agente desistir dela (o lead desviou ou ignorou). */
export const MAX_ASKS = 2;

/** Como cada resposta aparece para o dono (ficha, resumo e briefing). */
export const ANSWER_LABEL: Record<DiscoveryId, string> = {
  tipo: "O que quer",
  objetivo: "Objetivo do site",
  material: "Material que já tem",
  escopo: "O que precisa fazer",
  dor: "Como faz hoje e o que pesa",
  usuarios: "Quem vai usar",
  integracoes: "O que precisa ligar",
  prazo: "Para quando quer",
  apresentacao: "Apresentação",
};

const QUESTIONS: Record<Product, Partial<Record<DiscoveryId, string>>> = {
  site: {
    objetivo: OBJETIVO_QUESTION,
    material: "Você já tem logo, fotos e textos do negócio, ou precisa que eu monte tudo?",
  },
  sistema: {
    escopo: "Me conta em uma frase o que ele precisa fazer?",
    dor: "Como vocês fazem isso hoje e o que mais dá trabalho?",
    usuarios: "Quem vai usar: só você, a sua equipe ou os seus clientes também?",
    integracoes: "Ele precisa se ligar a algo que vocês já usam, como WhatsApp, planilha, agenda ou pagamento?",
    prazo: "Para quando você precisa dele funcionando?",
  },
  automacao: {
    escopo: "O que você quer automatizar: atendimento, agendamento, cobrança ou outra coisa?",
    dor: "Como isso é feito hoje e o que mais toma o seu tempo?",
    usuarios: "Por onde os seus clientes chamam vocês hoje: WhatsApp, Instagram ou telefone?",
    integracoes: "Precisa se ligar a alguma agenda, planilha ou sistema que vocês já usam?",
    prazo: "Para quando você precisa dessa automação funcionando?",
  },
};

export function discoveryQuestion(product: Product, id: DiscoveryId): string | null {
  return QUESTIONS[product][id] ?? null;
}

/** A próxima pergunta do roteiro: a primeira sem resposta e ainda dentro do limite de tentativas. */
export function nextStep(
  product: Product,
  answers: Partial<Record<DiscoveryId, string>>,
  askCount: (id: DiscoveryId) => number,
): DiscoveryId | null {
  return DISCOVERY_PLAN[product].find((id) => !answers[id] && askCount(id) < MAX_ASKS) ?? null;
}

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/**
 * O resumo curto para o dono ("Precisa de você"): o que foi descoberto, na ordem do roteiro. Só o que o lead respondeu;
 * o que ficou sem resposta aparece como "não respondeu" para o dono saber onde perguntar.
 */
export function discoverySummary(product: Product, answers: Partial<Record<DiscoveryId, string>>): string {
  const parts = DISCOVERY_PLAN[product].map((id) => `${ANSWER_LABEL[id]}: ${answers[id] ? `“${clip(answers[id]!, 90)}”` : "não respondeu"}`);
  return `${PRODUCT_LABEL[product]}. ${parts.join(". ")}.`;
}

/** Recusa de verdade ("não tenho interesse", "dispenso"). Um "não" solto, no meio das perguntas, é resposta. */
const STRONG_REFUSAL = /\b(nao tenho interesse|sem interesse|dispenso|nao obrigad\w+|nao quero (mais|conversar|continuar|nada|saber)|deixa pra la|esquece)\b/;

export function isRefusal(text: string | null | undefined): boolean {
  return STRONG_REFUSAL.test(norm(text ?? ""));
}
