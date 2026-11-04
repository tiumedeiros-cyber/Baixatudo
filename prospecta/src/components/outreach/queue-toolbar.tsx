"use client";

import { useState, useTransition } from "react";
import { CheckCheck, ListPlus, RotateCcw, Sparkles } from "lucide-react";
import {
  approveAllDraftsAction,
  cancelAction,
  prepareBatchAction,
  reopenAction,
  requeueSimulatedAction,
  rewriteOpeningsAction,
} from "@/app/(app)/outreach-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Notice = { ok: boolean; text: string } | null;

function useRunner() {
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** `label` diz na tela o que está rodando (o lote com IA leva alguns segundos). */
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, label?: string) =>
    startTransition(async () => {
      setBusy(label ?? null);
      try {
        const r = await fn();
        setNotice({ ok: r.ok, text: r.message });
      } finally {
        setBusy(null);
      }
    });
  return { notice, pending, run, busy };
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role={notice.ok ? "status" : "alert"}
      className={cn(
        "border px-3 py-2 text-[13px] leading-snug",
        notice.ok ? "border-accent/40 bg-accent-dim text-accent" : "border-danger/40 bg-danger/10 text-danger",
      )}
    >
      {notice.text}
    </p>
  );
}

/** Botões do alto da Fila: preparar o lote e aprovar tudo. */
export function QueueToolbar({ drafts, openings, simulated, multi = false }: { drafts: number; openings: number; simulated: number; multi?: boolean }) {
  const { notice, pending, run, busy } = useRunner();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={pending} onClick={() => run(prepareBatchAction, "batch")}>
          <ListPlus className="size-4" aria-hidden />
          {busy === "batch" ? "O agente está escrevendo…" : multi ? "Preparar follow-ups de hoje" : "Preparar lote de hoje"}
        </Button>
        {openings > 0 ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => rewriteOpeningsAction(), "rewrite")}
            title="O agente escreve outras aberturas, curtas e variadas, para os rascunhos de abertura. Troca os textos atuais; nada sai."
          >
            <Sparkles className="size-4" aria-hidden />
            {busy === "rewrite" ? "Reescrevendo…" : `Reescrever aberturas com o agente (${openings})`}
          </Button>
        ) : null}
        <Button variant="secondary" disabled={pending || drafts === 0} onClick={() => run(approveAllDraftsAction)}>
          <CheckCheck className="size-4" aria-hidden />
          Aprovar todos ({drafts})
        </Button>
        {simulated > 0 ? (
          <Button variant="ghost" disabled={pending} onClick={() => run(requeueSimulatedAction)} title="Devolve as mensagens simuladas para a fila, com horários novos">
            <RotateCcw className="size-4" aria-hidden />
            Reenfileirar simuladas ({simulated})
          </Button>
        ) : null}
      </div>
      <NoticeLine notice={notice} />
    </div>
  );
}

/** Devolve uma mensagem cancelada para rascunho. Nada sai antes de aprovar de novo. */
export function ReopenButton({ id }: { id: string }) {
  const { notice, pending, run } = useRunner();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => reopenAction([id]))}>
        <RotateCcw className="size-3.5" aria-hidden />
        {pending ? "Reabrindo…" : "Reabrir"}
      </Button>
      {notice && !notice.ok ? <span className="max-w-[220px] text-right text-[11px] text-danger">{notice.text}</span> : null}
    </div>
  );
}

export function CancelButton({ id, label = "Cancelar" }: { id: string; label?: string }) {
  const { notice, pending, run } = useRunner();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => cancelAction([id]))}>
        {label}
      </Button>
      {notice && !notice.ok ? <span className="text-[11px] text-danger">{notice.text}</span> : null}
    </div>
  );
}
