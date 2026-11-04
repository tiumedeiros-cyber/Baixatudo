import { Panel } from "@/components/shell/page";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ANSWER_LABEL, PRODUCT_WANTS } from "@/lib/agent/discovery";
import { BANT_LABEL, HEAT_LABEL, PHASE_LABEL } from "@/lib/agent/ficha";
import { TOPIC_LABEL, type Bant, type DiscoveryId, type Heat } from "@/lib/agent/types";
import type { AgentView } from "@/lib/agent/view";
import { cn } from "@/lib/utils";
import { AskAgentButton } from "./ask-agent";

const HEAT_TONE: Record<Heat, BadgeTone> = { quente: "accent", morno: "warn", frio: "info", perdido: "danger", bloqueado: "danger" };
const BANT_COLOR: Record<Bant, string> = { sim: "text-accent", talvez: "text-warn", nao: "text-danger", desconhecido: "text-faint" };

/** A ficha do lead e o botão de pedir resposta ao agente, na tela da conversa. */
export function FichaPanel({ view, conversationId, blocked, aiOn }: { view: AgentView; conversationId: string; blocked: boolean; aiOn: boolean }) {
  const { ficha, topic, handoff, nextAction } = view;
  const cells: [string, Bant][] = [
    ["Quer o site?", ficha.need],
    ["Quem decide", ficha.authority],
    ["Orçamento", ficha.budget],
    ["Prazo", ficha.timing],
  ];
  const noReply = ficha.repliesFromLead === 0;

  return (
    <Panel title="Ficha do lead" eyebrow="Agente de atendimento" bodyClassName="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={HEAT_TONE[ficha.heat]}>{HEAT_LABEL[ficha.heat]}</Badge>
        <Badge tone="neutral">{PHASE_LABEL[ficha.phase]}</Badge>
        {topic ? <Badge tone="ghost">Última: {TOPIC_LABEL[topic]}</Badge> : null}
        {ficha.product ? <Badge tone="info">{PRODUCT_WANTS[ficha.product]}</Badge> : null}
        {ficha.previewPending ? <Badge tone="accent">Prévia pedida</Badge> : ficha.previewSentByOwner ? <Badge tone="info">Prévia enviada por você</Badge> : null}
        {ficha.demo.sent ? <Badge tone="info">{ficha.demo.views > 0 ? `Prévia vista ${ficha.demo.views}×` : "Prévia enviada"}</Badge> : null}
        {ficha.proposal ? <Badge tone="info">Proposta</Badge> : null}
      </div>

      {nextAction ? (
        <div className="border border-accent/30 bg-accent-dim px-3 py-2.5">
          <p className="label text-[10px] text-accent">Próximo passo</p>
          <p className="text-[13px]">{nextAction.label}</p>
        </div>
      ) : null}

      {handoff.needed && handoff.reason ? (
        <div className="border border-warn/40 bg-warn/5 px-3 py-2.5">
          <p className="label text-[10px] text-warn">Confira antes de responder</p>
          <p className="text-[13px] leading-snug">{handoff.reason}</p>
        </div>
      ) : null}

      {ficha.decisor && (ficha.decisor.name || ficha.decisor.phone) ? (
        <div className="border border-line-strong px-3 py-2.5">
          <p className="label text-[10px] text-faint">Quem decide (passado pela recepção)</p>
          <p className="text-[13px] font-medium">
            {ficha.decisor.name ?? "Sem nome ainda"}
            {ficha.decisor.phoneDisplay ? <span className="num text-muted"> · {ficha.decisor.phoneDisplay}</span> : null}
          </p>
          {ficha.decisor.when || ficha.decisor.via ? (
            <p className="text-[12px] leading-snug text-muted">
              {[ficha.decisor.when ? `Melhor horário: ${ficha.decisor.when}` : null, ficha.decisor.via ? `Quem passou: ${ficha.decisor.via}` : null].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-2">
        {cells.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 border border-line px-3 py-2">
            <dt className="label text-[10px] text-faint">{label}</dt>
            <dd className={cn("text-[13px] font-medium", BANT_COLOR[value])}>{BANT_LABEL[value]}</dd>
          </div>
        ))}
      </dl>

      {ficha.signals.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="label text-[10px] text-faint">O que ele já mostrou</p>
          <ul className="flex flex-wrap gap-1.5">
            {ficha.signals.map((s) => (
              <li key={s} className="border border-line px-2 py-0.5 text-[12px] text-muted">
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {Object.keys(ficha.answers).length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="label text-[10px] text-faint">Respondeu ao agente</p>
          {(Object.entries(ficha.answers) as [DiscoveryId, string][]).map(([id, text]) => (
            <p key={id} className="text-[13px] leading-snug text-muted">
              <span className="text-faint">{ANSWER_LABEL[id]}: </span>“{text}”
            </p>
          ))}
        </div>
      ) : null}

      <p className="text-[11px] leading-snug text-faint">
        A ficha é inferida do que ele escreveu. “Não sei ainda” significa que a conversa não mostrou; nada aqui é um dado confirmado.
      </p>

      <div className="border-t border-line pt-4">
        <AskAgentButton
          conversationId={conversationId}
          aiOn={aiOn}
          disabled={blocked ? "Este número pediu para não receber mensagens." : noReply ? "O lead ainda não respondeu." : undefined}
        />
      </div>
    </Panel>
  );
}
