/**
 * Configuração da automação de envio (Fase 2/3).
 * Tudo nasce DESLIGADO: pausado, em simulação e em modo copiloto. Para mandar mensagem de
 * verdade é preciso (1) conectar o WhatsApp, (2) tirar o dono do modo pausado e (3) desligar
 * a simulação digitando uma confirmação. Nenhuma dessas travas é aberta sozinha.
 */

export interface AutomationConfig {
  /** Botão "pausar tudo". Nasce ligado. */
  paused: boolean;
  pausedReason: string | null;
  /** Simulação: o worker só registra o que enviaria, sem tocar no WhatsApp. Nasce ligada. */
  dryRun: boolean;
  /**
   * copiloto: toda resposta é rascunho para o dono aprovar.
   * semi: o agente manda SOZINHO as respostas seguras (veja `agent/autonomy.ts`); o resto continua rascunho.
   * Só muda pelo cartão da tela Agente, que pede confirmação.
   */
  autonomy: "copiloto" | "semi";
  /** Só no semi: o agente também pode fazer sozinho a oferta de fechamento e passar o Pix (dinheiro). Nasce desligado. */
  autoClose: boolean;
  /** Só no semi: a IA responde sozinha perguntas que as regras não conhecem ("você cria sites?"). Ligado por padrão no semi. */
  autoFreeform: boolean;
  /** Só no semi: o agente prepara e aprova sozinho o lote do dia de aberturas e follow-ups (a Fila). Nasce desligado. */
  autoBatch: boolean;
  /** Tetos de respostas que o agente manda sozinho: por conversa (contra loop com robô) e por dia. */
  autoMaxPerConversation: number;
  autoMaxPerDay: number;
  /** Dia (AAAA-MM-DD, no fuso configurado) do primeiro envio real; define a rampa de aquecimento. */
  warmupStart: string | null;
  /**
   * Teto de abordagens novas por dia. `steady` é o teto normal e vale sempre; `week1` e `week2` são a rampa de aquecimento
   * e são opcionais: em branco (null), aquela semana usa o teto da próxima. Sem rampa, só `steady` conta. Não há máximo:
   * o número é do dono.
   */
  caps: { week1: number | null; week2: number | null; steady: number };
  /** Janelas de envio, em horário local. */
  windows: { from: string; to: string }[];
  /** 1 = segunda … 7 = domingo. */
  weekdays: number[];
  /**
   * Dias (AAAA-MM-DD) em que NENHUMA prospecção sai, mesmo sendo dia de envio (folga, feriado, quem quer segurar um dia). A fila
   * pula para o próximo dia permitido. As respostas a quem escreveu seguem normais. Só importa de hoje em diante.
   */
  skipDates: string[];
  gapMinSec: number;
  gapMaxSec: number;
  typingMinMs: number;
  typingMaxMs: number;
  /** Máximo de mensagens de prospecção por lead (abertura + follow-ups). */
  maxTouches: number;
  /** Dias após a abertura para o 1º e o 2º follow-up. */
  followUpDays: number[];
  /** Depois de N envios, se a taxa de resposta ficar abaixo disso, pausa sozinho. */
  stopMinSample: number;
  stopMinReplyRate: number;
  /** Falhas de envio seguidas que pausam tudo. */
  maxConsecutiveFailures: number;
  timezone: string;
}

export const DEFAULT_AUTOMATION: AutomationConfig = {
  paused: true,
  pausedReason: "Automação nunca foi ligada.",
  dryRun: true,
  autonomy: "copiloto",
  autoClose: false,
  autoFreeform: true,
  autoBatch: false,
  autoMaxPerConversation: 10,
  autoMaxPerDay: 80,
  warmupStart: null,
  caps: { week1: 8, week2: 15, steady: 30 },
  windows: [
    { from: "09:00", to: "12:00" },
    { from: "14:00", to: "18:00" },
  ],
  weekdays: [1, 2, 3, 4, 5],
  skipDates: [],
  gapMinSec: 180,
  gapMaxSec: 540,
  typingMinMs: 2000,
  typingMaxMs: 6000,
  maxTouches: 3,
  followUpDays: [2, 5],
  stopMinSample: 40,
  stopMinReplyRate: 0.03,
  maxConsecutiveFailures: 3,
  timezone: "America/Fortaleza",
};

/** Estado de execução do worker. Fica à parte da configuração para o formulário não pisar nele. */
export interface AutomationState {
  lastTickAt: string | null;
  lastSendAt: string | null;
  consecutiveFailures: number;
  lastResult: string | null;
  /** Dia (AAAA-MM-DD) em que o lote foi preparado e aprovado sozinho pela última vez. */
  lastAutoBatchDay: string | null;
}

export const DEFAULT_AUTOMATION_STATE: AutomationState = {
  lastTickAt: null,
  lastSendAt: null,
  consecutiveFailures: 0,
  lastResult: null,
  lastAutoBatchDay: null,
};

export function mergeAutomation(stored: Partial<AutomationConfig> | null | undefined): AutomationConfig {
  const s = stored ?? {};
  return {
    ...DEFAULT_AUTOMATION,
    ...s,
    caps: { ...DEFAULT_AUTOMATION.caps, ...(s.caps ?? {}) },
    windows: s.windows?.length ? s.windows : DEFAULT_AUTOMATION.windows,
    weekdays: s.weekdays?.length ? s.weekdays : DEFAULT_AUTOMATION.weekdays,
    skipDates: Array.isArray(s.skipDates) ? [...new Set(s.skipDates.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort() : [],
    followUpDays: s.followUpDays?.length ? s.followUpDays : DEFAULT_AUTOMATION.followUpDays,
  };
}
