import { AlertTriangle, Bot, Check, CheckCheck, Clock, FlaskConical, UserRound } from "lucide-react";
import { parseAgentVariant } from "@/lib/agent/variant";
import { isAutoReplyMessage } from "@/lib/outreach/autoreply";
import { clock, groupByDay } from "@/lib/outreach/thread-days";
import { INTENT_LABEL, kindLabel, type Message, type MessageStatus } from "@/lib/outreach/types";
import { cn } from "@/lib/utils";

/** O que o selo de cada mensagem enviada diz, em ícone e palavra. */
const STATUS: Partial<Record<MessageStatus, { label: string; tone: string; icon: typeof Check }>> = {
  approved: { label: "agendada", tone: "text-muted", icon: Clock },
  sending: { label: "enviando", tone: "text-muted", icon: Clock },
  sent: { label: "enviada", tone: "text-muted", icon: Check },
  delivered: { label: "entregue", tone: "text-muted", icon: CheckCheck },
  read: { label: "lida", tone: "text-accent", icon: CheckCheck },
  simulated: { label: "simulada", tone: "text-info", icon: FlaskConical },
  failed: { label: "falhou", tone: "text-danger", icon: AlertTriangle },
};

function Bubble({ m, tz }: { m: Message; tz: string }) {
  const mine = m.direction === "out";
  const robot = isAutoReplyMessage(m);
  const auto = mine && !!parseAgentVariant(m.variant)?.auto;
  const status = mine ? STATUS[m.status] : undefined;
  const StatusIcon = status?.icon;
  const when = clock(m.sentAt ?? m.scheduledFor ?? m.createdAt, tz);
  const who = mine ? (auto ? "Agente, sozinho" : kindLabel(m.kind, m.step)) : robot ? "Resposta automática do negócio" : "Lead";

  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[min(34rem,86%)] flex-col gap-2 border px-3.5 py-2.5",
          mine
            ? "border-accent-line border-r-2 border-r-accent bg-accent-dim"
            : robot
              ? "border-dashed border-line bg-surface-1 opacity-80"
              : "border-line-strong border-l-2 border-l-fg/40 bg-surface-2",
        )}
      >
        <p className="label flex items-center gap-1.5 text-[9px] text-muted">
          {mine ? auto ? <Bot className="size-3 text-accent" aria-hidden /> : <UserRound className="size-3" aria-hidden /> : robot ? <Bot className="size-3" aria-hidden /> : null}
          <span className={cn(mine && auto && "text-accent")}>{who}</span>
        </p>
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg">{m.body}</p>
        <p className="label flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] text-faint">
          {robot ? <span className="mr-auto normal-case tracking-normal text-muted">o agente não responde a robô</span> : null}
          {!mine && !robot && m.intent ? <span className="mr-auto text-warn">{INTENT_LABEL[m.intent]}</span> : null}
          <span className="num tracking-normal">{when}</span>
          {status && StatusIcon ? (
            <span className={cn("inline-flex items-center gap-1", status.tone)}>
              <StatusIcon className="size-3" aria-hidden />
              {status.label}
            </span>
          ) : null}
        </p>
        {m.error && mine ? <p className="text-[11px] leading-snug text-warn">{m.error}</p> : null}
      </div>
    </li>
  );
}

/** A conversa em ordem, com um divisor por dia. Rascunhos e canceladas ficam de fora (têm tela própria). */
export function MessageList({ messages, tz, now }: { messages: Message[]; tz: string; now: Date }) {
  if (messages.length === 0) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center">
        <div className="flex max-w-xs flex-col items-center gap-3">
          <span className="grid size-12 place-items-center border border-dashed border-line-strong text-faint">
            <Clock className="size-5" aria-hidden />
          </span>
          <p className="text-[13px] leading-relaxed text-muted">Nenhuma mensagem trocada ainda. Quando a primeira sair ou chegar, ela aparece aqui.</p>
        </div>
      </div>
    );
  }
  const groups = groupByDay(messages, (m) => m.sentAt ?? m.scheduledFor ?? m.createdAt, tz, now);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} className="flex flex-col gap-3">
          <div className="flex items-center gap-3" role="separator">
            <span aria-hidden className="h-px flex-1 bg-line" />
            <span className="label text-[10px] text-faint">{g.label}</span>
            <span aria-hidden className="h-px flex-1 bg-line" />
          </div>
          <ol className="flex flex-col gap-2.5" aria-label={`Mensagens de ${g.label}`}>
            {g.items.map((m) => (
              <Bubble key={m.id} m={m} tz={tz} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
