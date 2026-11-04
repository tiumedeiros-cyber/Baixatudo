"use client";

import { useState, useTransition } from "react";
import { Bot } from "lucide-react";
import { cleanRobotConversationsAction } from "@/app/(app)/outreach-actions";
import { Button } from "@/components/ui/button";
import type { RobotConversation } from "@/lib/outreach/robot-cleanup";
import { cn } from "@/lib/utils";

/**
 * Aviso no topo de Conversas: leads que "responderam" com a saudação automática do negócio, de antes de o motor reconhecer
 * robô. Mostra o que será consertado e só mexe depois do clique (e da confirmação).
 */
export function RobotCleanup({ items }: { items: RobotConversation[] }) {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (items.length === 0 && !notice) return null;

  const unsent = items.reduce((n, i) => n + i.unsentReplies, 0);
  return (
    <section aria-label="Respostas de robô para consertar" className="mb-6 flex flex-col gap-3 border border-dashed border-warn/40 bg-warn/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="label flex items-center gap-1.5 text-[10px] text-warn">
            <Bot className="size-3.5" aria-hidden />
            Respostas de robô
          </p>
          {items.length > 0 ? (
            <p className="text-[13px] leading-snug text-fg">
              {items.length} {items.length === 1 ? "lead respondeu" : "leads responderam"} com a saudação automática do negócio, e não com uma pessoa. Eles
              aparecem como respostas de verdade{unsent > 0 ? ` e o agente deixou ${unsent} ${unsent === 1 ? "rascunho" : "rascunhos"} para eles` : ""}.
            </p>
          ) : null}
        </div>
        {items.length > 0 ? (
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  `Consertar ${items.length} ${items.length === 1 ? "conversa" : "conversas"}? Elas voltam para “Sem resposta”, a etapa volta para Contatado e os rascunhos escritos para os robôs são cancelados. Nenhum texto é apagado e nada é enviado.`,
                )
              ) {
                startTransition(async () => {
                  const r = await cleanRobotConversationsAction();
                  setNotice({ ok: r.ok, text: r.message });
                });
              }
            }}
          >
            {pending ? "Consertando…" : `Consertar ${items.length} ${items.length === 1 ? "conversa" : "conversas"}`}
          </Button>
        ) : null}
      </div>

      {items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line border border-line bg-bg/40">
          {items.map((i) => (
            <li key={i.conversationId} className="flex flex-col gap-0.5 px-3 py-2">
              <p className="text-[13px] text-fg">
                {i.leadName} <span className="text-faint">· {i.kind}</span>
              </p>
              <p className="truncate text-[12px] text-muted">{i.sample}</p>
              {i.sentReplies > 0 ? (
                <p className="text-[11px] text-faint">O agente já tinha mandado {i.sentReplies === 1 ? "uma resposta" : `${i.sentReplies} respostas`} a esse robô; isso não dá para desfazer.</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? (
        <p role={notice.ok ? "status" : "alert"} className={cn("text-[12px] leading-snug", notice.ok ? "text-muted" : "text-danger")}>
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
