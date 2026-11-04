import Link from "next/link";
import { ArrowUpRight, MapPin, Star } from "lucide-react";
import { ScoreChip, SiteBadge, StageBadge } from "@/components/leads/badges";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import type { Lead } from "@/lib/leads/types";
import { cn } from "@/lib/utils";

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="label text-[9px] text-faint">{label}</dt>
      <dd className="truncate text-[13px] text-fg">{children}</dd>
    </div>
  );
}

/** O cartão do lead no alto da ficha: quem é, onde fica, quão quente é e o atalho para a página completa. */
export function LeadCard({ lead, phone, touches, maxTouches }: { lead: Lead; phone: string; touches: number; maxTouches: number }) {
  const place = [lead.neighborhood, lead.city].filter(Boolean).join(", ") || "—";
  return (
    <section className="flex flex-col gap-4 border border-line bg-surface-1 p-4" aria-label="Lead">
      <div className="flex items-start gap-3">
        <Avatar name={lead.name} size="lg" tone="accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-[15px] leading-tight font-semibold tracking-[-0.015em] [overflow-wrap:anywhere]">{lead.name}</h2>
          <p className="truncate text-[12px] text-muted">{lead.category ?? lead.niche ?? "Negócio local"}</p>
        </div>
        <ScoreChip score={lead.score} size="md" />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line-soft py-3">
        <Row label="WhatsApp">
          <span className="num">{phone}</span>
        </Row>
        <Row label="Local">{place}</Row>
        <Row label="Avaliação">
          {lead.rating != null ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 fill-accent text-accent" aria-hidden />
              <span className="num">{lead.rating.toFixed(1)}</span>
              <span className="text-faint">({lead.reviewsCount})</span>
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Toques">
          <span className="num">
            {touches} de {maxTouches}
          </span>
        </Row>
      </dl>

      <div className="flex flex-wrap items-center gap-1.5">
        <StageBadge stage={lead.stage} />
        <SiteBadge kind={lead.websiteKind} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/leads/${lead.id}`} className={buttonClass("secondary", "sm")}>
          Abrir lead
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
        {lead.mapsUrl ? (
          <a href={lead.mapsUrl} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
            <MapPin className="size-3.5" aria-hidden />
            Ver no Maps
          </a>
        ) : null}
      </div>
    </section>
  );
}
