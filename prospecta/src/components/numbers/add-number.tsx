"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { addNumberAction } from "@/app/(app)/numeros-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Cadastra um número novo: só o nome. O aparelho no GOWA o painel cria; depois é conectar (QR ou código). */
export function AddNumber({ suggestion, disabled }: { suggestion: string; disabled?: string }) {
  const [name, setName] = useState(suggestion);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 border border-dashed border-line-strong bg-surface-1 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addNumberAction(name);
          setNotice({ ok: r.ok, text: r.message });
          if (r.ok) setName("");
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Adicionar número</h2>
        <p className="text-[12.5px] leading-snug text-muted">Dê um nome (Número 2, Número 3…). Ele nasce pausado; você conecta o WhatsApp dele e libera o envio quando quiser.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Número 2" aria-label="Nome do novo número" className="h-10 w-64" disabled={!!disabled || pending} />
        <Button type="submit" variant="primary" disabled={!!disabled || pending || name.trim() === ""}>
          <Plus className="size-4" aria-hidden />
          {pending ? "Cadastrando…" : "Adicionar"}
        </Button>
      </div>
      {disabled ? <p className="text-[12px] text-warn">{disabled}</p> : null}
      {notice ? (
        <p
          role={notice.ok ? "status" : "alert"}
          className={cn("border px-3 py-2 text-[12.5px] leading-snug", notice.ok ? "border-accent/40 bg-accent-dim text-accent" : "border-danger/40 bg-danger/10 text-danger")}
        >
          {notice.text}
        </p>
      ) : null}
    </form>
  );
}
