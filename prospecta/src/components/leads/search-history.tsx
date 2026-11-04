"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { SearchStatus } from "@/lib/leads/types";
import { timeAgo } from "@/lib/utils";

export interface SearchView {
  id: string;
  niche: string;
  city: string;
  source: "apify" | "json" | "demo";
  status: SearchStatus;
  inserted: number;
  duplicates: number;
  eligible: number;
  error: string | null;
  createdAt: string;
}

const TONE: Record<SearchStatus, { tone: BadgeTone; label: string }> = {
  running: { tone: "info", label: "Buscando…" },
  ingesting: { tone: "info", label: "Importando…" },
  done: { tone: "accent", label: "Concluída" },
  failed: { tone: "danger", label: "Falhou" },
};

const SOURCE_LABEL = { apify: "Maps", json: "JSON", demo: "Demo" } as const;

const POLL_MS = 4000;

/** Lista das últimas buscas. As que estão rodando se atualizam sozinhas. */
export function SearchHistory({ initial }: { initial: SearchView[] }) {
  const router = useRouter();
  const [live, setLive] = useState<Record<string, Partial<SearchView>>>({});

  const open = initial.filter((s) => {
    const status = live[s.id]?.status ?? s.status;
    return status === "running" || status === "ingesting";
  });
  const openKey = open.map((s) => s.id).join(",");

  useEffect(() => {
    if (!openKey) return;
    let stopped = false;
    const ids = openKey.split(",");

    async function tick() {
      let finished = false;
      for (const id of ids) {
        try {
          const res = await fetch(`/api/searches/${id}`, { cache: "no-store" });
          if (!res.ok) continue;
          const data = (await res.json()) as Partial<SearchView> & { status: SearchStatus };
          if (stopped) return;
          setLive((prev) => ({ ...prev, [id]: data }));
          if (data.status === "done" || data.status === "failed") finished = true;
        } catch {
          /* rede instável: tenta de novo no próximo ciclo */
        }
      }
      if (finished && !stopped) router.refresh();
    }

    const timer = setInterval(tick, POLL_MS);
    void tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [openKey, router]);

  if (initial.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-faint">Nenhuma busca ainda.</p>;
  }

  return (
    <ul className="flex flex-col">
      {initial.map((s) => {
        const view = { ...s, ...live[s.id] } as SearchView;
        const t = TONE[view.status];
        const busy = view.status === "running" || view.status === "ingesting";
        return (
          <li key={s.id} className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[13px]">
                {s.niche} · {s.city}
              </p>
              <Badge tone={t.tone}>
                {busy ? <span aria-hidden className="pulse-sq inline-block size-1.5 bg-current" /> : null}
                {t.label}
              </Badge>
            </div>
            <p className="label flex flex-wrap gap-x-2 text-[10px] text-faint">
              <span>{SOURCE_LABEL[s.source]}</span>
              <span>{timeAgo(s.createdAt)}</span>
              {view.status === "done" ? (
                <span className="text-muted">
                  {view.inserted} novos · {view.eligible} elegíveis · {view.duplicates} repetidos
                </span>
              ) : null}
            </p>
            {view.status === "failed" && view.error ? (
              <p className="text-[12px] leading-snug text-danger">{view.error}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
