import type { Metadata } from "next";
import { ImportDialog } from "@/components/leads/import-dialog";
import { LeadFilterBar } from "@/components/leads/lead-filters";
import { LeadTable, type LeadRowView } from "@/components/leads/lead-table";
import { TriageBoard } from "@/components/leads/triage-board";
import { SearchForm, type SourceMode } from "@/components/leads/search-form";
import { SearchHistory, type SearchView } from "@/components/leads/search-history";
import { PageBody, PageHeader, Panel } from "@/components/shell/page";
import { parsePhoneBR } from "@/lib/brazil/phone";
import { apifyToken } from "@/lib/env";
import { parseFilters, toLeadQuery } from "@/lib/leads/filters";
import { loadTriageBatches } from "@/lib/leads/triage";
import { getRepo } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Caçador" };

export default async function HunterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const repo = await getRepo();
  const kanban = filters.vista === "kanban";
  const settings = await repo.getSettings();
  // cada vista só busca o que mostra: o quadro agrupa por busca, a lista pagina
  const [page, batches, searches] = await Promise.all([
    kanban ? Promise.resolve({ rows: [], total: 0 }) : repo.listLeads(toLeadQuery(filters)),
    kanban ? loadTriageBatches(repo, filters, new Date(), settings.automation.timezone) : Promise.resolve([]),
    repo.listSearches(8),
  ]);

  const mode: SourceMode = apifyToken() ? "apify" : repo.mode === "demo" ? "demo" : "none";

  const rows: LeadRowView[] = page.rows.map((l) => ({
    id: l.id,
    name: l.name,
    category: l.category,
    neighborhood: l.neighborhood,
    city: l.city,
    phoneDisplay: parsePhoneBR(l.phoneRaw).display ?? l.phoneRaw,
    isMobile: l.isMobile,
    websiteKind: l.websiteKind,
    rating: l.rating,
    reviewsCount: l.reviewsCount,
    score: l.score,
    stage: l.stage,
    eligible: l.eligible,
    ineligibleReason: l.ineligibleReason,
    demo: l.source === "demo",
  }));

  const history: SearchView[] = searches.map((s) => ({
    id: s.id,
    niche: s.niche,
    city: s.city,
    source: s.source,
    status: s.status,
    inserted: s.inserted,
    duplicates: s.duplicates,
    eligible: s.eligible,
    error: s.error,
    createdAt: s.createdAt,
  }));

  const notice = {
    apify: { dot: "bg-accent", text: "Apify conectado. Cada busca tem teto de custo configurável." },
    demo: { dot: "bg-warn", text: "Modo demonstração: a busca gera leads fictícios, só para ver o painel." },
    none: {
      dot: "bg-danger",
      text: "Sem token do Apify. Defina APIFY_TOKEN no .env.local e reinicie, ou importe um JSON.",
    },
  }[mode];

  return (
    <>
      <PageHeader
        eyebrow="02 — Caçador"
        title="Caçador de leads"
        description="Escolha cidade e nicho. O sistema busca no Google Maps, descarta quem não tem celular e ranqueia por quem mais precisa de um site."
        actions={<ImportDialog />}
      />
      <PageBody className="flex flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title="Nova busca" eyebrow="Google Maps" bodyClassName="flex flex-col gap-4 p-4">
            <p className="flex items-start gap-2.5 text-[12px] leading-snug text-muted">
              <span aria-hidden className={cn("mt-1 size-1.5 shrink-0", notice.dot)} />
              {notice.text}
            </p>
            <SearchForm mode={mode} />
          </Panel>
          <Panel title="Buscas recentes" eyebrow="Histórico" bodyClassName="max-h-[340px] overflow-y-auto">
            <SearchHistory initial={history} />
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <LeadFilterBar filters={filters} />
          {kanban ? (
            <TriageBoard batches={batches} filters={filters} />
          ) : (
            <Panel>
              <LeadTable rows={rows} total={page.total} filters={filters} />
            </Panel>
          )}
        </div>
      </PageBody>
    </>
  );
}
