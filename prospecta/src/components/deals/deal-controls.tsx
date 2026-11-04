"use client";

import { useActionState, useState, useTransition } from "react";
import { Archive, ArrowUpRight, Ban, Check, Copy, Eye, MessageSquarePlus, Plus, RotateCcw } from "lucide-react";
import {
  createProposalAction,
  draftDemoMessageAction,
  draftProposalMessageAction,
  generateDemoAction,
  setDemoStatusAction,
  setProposalStatusAction,
} from "@/app/(app)/deal-actions";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  DEMO_PALETTE_LABEL,
  DEMO_PALETTES,
  DEMO_TEMPLATE_LABEL,
  DEMO_TEMPLATES,
  PROPOSAL_LABEL,
  type DemoPalette,
  type DemoTemplate,
  type ProposalStatus,
} from "@/lib/deals/types";
import { cn } from "@/lib/utils";

type Notice = { ok: boolean; text: string } | null;

function Line({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p role={notice.ok ? "status" : "alert"} className={cn("text-[12px] leading-snug", notice.ok ? "text-muted" : "text-danger")}>
      {notice.text}
    </p>
  );
}

/** Roda uma ação do servidor e guarda o aviso de sucesso ou erro. */
function useRunner() {
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setNotice({ ok: r.ok, text: r.message });
    });
  return { notice, setNotice, pending, run };
}

// ───────────────────────── prévia ─────────────────────────

export function GenerateDemoForm({ leadId, suggested }: { leadId: string; suggested: { template: DemoTemplate; palette: DemoPalette } }) {
  const [template, setTemplate] = useState<DemoTemplate>(suggested.template);
  const [palette, setPalette] = useState<DemoPalette>(suggested.palette);
  const { notice, pending, run } = useRunner();
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Modelo" htmlFor={`tpl-${leadId}`}>
          <Select id={`tpl-${leadId}`} value={template} onChange={(e) => setTemplate(e.target.value as DemoTemplate)}>
            {DEMO_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {DEMO_TEMPLATE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cores" htmlFor={`pal-${leadId}`}>
          <Select id={`pal-${leadId}`} value={palette} onChange={(e) => setPalette(e.target.value as DemoPalette)}>
            {DEMO_PALETTES.map((p) => (
              <option key={p} value={p}>
                {DEMO_PALETTE_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div>
        <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => generateDemoAction(leadId, template, palette))}>
          <Plus className="size-3.5" aria-hidden />
          {pending ? "Gerando…" : "Gerar prévia do site"}
        </Button>
      </div>
      <Line notice={notice} />
    </div>
  );
}

export function DemoActions({
  demoId,
  slug,
  fullUrl,
  published,
}: {
  demoId: string;
  slug: string;
  fullUrl: string;
  published: boolean;
}) {
  const { notice, setNotice, pending, run } = useRunner();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setNotice(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ ok: false, text: `Não consegui copiar sozinho. O link é: ${fullUrl}` });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {published ? (
          <a href={`/p/${slug}?interno=1`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
            <Eye className="size-3.5" aria-hidden />
            Abrir
          </a>
        ) : null}
        {published ? (
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        ) : null}
        {published ? (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => draftDemoMessageAction(demoId))}>
            <MessageSquarePlus className="size-3.5" aria-hidden />
            Preparar mensagem
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (published && !window.confirm("Tirar esta prévia do ar? O link deixa de abrir para quem já o recebeu.")) return;
            run(() => setDemoStatusAction(demoId, published ? "archived" : "published"));
          }}
        >
          {published ? <Archive className="size-3.5" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />}
          {published ? "Tirar do ar" : "Publicar de novo"}
        </Button>
      </div>
      <Line notice={notice} />
    </div>
  );
}

// ───────────────────────── proposta ─────────────────────────

export function NewProposalForm({
  leadId,
  demoId,
  defaultAmount,
  defaultEntryPct = 50,
  defaultDays = 7,
}: {
  leadId: string;
  demoId?: string;
  defaultAmount: string;
  /** Vêm das Configurações, as mesmas que o agente cita nas conversas. */
  defaultEntryPct?: number;
  defaultDays?: number;
}) {
  const [state, action, pending] = useActionState(createProposalAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="leadId" value={leadId} />
      {demoId ? <input type="hidden" name="demoId" value={demoId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="O que está sendo vendido" htmlFor={`title-${leadId}`} className="sm:col-span-2">
          <Input id={`title-${leadId}`} name="title" defaultValue="Site de 1 página" maxLength={120} required />
        </Field>
        <Field label="Valor (R$)" htmlFor={`amount-${leadId}`}>
          <Input id={`amount-${leadId}`} name="amount" inputMode="decimal" defaultValue={defaultAmount} className="num" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sinal (%)" htmlFor={`entry-${leadId}`}>
            <Input id={`entry-${leadId}`} name="entryPct" type="number" min={0} max={100} defaultValue={defaultEntryPct} className="num" />
          </Field>
          <Field label="Prazo (dias)" htmlFor={`days-${leadId}`}>
            <Input id={`days-${leadId}`} name="deliveryDays" type="number" min={1} max={90} defaultValue={defaultDays} className="num" />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          <Plus className="size-3.5" aria-hidden />
          {pending ? "Criando…" : "Criar proposta"}
        </Button>
        {state ? (
          <p role={state.ok ? "status" : "alert"} className={cn("text-[12px]", state.ok ? "text-muted" : "text-danger")}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

const STEP_LABEL: Partial<Record<ProposalStatus, string>> = {
  sent: "Marcar como enviada",
  accepted: "Cliente aceitou",
  entry_paid: "Recebi o sinal",
  paid: "Recebi tudo",
  cancelled: "Cancelar",
  draft: "Reabrir como rascunho",
};

const CONFIRM: Partial<Record<ProposalStatus, string>> = {
  entry_paid: "Confirmar que o SINAL já caiu na sua conta? O lead vira Ganho e o projeto é aberto em Produção.",
  paid: "Confirmar que o valor TOTAL já caiu na sua conta? O lead vira Ganho e o projeto é aberto em Produção.",
  cancelled: "Cancelar esta proposta?",
};

export function ProposalActions({ proposalId, status, next }: { proposalId: string; status: ProposalStatus; next: ProposalStatus[] }) {
  const { notice, pending, run } = useRunner();
  const canMessage = status === "draft" || status === "sent" || status === "accepted" || status === "entry_paid";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {canMessage ? (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => draftProposalMessageAction(proposalId))}>
            <MessageSquarePlus className="size-3.5" aria-hidden />
            Preparar mensagem com o valor
          </Button>
        ) : null}
        {next.map((to) => (
          <Button
            key={to}
            variant={to === "cancelled" ? "danger" : to === "entry_paid" || to === "paid" ? "primary" : "secondary"}
            size="sm"
            disabled={pending}
            onClick={() => {
              const ask = CONFIRM[to];
              if (ask && !window.confirm(ask)) return;
              run(() => setProposalStatusAction(proposalId, to));
            }}
          >
            {to === "cancelled" ? <Ban className="size-3.5" aria-hidden /> : to === "entry_paid" || to === "paid" ? <Check className="size-3.5" aria-hidden /> : <ArrowUpRight className="size-3.5" aria-hidden />}
            {STEP_LABEL[to] ?? PROPOSAL_LABEL[to]}
          </Button>
        ))}
      </div>
      <Line notice={notice} />
    </div>
  );
}
