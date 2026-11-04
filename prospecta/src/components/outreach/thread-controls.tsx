"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Ban, FlaskConical, HandMetal, LockOpen, Send, UserRound } from "lucide-react";
import {
  blockLeadAction,
  markReadAction,
  sendManualReplyAction,
  setHumanAction,
  simulateInboundAction,
  unblockLeadAction,
} from "@/app/(app)/outreach-actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
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

/**
 * Marca como lida quando a conversa é aberta e de novo quando chega mensagem com ela aberta (a tela se atualiza sozinha:
 * quem está olhando a conversa não deve ficar com "não lida" na lista). Uma chamada por valor de não lidas.
 */
export function MarkRead({ conversationId, unread }: { conversationId: string; unread: number }) {
  const marked = useRef(0);
  useEffect(() => {
    if (unread === 0) {
      marked.current = 0;
      return;
    }
    if (unread !== marked.current) {
      marked.current = unread;
      void markReadAction(conversationId);
    }
  }, [conversationId, unread]);
  return null;
}

const MAX_CHARS = 1000;
const MAX_HEIGHT = 176;

/** A caixa de resposta, presa no pé da conversa. Ctrl+Enter envia; o texto cresce com o que você escreve. */
export function Composer({ conversationId, disabled, simulating }: { conversationId: string; disabled?: string; simulating: boolean }) {
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const empty = text.trim().length === 0;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  function submit() {
    if (disabled || pending || empty) return;
    startTransition(async () => {
      const r = await sendManualReplyAction(conversationId, text);
      setNotice({ ok: r.ok, text: r.message });
      if (r.ok) setText("");
    });
  }

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={box}
        value={text}
        rows={2}
        maxLength={MAX_CHARS}
        disabled={!!disabled || pending}
        placeholder={disabled ?? "Escreva a resposta. Ao enviar, você assume a conversa."}
        aria-label="Responder ao lead"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        className="min-h-[52px] resize-none bg-surface-1 text-[13.5px]"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-h-4 text-[11.5px] leading-snug text-faint">
          {simulating ? (
            "Simulação ligada: a resposta só é registrada, não sai de verdade."
          ) : (
            <>
              Sai na hora, como no celular. <kbd className="num border border-line px-1 text-[10px] text-muted">Ctrl</kbd>{" "}
              <kbd className="num border border-line px-1 text-[10px] text-muted">Enter</kbd> envia.
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          {text.length > 0 ? <span className="num text-[11px] text-faint">{text.length}/{MAX_CHARS}</span> : null}
          <Button type="submit" variant="primary" size="md" disabled={!!disabled || pending || empty}>
            <Send className="size-3.5" aria-hidden />
            {pending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </div>
      <Line notice={notice} />
    </form>
  );
}

export function ThreadActions({
  conversationId,
  leadId,
  humanTakenOver,
  blocked,
}: {
  conversationId: string;
  leadId: string;
  humanTakenOver: boolean;
  blocked: boolean;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setNotice({ ok: r.ok, text: r.message });
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={pending || blocked} onClick={() => run(() => setHumanAction(conversationId, !humanTakenOver))}>
          {humanTakenOver ? <UserRound className="size-3.5" aria-hidden /> : <HandMetal className="size-3.5" aria-hidden />}
          {humanTakenOver ? "Devolver à automação" : "Assumir conversa"}
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={pending || blocked}
          onClick={() => {
            if (window.confirm("Bloquear este número? Ninguém mais escreve para ele e o lead vai para Perdido.")) run(() => blockLeadAction(leadId));
          }}
        >
          <Ban className="size-3.5" aria-hidden />
          Bloquear
        </Button>
        {blocked ? (
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  "Desbloquear este número? Ele pediu para não receber mensagens. Libere só se ele voltou a escrever ou pediu para falar com você. O agente volta a atender e, se ele deixou uma mensagem sem resposta, já responde.",
                )
              ) {
                run(() => unblockLeadAction(leadId));
              }
            }}
          >
            <LockOpen className="size-3.5" aria-hidden />
            Desbloquear e devolver
          </Button>
        ) : null}
      </div>
      <Line notice={notice} />
    </div>
  );
}

/** Só aparece no modo demonstração: finge uma resposta do lead para ver o fluxo sem WhatsApp. */
export function SimulateInbound({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState("Pode sim, manda aí");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2 border border-dashed border-warn/40 bg-warn/5 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await simulateInboundAction(conversationId, text);
          setNotice({ ok: r.ok, text: r.message });
        });
      }}
    >
      <p className="label text-[10px] text-warn">Modo demonstração</p>
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Texto da resposta simulada" className="h-9" />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <FlaskConical className="size-3.5" aria-hidden />
          Simular
        </Button>
      </div>
      <Line notice={notice} />
    </form>
  );
}
