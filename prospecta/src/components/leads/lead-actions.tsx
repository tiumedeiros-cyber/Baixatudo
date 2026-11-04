"use client";

import { useState, useTransition } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { moveLead, probeLeadSite, saveNotes } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { STAGE_LABEL, STAGES, type Stage } from "@/lib/leads/types";
import { cn } from "@/lib/utils";

export function StageControl({ leadId, stage }: { leadId: string; stage: Stage }) {
  const [current, setCurrent] = useState(stage);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go(next: Stage) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const result = await moveLead(leadId, next);
      if (!result.ok) {
        setCurrent(previous);
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Etapa do lead">
        {STAGES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={current === s}
            disabled={pending}
            onClick={() => go(s)}
            className={cn(
              "label h-9 border text-[10px] transition-colors disabled:opacity-60",
              current === s
                ? s === "perdido"
                  ? "border-danger bg-danger/10 text-danger"
                  : "border-accent bg-accent text-accent-ink"
                : "border-line text-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function NotesEditor({ leadId, initial }: { leadId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [, startTransition] = useTransition();

  function save() {
    if (value === saved) return;
    setStatus("saving");
    startTransition(async () => {
      const result = await saveNotes(leadId, value);
      if (result.ok) {
        setSaved(value);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      <Textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus("idle");
        }}
        onBlur={save}
        rows={5}
        maxLength={4000}
        placeholder="Combinados, objeções, o que o dono do negócio disse…"
        aria-label="Anotações do lead"
      />
      <p className="label text-[10px] text-faint" aria-live="polite">
        {status === "saving" ? "Salvando…" : status === "ok" ? "Salvo" : status === "error" ? "Não salvou. Tente de novo." : "Salva ao sair do campo"}
      </p>
    </div>
  );
}

export function ProbeSiteButton({ leadId }: { leadId: string }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await probeLeadSite(leadId);
            setResult({ ok: r.ok, text: r.message });
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ScanSearch className="size-3.5" aria-hidden />}
        {pending ? "Analisando…" : "Analisar site"}
      </Button>
      {result ? (
        <p role="status" className={cn("text-[12px] leading-snug", result.ok ? "text-muted" : "text-danger")}>
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
