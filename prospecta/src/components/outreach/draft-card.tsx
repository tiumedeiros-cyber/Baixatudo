"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import { approveAction, cancelAction, editDraftAction, rewriteOpeningsAction } from "@/app/(app)/outreach-actions";
import { ScoreChip, SiteBadge } from "@/components/leads/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import type { WebsiteKind } from "@/lib/leads/types";
import { parseAgentVariant } from "@/lib/agent/variant";
import { parseOpeningVariant, variantLabel } from "@/lib/outreach/metrics";
import { countParts } from "@/lib/outreach/parts";
import { INTENT_LABEL, kindLabel, type Intent, type MessageKind } from "@/lib/outreach/types";
import { cn } from "@/lib/utils";

export interface DraftView {
  id: string;
  leadId: string;
  leadName: string;
  neighborhood: string | null;
  websiteKind: WebsiteKind;
  score: number;
  kind: MessageKind;
  step: number;
  intent: Intent | null;
  body: string;
  /** Quem escreveu: "agente:price", "agente-ia:price"... (veja lib/agent/variant). */
  variant?: string | null;
  /** O que o agente pede que o dono confira antes de aprovar. */
  attention?: string | null;
  /** Rascunho de um dia anterior: a data (dd/mm) em que nasceu. */
  oldDay?: string | null;
  /** O número de WhatsApp que vai enviar (só aparece com vários números). */
  numberName?: string | null;
}

/** Menciona dinheiro, prazo ou porcentagem: o dono precisa conferir esses fatos antes de aprovar. */
const MENTIONS_TERMS = /R$|d+s*(dias?|%)/i;

/** Um rascunho da fila: o texto é editável, e nada sai antes de clicar em Aprovar. */
export function DraftCard({ draft, compact = false }: { draft: DraftView; /** Dentro da conversa do lead: some a identificação do lead, que já está na tela. */ compact?: boolean }) {
  const [text, setText] = useState(draft.body);
  const [saved, setSaved] = useState(draft.body);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = text !== saved;
  const agent = parseAgentVariant(draft.variant);
  const opening = parseOpeningVariant(draft.variant);
  const prospecting = draft.kind === "opening" || draft.kind === "followup";
  const parts = prospecting ? countParts(text) : 1;
  const terms = MENTIONS_TERMS.test(text);

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    const r = await editDraftAction(draft.id, text);
    if (r.ok) setSaved(text);
    setMessage({ ok: r.ok, text: r.message });
    return r.ok;
  }

  return (
    <article className={cn("flex flex-col gap-3 border bg-surface-1 p-4 transition-colors", pending ? "border-line opacity-70" : "border-line")}>
      <header className="flex flex-wrap items-center gap-3">
        {compact ? null : (
          <>
            <ScoreChip score={draft.score} size="sm" />
            <div className="min-w-0 flex-1">
              <Link href={`/leads/${draft.leadId}`} className="block truncate text-[14px] font-semibold tracking-[-0.01em] hover:text-accent">
                {draft.leadName}
              </Link>
              <p className="truncate text-[12px] text-muted">{draft.neighborhood ?? "—"}</p>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="info">{kindLabel(draft.kind, draft.step)}</Badge>
          {draft.numberName ? <Badge tone="neutral">{draft.numberName}</Badge> : null}
          {draft.oldDay ? <Badge tone="warn">{`De ${draft.oldDay}`}</Badge> : null}
          {agent ? <Badge tone="accent">{agent.source === "ai" ? "Agente · IA" : "Agente"}</Badge> : null}
          {opening ? (
            <span title={variantLabel(draft.variant ?? "")}>
              <Badge tone={opening.ia ? "accent" : "ghost"}>{opening.ia ? "Escrita pelo agente" : "Modelo"}</Badge>
            </span>
          ) : null}
          {draft.intent ? <Badge tone="warn">{INTENT_LABEL[draft.intent]}</Badge> : null}
          <SiteBadge kind={draft.websiteKind} />
        </div>
      </header>

      {draft.attention ? (
        <p className="border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] leading-snug">
          <span className="label mr-2 text-[10px] text-warn">Confira</span>
          {draft.attention}
        </p>
      ) : null}

      <Textarea
        value={text}
        rows={5}
        maxLength={1000}
        aria-label={`Texto da mensagem para ${draft.leadName}`}
        onChange={(e) => {
          setText(e.target.value);
          setMessage(null);
        }}
        onBlur={() => startTransition(async () => void (await save()))}
        className="text-[13px]"
      />

      {prospecting ? (
        <p className="-mt-1 text-[11px] leading-snug text-faint">
          Cada parágrafo, separado por uma linha em branco, sai como uma mensagem. O lead recebe{" "}
          <span className="num text-muted">{parts}</span> {parts === 1 ? "mensagem" : "mensagens"}.
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn("min-h-4 text-[12px]", message ? (message.ok ? "text-muted" : "text-danger") : "text-faint")} aria-live="polite">
          {message?.text ?? (dirty ? "Texto alterado, salva ao sair do campo" : `${text.length} caracteres${terms ? ". Tem valor, prazo ou porcentagem: confira." : ""}`)}
        </p>
        <div className="flex gap-2">
          {draft.kind === "opening" ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              title="O agente escreve outra abertura para este lead. Troca o texto atual."
              onClick={() =>
                startTransition(async () => {
                  const r = await rewriteOpeningsAction([draft.id]);
                  setMessage({ ok: r.ok, text: r.message });
                })
              }
            >
              <Sparkles className="size-3.5" aria-hidden />
              Reescrever
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await cancelAction([draft.id]);
                setMessage({ ok: r.ok, text: r.message });
              })
            }
          >
            <X className="size-3.5" aria-hidden />
            Descartar
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (!(await save())) return;
                const r = await approveAction([draft.id]);
                setMessage({ ok: r.ok, text: r.message });
              })
            }
          >
            <Check className="size-3.5" aria-hidden />
            Aprovar
          </Button>
        </div>
      </footer>
    </article>
  );
}
