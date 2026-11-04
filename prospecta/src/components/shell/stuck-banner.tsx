import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { describeStuck, type StuckQueue } from "@/lib/outreach/stuck-queue";

/**
 * A faixa no alto de toda página quando algum número tem fila parada. Some sozinha quando a fila anda, é cancelada ou passa
 * para outro número. Só avisa: não envia nem muda nada.
 */
export function StuckBanner({ queues }: { queues: StuckQueue[] }) {
  if (queues.length === 0) return null;
  // passar a fila só resolve fila vencida de número parado; mensagem presa em "enviando" e robô parado não se resolvem assim
  const canMove = queues.some((q) => q.canMove && (q.cause === "offline" || q.cause === "paused"));
  return (
    <section role="alert" aria-label="Fila parada" className="border-b border-warn/40 bg-warn/10">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3 lg:px-10">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="label text-[10px] text-warn">{queues.length === 1 ? "Fila parada" : `Fila parada em ${queues.length} números`}</p>
          <ul className="flex flex-col gap-0.5">
            {queues.map((q) => (
              <li key={q.accountId} className="text-[13px] leading-snug text-fg/90">
                {describeStuck(q)}
              </li>
            ))}
          </ul>
        </div>
        <Link href="/numeros" className="label shrink-0 self-center text-accent hover:underline">
          {canMove ? "Ver e passar a fila →" : "Ver em Números →"}
        </Link>
      </div>
    </section>
  );
}
