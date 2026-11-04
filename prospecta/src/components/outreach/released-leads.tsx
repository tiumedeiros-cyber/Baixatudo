"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { prepareForNumberAction } from "@/app/(app)/numeros-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface ReleasedGroupView {
  key: string;
  label: string;
  count: number;
  topScore: number;
  sample: string[];
}

export interface NumberOption {
  id: string;
  name: string;
  paused: boolean;
  connected: boolean;
  capToday: number;
}

const DEFAULT_COUNT = 30;

function GroupRow({ group, numbers }: { group: ReleasedGroupView; numbers: NumberOption[] }) {
  const [accountId, setAccountId] = useState("");
  const [count, setCount] = useState(String(Math.min(group.count, DEFAULT_COUNT)));
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const chosen = numbers.find((n) => n.id === accountId);
  const qty = Math.min(group.count, Math.max(1, Number(count) || 0));
  const days = chosen ? Math.max(1, Math.ceil(qty / Math.max(1, chosen.capToday))) : null;

  return (
    <li className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tracking-[-0.01em]">{group.label}</p>
          <p className="truncate text-[12px] text-muted">
            {group.sample.join(", ")}
            {group.count > group.sample.length ? ` e mais ${group.count - group.sample.length}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="accent">{group.count} {group.count === 1 ? "lead" : "leads"}</Badge>
          <Badge tone="ghost">nota máx. {group.topScore}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="label text-[10px] text-muted">Para qual número</span>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9 w-56 text-[13px]" aria-label={`Número para ${group.label}`}>
            <option value="">Escolha o número…</option>
            {numbers.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
                {n.paused ? " (pausado)" : !n.connected ? " (desconectado)" : ""}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label text-[10px] text-muted">Quantos (melhores primeiro)</span>
          <Input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="h-9 w-24 text-[13px]" aria-label={`Quantos leads de ${group.label}`} />
        </label>
        <Button
          variant="primary"
          size="md"
          disabled={pending || !accountId || qty < 1}
          onClick={() =>
            start(async () => {
              const r = await prepareForNumberAction({ accountId, groupKey: group.key, count: qty });
              setNotice({ ok: r.ok, text: r.message });
            })
          }
        >
          <Send className="size-4" aria-hidden />
          {pending ? "O agente está escrevendo…" : `Preparar ${qty} ${chosen ? `no ${chosen.name}` : ""}`.trim()}
        </Button>
      </div>

      {chosen && days ? (
        <p className="text-[11.5px] leading-snug text-faint">
          {chosen.name} manda até {chosen.capToday} por dia: {qty} {qty === 1 ? "lead sai" : "leads saem"} em {days} {days === 1 ? "dia útil" : "dias úteis"} depois que você aprovar.
          {chosen.paused ? " Ele está pausado: libere o envio em Números." : ""}
        </p>
      ) : null}
      {notice ? (
        <p
          role={notice.ok ? "status" : "alert"}
          className={cn("border px-3 py-2 text-[12.5px] leading-snug", notice.ok ? "border-accent/40 bg-accent-dim text-accent" : "border-danger/40 bg-danger/10 text-danger")}
        >
          {notice.text}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Os leads que você liberou (Qualificado), por ramo e cidade. Você escolhe para qual número vai cada grupo; o agente escreve a
 * abertura de cada um (todas diferentes entre si) e os rascunhos esperam seu OK logo abaixo. Nada sai daqui.
 */
export function ReleasedLeads({ groups, numbers }: { groups: ReleasedGroupView[]; numbers: NumberOption[] }) {
  if (groups.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[13px] text-faint">
        Nenhum lead liberado esperando número.{" "}
        <Link href="/cacador" className="text-accent hover:underline">
          Qualifique leads no Caçador
        </Link>{" "}
        e eles aparecem aqui, agrupados por ramo e cidade.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {groups.map((g) => (
        <GroupRow key={g.key} group={g} numbers={numbers} />
      ))}
    </ul>
  );
}
