"use client";

import { useState, useTransition } from "react";
import { CalendarOff, Undo2 } from "lucide-react";
import { setSkipDayAction } from "@/app/(app)/outreach-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface SkipDaysView {
  today: string;
  /** O próximo dia em que a fila está marcada para sair, se houver (nunca um dia já sem envio). */
  next: { ymd: string; label: string; count: number } | null;
  skipped: { ymd: string; label: string }[];
}

/**
 * Segurar um dia sem pausar tudo: o dia vira "sem envio" e a fila pula para o próximo dia útil, na mesma ordem. As respostas do
 * agente a quem escrever continuam. Desmarcar traz a fila de volta.
 */
export function SkipDays({ view }: { view: SkipDaysView }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [other, setOther] = useState("");

  const run = (ymd: string, skip: boolean) =>
    start(async () => {
      const r = await setSkipDayAction(ymd, skip);
      setNotice({ ok: r.ok, text: r.message });
    });

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <p className="text-[12.5px] leading-snug text-muted">
        Não quer enviar em um dia? Marque-o aqui: a fila pula para o próximo dia útil, na mesma ordem e dentro do teto de cada número. Diferente de pausar, as respostas do agente a quem
        escrever continuam saindo.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        {view.next ? (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(view.next!.ymd, true)}>
            <CalendarOff className="size-3.5" aria-hidden />
            Pular {view.next.label} · {view.next.count} {view.next.count === 1 ? "mensagem" : "mensagens"}
          </Button>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="label text-[10px] text-muted">Outro dia</span>
          <Input type="date" min={view.today} value={other} onChange={(e) => setOther(e.target.value)} className="h-8 w-44 text-[12px]" aria-label="Escolher outro dia sem envio" />
        </label>
        <Button variant="ghost" size="sm" disabled={pending || !other} onClick={() => run(other, true)}>
          Pular este dia
        </Button>
      </div>

      {view.skipped.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Dias sem envio">
          {view.skipped.map((d) => (
            <li key={d.ymd} className="flex items-center gap-2 border border-warn/35 bg-warn/10 py-1 pr-1 pl-2.5 text-[12px] text-warn">
              <span className="label text-[10px]">Sem envio</span>
              <span className="num">{d.label}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(d.ymd, false)}
                className="flex h-6 items-center gap-1 px-2 text-[11px] text-fg transition-colors hover:bg-surface-3 disabled:opacity-40"
                title="Volta a ser dia de envio e a fila é reorganizada"
              >
                <Undo2 className="size-3" aria-hidden />
                Voltar a enviar
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? (
        <p
          role={notice.ok ? "status" : "alert"}
          className={cn("border px-3 py-2 text-[12.5px] leading-snug", notice.ok ? "border-accent/40 bg-accent-dim text-accent" : "border-danger/40 bg-danger/10 text-danger")}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
