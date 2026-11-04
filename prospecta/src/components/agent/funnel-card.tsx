import { Panel } from "@/components/shell/page";
import type { FunnelGroup, FunnelReport } from "@/lib/outreach/funnel";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function Groups({ title, rows }: { title: string; rows: FunnelGroup[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="label text-[10px] text-faint">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="label text-left text-[10px] text-faint">
              <th className="py-1 pr-3 font-normal">Grupo</th>
              <th className="px-2 py-1 text-right font-normal">Enviadas</th>
              <th className="px-2 py-1 text-right font-normal">Pessoa</th>
              <th className="px-2 py-1 text-right font-normal">Apresentação</th>
              <th className="py-1 pl-2 text-right font-normal">Escreveram depois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, 6).map((g) => (
              <tr key={g.key}>
                <td className="max-w-[220px] truncate py-1.5 pr-3 text-muted">{g.label}</td>
                <td className="num px-2 py-1.5 text-right">{g.sent}</td>
                <td className="num px-2 py-1.5 text-right">{g.people}</td>
                <td className="num px-2 py-1.5 text-right">{g.presented}</td>
                <td className="num py-1.5 pl-2 text-right">{g.afterPresentation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Onde as conversas esfriam, passo a passo, para saber o que mexer antes de mexer no texto. */
export function FunnelCard({ report }: { report: FunnelReport }) {
  const empty = report.sent === 0;
  return (
    <Panel title="Funil do agente" eyebrow={`Últimos ${report.days} dias · ${report.sent} aberturas enviadas`}>
      {empty ? (
        <p className="p-4 text-[13px] text-faint">Ainda não saiu nenhuma abertura neste período. Quando sair, cada passo da conversa aparece aqui.</p>
      ) : (
        <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <ol className="flex flex-col gap-2.5">
            {report.steps.map((s) => (
              <li key={s.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-fg">{s.label}</span>
                  <span className="num shrink-0 text-muted">
                    {s.count}
                    {s.ofPrev !== null ? <span className="text-faint"> · {pct(s.ofPrev)} do passo anterior</span> : null}
                    {s.outOfOrder ? <span className="text-faint"> · veio por outro caminho (roteiro antigo)</span> : null}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-2" role="presentation">
                  <div className="h-full bg-accent" style={{ width: `${Math.round((s.ofStart ?? 0) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ol>

          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Nunca responderam", report.lost.silent],
                ["Só o robô respondeu", report.lost.botOnly],
                ["Calaram depois da apresentação", report.lost.stoppedAfterPresentation],
              ].map(([label, n]) => (
                <div key={label} className="flex flex-col gap-0.5 border border-line px-3 py-2">
                  <span className="label text-[10px] leading-tight text-faint">{label}</span>
                  <span className="num text-[18px] font-semibold">{n}</span>
                </div>
              ))}
            </div>
            <Groups title="Por tipo de abertura" rows={report.byAngle} />
            <Groups title="Por ramo" rows={report.byNiche} />
            <p className="text-[11px] leading-snug text-faint">
              Cada passo conta conversas, e resposta automática do negócio não conta como pessoa. Com poucas aberturas os percentuais oscilam muito: compare só depois de algumas dezenas.
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}
