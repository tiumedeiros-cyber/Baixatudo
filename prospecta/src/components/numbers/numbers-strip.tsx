import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import type { NumberOverview } from "@/lib/outreach/numbers";

/** Os números de relance: quem está enviando, quanto já mandou hoje e quanto falta na fila de cada um. */
export function NumbersStrip({ numbers }: { numbers: NumberOverview[] }) {
  return (
    <Panel
      title={`Números (${numbers.length})`}
      eyebrow="Cada um com a sua fila"
      action={
        <Link href="/numeros" className="label inline-flex items-center gap-1 text-muted hover:text-fg">
          Gerenciar <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      }
    >
      <ul className="flex flex-col">
        {numbers.map((n) => {
          const state = n.paused ? { tone: "warn" as const, label: "Pausado" } : n.connected ? { tone: "accent" as const, label: "Enviando" } : { tone: "danger" as const, label: "Desconectado" };
          return (
            <li key={n.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{n.name}</p>
                <p className="label text-[10px] text-faint">
                  hoje <span className="num">{n.sentToday}/{n.capToday}</span> · na fila <span className="num">{n.queued}</span>
                  {n.drafts > 0 ? <> · aprovar <span className="num">{n.drafts}</span></> : null}
                </p>
              </div>
              <Badge tone={state.tone} dot>
                {state.label}
              </Badge>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
