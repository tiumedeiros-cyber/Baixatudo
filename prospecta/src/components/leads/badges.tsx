import { Badge, type BadgeTone } from "@/components/ui/badge";
import { scoreBand } from "@/lib/leads/score";
import {
  INELIGIBLE_LABEL,
  STAGE_LABEL,
  WEBSITE_LABEL,
  type IneligibleReason,
  type Stage,
  type WebsiteKind,
} from "@/lib/leads/types";
import { cn } from "@/lib/utils";

const BAND_CLASS = {
  hot: "bg-accent text-accent-ink border-accent",
  warm: "border-accent/70 text-accent bg-accent-dim",
  mild: "border-warn/60 text-warn bg-warn/10",
  cold: "border-line-strong text-muted bg-transparent",
} as const;

/** Quadrado com a nota de 0 a 100; a cor diz o quão quente é o lead. */
export function ScoreChip({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "size-16 text-[26px]" : size === "sm" ? "size-8 text-[12px]" : "size-10 text-[15px]";
  return (
    <span
      title={`Nota ${score} de 100`}
      className={cn("num grid shrink-0 place-items-center border font-medium", dims, BAND_CLASS[scoreBand(score)])}
    >
      {score}
    </span>
  );
}

const SITE_TONE: Record<WebsiteKind, BadgeTone> = {
  none: "accent",
  social: "accent",
  weak: "warn",
  real: "ghost",
};

export function SiteBadge({ kind }: { kind: WebsiteKind }) {
  return <Badge tone={SITE_TONE[kind]}>{WEBSITE_LABEL[kind]}</Badge>;
}

const STAGE_TONE: Record<Stage, BadgeTone> = {
  novo: "ghost",
  qualificado: "neutral",
  contatado: "info",
  respondeu: "warn",
  proposta: "warn",
  ganho: "accent",
  perdido: "danger",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>;
}

export function IneligibleBadge({ reason }: { reason: IneligibleReason }) {
  return <Badge tone="danger">{INELIGIBLE_LABEL[reason]}</Badge>;
}
