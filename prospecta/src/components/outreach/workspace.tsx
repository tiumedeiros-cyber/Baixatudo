"use client";

import { useEffect, useState } from "react";
import { PanelRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A área de trabalho das conversas: barra de cima, lista à esquerda, conversa no meio e ficha à direita. A tela inteira
 * é uma caixa de entrada com rolagem própria em cada coluna. Em telas estreitas a ficha vira uma gaveta aberta por botão
 * e, sem conversa aberta, só a lista aparece.
 */
export function Workspace({
  bar,
  list,
  context,
  hasThread,
  children,
}: {
  bar: React.ReactNode;
  list: React.ReactNode;
  /** Ficha e negócio do lead. Sem conversa aberta, não há ficha. */
  context?: React.ReactNode;
  hasThread: boolean;
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="flex h-[calc(100dvh-92px)] min-h-[560px] flex-col bg-bg lg:h-dvh">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-0 px-4 lg:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">{bar}</div>
        {context ? (
          <button
            type="button"
            onClick={() => setDrawer((v) => !v)}
            aria-expanded={drawer}
            className="label inline-flex h-8 shrink-0 items-center gap-2 border border-line px-3 text-[10px] text-muted transition-colors hover:border-line-strong hover:text-fg min-[1500px]:hidden"
          >
            <PanelRight className="size-3.5" aria-hidden />
            Ficha
          </button>
        ) : null}
      </div>

      <div className="relative flex min-h-0 flex-1">
        <aside
          aria-label="Lista de conversas"
          className={cn(
            "min-h-0 w-full shrink-0 border-r border-line bg-surface-0 lg:flex lg:w-[320px] min-[1500px]:w-[340px]",
            hasThread ? "hidden" : "flex",
          )}
        >
          <div className="min-h-0 w-full">{list}</div>
        </aside>

        <section className={cn("min-h-0 min-w-0 flex-1 flex-col bg-bg lg:flex", hasThread ? "flex" : "hidden")}>{children}</section>

        {context ? (
          <>
            {drawer ? <button type="button" aria-label="Fechar ficha" onClick={() => setDrawer(false)} className="fixed inset-0 z-30 bg-black/60 min-[1500px]:hidden" /> : null}
            <aside
              aria-label="Ficha do lead"
              className={cn(
                "min-h-0 flex-col overflow-y-auto border-l border-line bg-surface-0",
                drawer
                  ? "fixed inset-y-0 right-0 z-40 flex w-[min(440px,100%)] [animation:slide-in-right_0.25s_var(--ease-out)] min-[1500px]:static min-[1500px]:z-auto min-[1500px]:w-[380px] min-[1500px]:[animation:none]"
                  : "hidden min-[1500px]:flex min-[1500px]:w-[380px] min-[1500px]:shrink-0",
              )}
            >
              {drawer ? (
                <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface-0 px-4 min-[1500px]:hidden">
                  <p className="label text-[10px] text-muted">Ficha do lead</p>
                  <button type="button" onClick={() => setDrawer(false)} aria-label="Fechar ficha" className="grid size-8 place-items-center text-muted hover:text-fg">
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ) : null}
              {context}
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
