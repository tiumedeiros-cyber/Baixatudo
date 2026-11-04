import type { Metadata } from "next";
import Link from "next/link";
import { Board, type BoardCardView, type BoardColumns } from "@/components/leads/board";
import { PageBody, PageHeader } from "@/components/shell/page";
import { buttonClass } from "@/components/ui/button";
import { parsePhoneBR } from "@/lib/brazil/phone";
import { STAGES, type Lead } from "@/lib/leads/types";
import { getRepo } from "@/lib/repo";

export const metadata: Metadata = { title: "Funil" };

const PER_COLUMN = 60;

function toCard(l: Lead): BoardCardView {
  return {
    id: l.id,
    name: l.name,
    sub: [l.category, l.neighborhood ?? l.city].filter(Boolean).join(" · "),
    score: l.score,
    websiteKind: l.websiteKind,
    phoneDisplay: parsePhoneBR(l.phoneRaw).display ?? l.phoneRaw,
    isMobile: l.isMobile,
    rating: l.rating,
    reviewsCount: l.reviewsCount,
    dealValue: l.stage === "ganho" ? l.dealValue : null,
    stage: l.stage,
  };
}

export default async function FunnelPage() {
  const repo = await getRepo();
  const board = await repo.board(PER_COLUMN);

  const columns = {} as BoardColumns;
  for (const stage of STAGES) {
    columns[stage] = { rows: board[stage].rows.map(toCard), total: board[stage].total };
  }

  return (
    <>
      <PageHeader
        eyebrow="03 — Funil"
        title="Funil de vendas"
        description="Arraste o lead entre as etapas. Na Fase 3, o automático passa os leads de Qualificado até Proposta sozinho."
        actions={
          <Link href="/cacador" className={buttonClass("secondary", "md")}>
            Buscar mais leads
          </Link>
        }
      />
      <PageBody>
        <Board columns={columns} />
      </PageBody>
    </>
  );
}
