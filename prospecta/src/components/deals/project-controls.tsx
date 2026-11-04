"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, Plus, Save } from "lucide-react";
import {
  addChecklistItemAction,
  saveBriefingAction,
  setProjectStatusAction,
  toggleChecklistAction,
} from "@/app/(app)/deal-actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { PROJECT_LABEL, PROJECT_STATUSES, type ChecklistItem, type ProjectStatus } from "@/lib/deals/types";
import { cn } from "@/lib/utils";

type Notice = { ok: boolean; text: string } | null;

function Line({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role={notice.ok ? "status" : "alert"} className={cn("text-[12px] leading-snug", notice.ok ? "text-muted" : "text-danger")}>
      {notice.text}
    </p>
  );
}

export function Checklist({ projectId, items }: { projectId: string; items: ChecklistItem[] }) {
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");

  const done = items.filter((i) => i.done).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="h-1 flex-1 bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label="Checklist">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: items.length ? `${(done / items.length) * 100}%` : "0%" }} />
        </div>
        <span className="num text-[12px] text-muted">
          {done}/{items.length}
        </span>
      </div>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-2.5 py-1.5 text-[13px] leading-snug hover:text-fg">
              <input
                type="checkbox"
                checked={item.done}
                disabled={pending}
                onChange={(e) =>
                  startTransition(async () => {
                    const r = await toggleChecklistAction(projectId, item.id, e.target.checked);
                    setNotice(r.ok ? null : { ok: false, text: r.message });
                  })
                }
                className="mt-0.5 size-4 shrink-0 appearance-none border border-line-strong bg-surface-2 checked:border-accent checked:bg-accent"
              />
              <span className={cn(item.done && "text-faint line-through")}>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          startTransition(async () => {
            const r = await addChecklistItemAction(projectId, text);
            setNotice(r.ok ? null : { ok: false, text: r.message });
            if (r.ok) setText("");
          });
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={160} placeholder="Novo item" aria-label="Novo item da lista" className="h-8 text-[13px]" />
        <Button type="submit" variant="secondary" size="sm" disabled={pending || !text.trim()}>
          <Plus className="size-3.5" aria-hidden />
          Adicionar
        </Button>
      </form>
      <Line notice={notice} />
    </div>
  );
}

export function BriefingEditor({ projectId, initial }: { projectId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();
  const dirty = text !== saved;
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        rows={4}
        maxLength={8000}
        onChange={(e) => setText(e.target.value)}
        placeholder="Cole aqui o que o cliente mandou: cores, serviços, horários, textos, links…"
        aria-label="Briefing do cliente"
        className="text-[13px]"
      />
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              const r = await saveBriefingAction(projectId, text);
              setNotice({ ok: r.ok, text: r.message });
              if (r.ok) setSaved(text);
            })
          }
        >
          <Save className="size-3.5" aria-hidden />
          {pending ? "Salvando…" : "Salvar briefing"}
        </Button>
        <Line notice={notice} />
      </div>
    </div>
  );
}

export function ProjectStatusButtons({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();
  const index = PROJECT_STATUSES.indexOf(status);
  const next = PROJECT_STATUSES[index + 1];
  const prev = PROJECT_STATUSES[index - 1];

  const go = (to: ProjectStatus) =>
    startTransition(async () => {
      const r = await setProjectStatusAction(projectId, to);
      setNotice(r.ok ? null : { ok: false, text: r.message });
    });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {prev ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => go(prev)}>
            Voltar para {PROJECT_LABEL[prev].toLowerCase()}
          </Button>
        ) : null}
        {next ? (
          <Button variant="primary" size="sm" disabled={pending} onClick={() => go(next)}>
            {next === "entregue" ? <Check className="size-3.5" aria-hidden /> : <ArrowRight className="size-3.5" aria-hidden />}
            {next === "entregue" ? "Marcar como entregue" : `Avançar para ${PROJECT_LABEL[next].toLowerCase()}`}
          </Button>
        ) : null}
      </div>
      <Line notice={notice} />
    </div>
  );
}
