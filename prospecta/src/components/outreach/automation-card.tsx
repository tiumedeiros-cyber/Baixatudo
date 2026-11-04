import { PauseControl } from "@/components/outreach/automation-controls";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/shell/page";
import type { Overview } from "@/lib/outreach/engine";
import type { ResumePlan } from "@/lib/outreach/resume";
import { formatInt, formatWhen, timeAgo } from "@/lib/utils";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5 last:border-b-0">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-right text-[13px]">{children}</span>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${formatInt(n)} ${n === 1 ? one : many}`;

/** O que acontece quando o dono clicar em Retomar: nada é solto de uma vez, nem sai resposta velha sem ele ver. */
function ResumeNotes({ plan }: { plan: ResumePlan }) {
  const lines = [
    plan.overdueProspecting + plan.freshReplies > 0
      ? `${plural(plan.overdueProspecting + plan.freshReplies, "mensagem aprovada que não saiu ganha", "mensagens aprovadas que não saíram ganham")} horário novo, a partir de agora e dentro dos horários e do teto.`
      : null,
    plan.staleReplies > 0
      ? `${plural(plan.staleReplies, "resposta do agente com mais de 3 h volta", "respostas do agente com mais de 3 h voltam")} como rascunho para você conferir.`
      : null,
    plan.oldDrafts > 0 ? `${plural(plan.oldDrafts, "rascunho de dia anterior continua", "rascunhos de dias anteriores continuam")} esperando a sua aprovação.` : null,
  ].filter((l): l is string => l !== null);
  return (
    <div className="border-b border-line px-4 py-3">
      <p className="label pb-1.5 text-[10px] text-faint">Ao retomar</p>
      {lines.length === 0 ? (
        <p className="text-[12px] leading-snug text-muted">Nada parado: é só retomar.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lines.map((l) => (
            <li key={l} className="text-[12px] leading-snug text-muted">
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Estado da automação, com o botão de pausa geral. Usado no Comando e na Fila. */
export function AutomationCard({ o, now }: { o: Overview; now: number }) {
  const { cfg } = o;
  const live = !cfg.dryRun;
  return (
    <Panel
      title="Automação"
      eyebrow="Envio por WhatsApp"
      action={<PauseControl paused={cfg.paused} size="sm" />}
      bodyClassName="flex flex-col"
    >
      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3">
        <Badge tone={cfg.paused ? "warn" : "accent"}>{cfg.paused ? "Pausada" : "Ativa"}</Badge>
        <Badge tone={live ? "danger" : "info"}>{live ? "Envio real" : "Simulação"}</Badge>
        <Badge tone={o.connected ? "accent" : "ghost"}>
          {o.providerMode === "gowa" ? (o.connected ? "WhatsApp conectado" : "WhatsApp desconectado") : "Sem WhatsApp"}
        </Badge>
        <Badge tone="ghost">{cfg.autonomy === "copiloto" ? "Copiloto" : "Semi-automático"}</Badge>
      </div>
      {cfg.paused && cfg.pausedReason ? (
        <p className="border-b border-line bg-warn/5 px-4 py-2.5 text-[12px] leading-snug text-warn">{cfg.pausedReason}</p>
      ) : null}
      {cfg.paused && o.resume ? <ResumeNotes plan={o.resume} /> : null}
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] text-muted">Enviadas hoje</span>
          <span className="text-right text-[13px]">
            <span className="num">{formatInt(o.sentToday)}</span>
            <span className="text-faint"> de {formatInt(o.capToday)}</span>
          </span>
        </div>
        <div className="h-1 bg-surface-3" role="progressbar" aria-label="Envios de hoje em relação ao teto" aria-valuemin={0} aria-valuemax={o.capToday} aria-valuenow={Math.min(o.sentToday, o.capToday)}>
          <div className="h-full bg-accent transition-[width]" style={{ width: `${o.capToday > 0 ? Math.min(100, Math.round((o.sentToday / o.capToday) * 100)) : 0}%` }} />
        </div>
      </div>
      <Row label="Próximo envio">{o.nextAt ? formatWhen(o.nextAt, cfg.timezone) : <span className="text-faint">nada agendado</span>}</Row>
      <Row label="Respostas">
        <span className="num">{formatInt(o.counts.conversationsReplied)}</span>
        <span className="text-faint">
          {" "}
          {o.replyRate == null ? "" : `(${(o.replyRate * 100).toFixed(0)}% das ${formatInt(o.counts.prospectingSent)} abordagens)`}
        </span>
      </Row>
      <Row label="Worker">
        {o.lastTickAt ? (
          <span>
            {timeAgo(o.lastTickAt, now)}
            {o.lastResult ? <span className="text-faint"> · {o.lastResult}</span> : null}
          </span>
        ) : (
          <span className="text-faint">nunca rodou</span>
        )}
      </Row>
      <p className="px-4 py-3 text-[12px] leading-snug text-faint">{o.providerDetail}</p>
    </Panel>
  );
}
