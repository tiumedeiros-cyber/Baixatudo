"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { askAgentAction } from "@/app/(app)/agent-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** "Pedir resposta ao agente": reescreve o rascunho para a última mensagem do lead. Nada sai sem aprovar. */
export function AskAgentButton({ conversationId, disabled, aiOn }: { conversationId: string; disabled?: string; aiOn: boolean }) {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          disabled={!!disabled || pending}
          onClick={() =>
            startTransition(async () => {
              const r = await askAgentAction(conversationId);
              setNotice({ ok: r.ok, text: r.message });
            })
          }
        >
          <Sparkles className="size-3.5" aria-hidden />
          {pending ? "Escrevendo…" : "Pedir resposta ao agente"}
        </Button>
        <p className="text-[12px] text-faint">
          {disabled ?? (aiOn ? "Escreve com a IA e confere na trava. Você aprova antes de sair." : "IA desligada: escreve pelas regras do playbook. Você aprova antes de sair.")}
        </p>
      </div>
      {notice ? (
        <p role={notice.ok ? "status" : "alert"} className={cn("text-[12px] leading-snug", notice.ok ? "text-muted" : "text-danger")}>
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
