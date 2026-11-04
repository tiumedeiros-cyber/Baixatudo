"use client";

import { useState, useTransition } from "react";
import { Pause, Play } from "lucide-react";
import { setPausedAction } from "@/app/(app)/outreach-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Botão grande de pausa geral. Pausar é sempre imediato e sem confirmação. */
export function PauseControl({ paused, size = "md" }: { paused: boolean; size?: "sm" | "md" | "lg" }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        variant={paused ? "primary" : "danger"}
        size={size}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setPausedAction(!paused);
            setError(r.ok ? null : r.message);
            // ao retomar, o aviso diz o que foi reorganizado (mensagens reagendadas, respostas velhas, rascunhos de ontem)
            setNotice(r.ok && paused ? r.message : null);
          })
        }
      >
        {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
        {pending ? "Aplicando…" : paused ? "Retomar automação" : "PAUSAR TUDO"}
      </Button>
      {error ? (
        <p role="alert" className={cn("text-[12px] text-danger")}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="max-w-[320px] text-[12px] leading-snug text-accent">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
