"use client";

import { useActionState, useRef } from "react";
import { FileJson, X } from "lucide-react";
import { importJson, type ActionResult } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Importa o JSON exportado do Apify (ou do site antigo) pelo mesmo pipeline da busca. */
export function ImportDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(importJson, null);

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => dialog.current?.showModal()}>
        <FileJson className="size-4" aria-hidden />
        Importar JSON
      </Button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto w-[min(580px,92vw)] border border-line-strong bg-surface-1 p-0 text-fg backdrop:bg-black/75"
        aria-labelledby="import-title"
      >
        <form action={action} className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="label text-accent">Importar</p>
              <h2 id="import-title" className="text-xl font-semibold tracking-tight">
                Leads de um arquivo JSON
              </h2>
              <p className="text-[13px] leading-relaxed text-muted">
                Aceita a exportação do Apify (Google Maps Scraper) ou a lista do site antigo. Entram pelo mesmo
                filtro: telefone, site, nota, repetidos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="grid size-8 shrink-0 place-items-center text-muted hover:bg-surface-3 hover:text-fg"
              aria-label="Fechar"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <Field label="Arquivo .json" htmlFor="import-file">
            <input
              id="import-file"
              name="file"
              type="file"
              accept=".json,.jsonl,.ndjson,application/json"
              className="w-full border border-dashed border-line-strong bg-surface-2 p-3 text-[13px] text-muted file:mr-3 file:border-0 file:bg-surface-4 file:px-3 file:py-1.5 file:text-[12px] file:text-fg hover:border-fg/40"
            />
          </Field>

          <Field label="Ou cole o conteúdo" htmlFor="import-text">
            <Textarea id="import-text" name="text" rows={4} placeholder='[{"title": "...", "phone": "..."}]' className="num text-[12px]" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nicho (opcional)" htmlFor="import-niche" hint="Usado na nota de nicho de ticket alto.">
              <Input id="import-niche" name="niche" placeholder="Ex.: Estética" />
            </Field>
            <Field label="Cidade (opcional)" htmlFor="import-city" hint="Só preenche leads sem cidade.">
              <Input id="import-city" name="city" placeholder="Ex.: Fortaleza" />
            </Field>
          </div>

          {state ? (
            <p
              role={state.ok ? "status" : "alert"}
              className={cn(
                "border px-3 py-2 text-[13px]",
                state.ok ? "border-accent/40 bg-accent-dim text-accent" : "border-danger/40 bg-danger/10 text-danger",
              )}
            >
              {state.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialog.current?.close()}>
              {state?.ok ? "Fechar" : "Cancelar"}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Importando…" : "Importar leads"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
