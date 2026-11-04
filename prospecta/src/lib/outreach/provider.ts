/**
 * Porta de saída para o WhatsApp. O resto do sistema só conhece esta interface; quem fala com o
 * WhatsApp de verdade é o GOWA (programa em Go, ver gowa.ts). Trocar de programa ou ir para a API
 * oficial depois é escrever outra classe, sem mexer no motor de envio.
 */

export type ProviderMode = "gowa" | "simulado";

export interface ProviderStatus {
  connected: boolean;
  loggedIn: boolean;
  mode: ProviderMode;
  /** Texto curto para mostrar no painel. */
  detail: string;
  /** O aparelho deste número não existe mais no GOWA (foi apagado lá): não adianta tentar de novo. */
  missing?: boolean;
}

export interface WhatsAppProvider {
  readonly mode: ProviderMode;
  status(): Promise<ProviderStatus>;
  /** Liga/desliga o "digitando…" (melhor esforço: falhar aqui não impede o envio). */
  typing(phoneE164: string, on: boolean): Promise<void>;
  sendText(phoneE164: string, text: string): Promise<{ id: string | null }>;
  /** true/false se o número tem WhatsApp; null se não deu para saber. */
  isOnWhatsApp(phoneE164: string): Promise<boolean | null>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    /** Vale tentar de novo mais tarde (rede, 5xx, 429). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** "+5585991234567" → "5585991234567@s.whatsapp.net" */
export function toJid(phoneE164: string): string {
  return `${phoneE164.replace(/\D/g, "")}@s.whatsapp.net`;
}

/** "5585991234567@s.whatsapp.net" → "+5585991234567". Grupos, canais e @lid devolvem null. */
export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const m = /^(\d{8,15})(?::\d+)?@s\.whatsapp\.net$/.exec(jid.trim());
  return m ? `+${m[1]}` : null;
}

/**
 * As formas possíveis do MESMO celular brasileiro: com e sem o "9" depois do DDD.
 * O Brasil acrescentou o 9 aos celulares, mas muitas contas do WhatsApp continuam registradas SEM ele
 * (acontece fora do eixo Rio/São Paulo), e para enviar é preciso o endereço exato. A primeira forma
 * devolvida é sempre a original. Outros países e telefones fixos voltam como estão.
 */
export function phoneVariants(phoneE164: string): string[] {
  const digits = phoneE164.replace(/\D/g, "");
  const plus = (d: string) => `+${d}`;
  if (/^55\d{2}9\d{8}$/.test(digits)) return [plus(digits), plus(digits.slice(0, 4) + digits.slice(5))];
  if (/^55\d{2}[6-9]\d{7}$/.test(digits)) return [plus(digits), plus(digits.slice(0, 4) + "9" + digits.slice(4))];
  return [plus(digits)];
}

/** Modo simulado: não existe WhatsApp por trás. Nunca envia nada. */
export class SimulatedProvider implements WhatsAppProvider {
  readonly mode = "simulado" as const;

  /** `missing`: só a demonstração usa, para mostrar como o painel trata um número cujo aparelho foi apagado no GOWA. */
  constructor(private readonly opts: { missing?: boolean } = {}) {}

  async status(): Promise<ProviderStatus> {
    return {
      connected: false,
      loggedIn: false,
      mode: this.mode,
      ...(this.opts.missing ? { missing: true } : {}),
      detail: this.opts.missing ? "O aparelho deste número foi apagado do GOWA" : "Sem WhatsApp conectado (modo simulado)",
    };
  }

  async typing(): Promise<void> {}

  async sendText(): Promise<{ id: string | null }> {
    throw new ProviderError("Modo simulado: o envio real está desligado.", false);
  }

  async isOnWhatsApp(): Promise<boolean | null> {
    return null;
  }
}
