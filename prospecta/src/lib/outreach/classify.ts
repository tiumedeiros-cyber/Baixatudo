import { norm } from "@/lib/utils";
import type { Intent } from "./types";

export type InboundMedia = "audio" | "image" | "video" | "document" | "sticker" | "contact" | "location";

export interface Classification {
  intent: Intent;
  /** O lead pediu para não receber mais mensagens: bloqueio imediato. */
  optout: boolean;
  /** Precisa do dono (preço, dúvida, áudio, algo fora do roteiro). */
  needsHuman: boolean;
}

// Tudo é comparado sem acento e em minúsculas.
const OPTOUT =
  /\b(pare|parar|par(a|e) de (me )?(mandar|enviar|chamar|escrever|ligar|incomodar)|sair da lista|remov(a|er|e)( meu| o meu)?( numero| contato)?|me tir(a|e)( da lista| desta lista)?|descadastr\w*|nao (quero|desejo|aceito) (mais )?(receber|mensagens?|contato|propaganda)|nao me (mande|envie|chame|procure|ligue)|chega de mensagem|spam|denunci\w*|vou bloquear|bloque(i|ar|ando)|cancel(a|ar) (meu|o) (contato|numero)|(numero|contato) errado|pessoa errada|engano|errou (de )?(numero|pessoa)|nao e (essa|esta|a) (empresa|clinica|loja|pessoa))\b/;

// Recusa firme. "Agora não", "talvez depois" e "já tenho site" NÃO entram aqui: são adiamento e objeção,
// e quem atende (o agente) tem o que responder; fechar a conversa seria jogar o lead fora.
const NOT_INTERESTED = /\b(nao (tenho|temos) interesse|sem interesse|nao preciso|nao precisamos|nao quero|nao queremos|nao nos interessa|nao me interessa|nao obrigad\w+|dispenso)\b|^nao$/;

/**
 * "Não preciso de site", "já tenho Instagram", "só uso o Instagram": quem diz isso quase sempre acha que "site" é uma coisa grande e
 * cara, e não que o negócio não precisa de um jeito de ser achado e chamado. Não é recusa firme: o agente explica UMA vez que pode
 * ser uma página simples, no estilo Linktree, e só então desiste. Sem "interesse", "obrigado" ou "dispenso" na frase (aí é recusa).
 * Comparado sem acento e sem pontuação (o mesmo texto de `classifyReply` e dos assuntos do agente).
 */
export const SOFT_SITE_OBJECTION =
  /\b(nao (preciso|precisamos|quero|queremos|uso|usamos|vejo necessidade)( de| do| da)? (um |uma |o |a )?(site|sites|pagina)|(ja )?(tenho|temos|uso|usamos|usa) (so |apenas )?(o |nosso |meu |um )?(instagram|insta|perfil)|(so|apenas) (uso|usamos|usa|trabalho com|trabalhamos com|tenho|temos) (o |nosso |meu )?(instagram|insta)|(meu |nosso )?(instagram|insta) (ja )?(resolve|basta|e suficiente|ja e suficiente))\b/;
const FIRM_REFUSAL = /\b(interesse|obrigad\w+|dispenso|pare|nao me (procure|chame|mande))\b/;

// "Quanto tempo demora?" é prazo, não preço.
const PRICE = /\b(quanto(?! tempo)|valor|valores|preco|precos|orcamento|custa|custo|cobra|cobram|investimento|tabela)\b|r\$/;
const INTERESTED =
  /\b(pode (sim|mandar|enviar|mostrar|ver|ser|fechar|comecar|iniciar|fazer|me (mandar|enviar|mostrar))|vamos (fechar|comecar)|fechou|sim|quero|manda|mande|envia|envie|me mostra|me mostre|mostra ai|tenho interesse|interessad[oa]|bora|vamos|claro|com certeza|topo|fechado)\b|^pode$/;

const QUESTION_START = /^(como|qual|quais|quando|quanto|onde|quem|o que|por que|porque|que|voce|vcs|vc|tem|faz|fazem|trabalha)\b/;

export function classifyReply(text: string | null | undefined, media: InboundMedia | null = null): Classification {
  if (media === "audio") return { intent: "audio", optout: false, needsHuman: true };

  const t = norm(text ?? "").replace(/[^\p{L}\p{N}\s$?]/gu, " ").replace(/\s+/g, " ").trim();
  if (!t) {
    return media
      ? { intent: "media", optout: false, needsHuman: true }
      : { intent: "other", optout: false, needsHuman: true };
  }

  if (OPTOUT.test(t)) return { intent: "optout", optout: true, needsHuman: false };
  if (PRICE.test(t)) return { intent: "price", optout: false, needsHuman: true };
  if (SOFT_SITE_OBJECTION.test(t) && !FIRM_REFUSAL.test(t)) return { intent: "other", optout: false, needsHuman: false };
  if (NOT_INTERESTED.test(t)) return { intent: "not_interested", optout: false, needsHuman: false };
  // "Sim?" é aceite; "Quero ver, como funciona?" é pergunta e o dono responde.
  const short = t.split(" ").length <= 2;
  if (INTERESTED.test(t) && (!t.includes("?") || short)) {
    return { intent: "interested", optout: false, needsHuman: false };
  }
  if (t.includes("?") || QUESTION_START.test(t)) return { intent: "question", optout: false, needsHuman: true };
  return { intent: "other", optout: false, needsHuman: true };
}
