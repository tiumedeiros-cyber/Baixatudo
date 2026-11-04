"use client";

import { useActionState, useState } from "react";
import { Crosshair } from "lucide-react";
import { startSearch, type ActionResult } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { NICHE_PRESETS, UFS } from "@/lib/leads/niches";
import { estimateCostUsd } from "@/lib/sources/pricing";
import { cn, formatUSD } from "@/lib/utils";

export type SourceMode = "apify" | "demo" | "none";

const LIMITS = [20, 50, 100, 200] as const;

export function SearchForm({ mode }: { mode: SourceMode }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(startSearch, null);
  const [limit, setLimit] = useState<number>(50);
  const [niche, setNiche] = useState("");
  const disabled = mode === "none" || pending;

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_92px]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="niche" className="label text-muted">
            Nicho
          </label>
          <Input
            id="niche"
            name="niche"
            list="niche-presets"
            placeholder="Ex.: Estética"
            autoComplete="off"
            required
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
          />
          <datalist id="niche-presets">
            {NICHE_PRESETS.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <Field label="Cidade" htmlFor="city">
          <Input id="city" name="city" placeholder="Ex.: Fortaleza" autoComplete="off" required />
        </Field>
        <Field label="UF" htmlFor="state">
          <Select id="state" name="state" defaultValue="CE">
            {UFS.map((u) => (
              <option key={u.uf} value={u.uf}>
                {u.uf}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nichos sugeridos">
        {NICHE_PRESETS.slice(0, 8).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNiche(n)}
            className={cn(
              "label h-6 border px-2 text-[10px] transition-colors",
              niche === n
                ? "border-accent bg-accent-dim text-accent"
                : "border-line text-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-t border-line pt-4">
        <Field label="Quantos lugares buscar" className="min-w-[260px] flex-1 sm:max-w-[360px]">
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Quantidade">
            {LIMITS.map((n) => (
              <label
                key={n}
                className={cn(
                  "num grid h-10 cursor-pointer place-items-center border text-[14px] transition-colors",
                  limit === n
                    ? "border-accent bg-accent-dim text-accent"
                    : "border-line text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                <input
                  type="radio"
                  name="limit"
                  value={n}
                  checked={limit === n}
                  onChange={() => setLimit(n)}
                  className="sr-only"
                />
                {n}
              </label>
            ))}
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex flex-col gap-0.5 text-right">
            <span className="label text-[10px] text-faint">
              {mode === "demo" ? "Demonstração" : "Custo estimado"}
            </span>
            <span className="num text-[15px] text-muted">
              {mode === "demo" ? formatUSD(0) : formatUSD(estimateCostUsd(limit))}
            </span>
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={disabled}>
            <Crosshair className="size-4" aria-hidden />
            {pending ? "Iniciando…" : mode === "demo" ? "Gerar leads de demonstração" : "Buscar no Google Maps"}
          </Button>
        </div>
      </div>

      {state ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={cn(
            "border px-3 py-2 text-[13px] leading-snug",
            state.ok ? "border-accent/40 bg-accent-dim text-accent" : "border-danger/40 bg-danger/10 text-danger",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
