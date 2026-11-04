import { formatCents } from "@/lib/deals/money";
import { PROPOSAL_LABEL, type ProposalStatus } from "@/lib/deals/types";
import { STAGE_LABEL, isStage, type LeadEvent } from "@/lib/leads/types";
import { INTENT_LABEL, type Intent } from "@/lib/outreach/types";
import { timeAgo } from "@/lib/utils";

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
/** "2026-10-22" vira "22/10"; qualquer outra coisa vira "hoje". */
function dayLabel(v: unknown): string {
  const m = typeof v === "string" ? /^\d{4}-(\d{2})-(\d{2})$/.exec(v) : null;
  return m ? `${m[2]}/${m[1]}` : "hoje";
}
function stageLabel(v: unknown): string {
  return isStage(v) ? STAGE_LABEL[v] : str(v);
}

/** Frase curta para cada tipo de evento, usada no feed do Comando e na linha do tempo do lead. */
export function describeEvent(event: LeadEvent, opts: { withName?: boolean } = {}): string {
  const p = event.payload;
  const name = opts.withName === false ? "" : str(p.name, "Lead");
  switch (event.type) {
    case "etapa":
      return opts.withName === false
        ? `Etapa: ${stageLabel(p.from)} → ${stageLabel(p.to)}`
        : `${name}: ${stageLabel(p.from)} → ${stageLabel(p.to)}`;
    case "lead_criado":
      return opts.withName === false ? `Entrou na base com nota ${num(p.score)}` : `${name} entrou na base (nota ${num(p.score)})`;
    case "site_analisado":
      return p.weak === true ? `${name ? name + ": " : ""}site analisado, é fraco` : `${name ? name + ": " : ""}site analisado, em ordem`;
    case "busca_iniciada":
      return `Busca iniciada: ${str(p.niche)} em ${str(p.city)}`;
    case "busca_concluida":
      return `Busca concluída: ${str(p.niche)} em ${str(p.city)}, ${num(p.inserted)} leads novos`;
    case "busca_falhou":
      return `Busca falhou: ${str(p.niche)} em ${str(p.city)}`;
    case "importacao":
      return `Importação: ${num(p.inserted)} leads novos, ${num(p.duplicates)} repetidos`;
    case "nota":
      return "Anotação atualizada";
    case "lote_preparado":
      return `Lote de ${dayLabel(p.day)}: ${num(p.count)} ${num(p.count) === 1 ? "mensagem preparada" : "mensagens preparadas"}`;
    case "lote_aprovado":
      return `${num(p.count)} ${num(p.count) === 1 ? "mensagem aprovada" : "mensagens aprovadas"} para envio`;
    case "mensagem_enviada":
      return `${name ? name + ": " : ""}${num(p.step) === 0 ? "abertura enviada" : `follow-up ${num(p.step)} enviado`}`;
    case "mensagem_simulada":
      return `${name ? name + ": " : ""}envio simulado (nada saiu)`;
    case "mensagem_falhou":
      return `${name ? name + ": " : ""}falha no envio`;
    case "resposta_recebida":
      return `${name ? name + " " : ""}respondeu (${INTENT_LABEL[p.intent as Intent] ?? "mensagem"})`;
    case "optout":
      return `${name ? name + " " : ""}pediu para parar de receber`;
    case "automacao":
      return `Automação: ${str(p.text, "mudança de estado")}`;
    case "demo_gerada":
      return `${name ? name + ": " : ""}prévia do site gerada`;
    case "proposta_criada":
      return `${name ? name + ": " : ""}proposta de ${formatCents(num(p.amountCents))} criada`;
    case "proposta_status":
      return `${name ? name + ": " : ""}proposta ${PROPOSAL_LABEL[p.to as ProposalStatus]?.toLowerCase() ?? "atualizada"}`;
    case "projeto_criado":
      return `${name ? name + ": " : ""}projeto aberto em Produção`;
    default:
      return event.type;
  }
}

const DOT: Partial<Record<LeadEvent["type"], string>> = {
  busca_concluida: "bg-accent",
  importacao: "bg-accent",
  etapa: "bg-info",
  busca_falhou: "bg-danger",
  site_analisado: "bg-warn",
  mensagem_enviada: "bg-accent",
  mensagem_falhou: "bg-danger",
  resposta_recebida: "bg-warn",
  optout: "bg-danger",
  automacao: "bg-info",
  demo_gerada: "bg-accent",
  proposta_status: "bg-accent",
  projeto_criado: "bg-info",
};

export function ActivityFeed({ events, withName = true }: { events: LeadEvent[]; withName?: boolean }) {
  if (events.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-faint">Nada por aqui ainda.</p>;
  }
  return (
    <ol className="flex flex-col">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
          <span aria-hidden className={`mt-[7px] size-1.5 shrink-0 ${DOT[event.type] ?? "bg-faint"}`} />
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg/90">{describeEvent(event, { withName })}</p>
          <time dateTime={event.createdAt} className="label shrink-0 pt-0.5 text-[10px] text-faint">
            {timeAgo(event.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
