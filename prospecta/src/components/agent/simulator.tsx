"use client";

import { useState, useTransition } from "react";
import { FlaskConical, PlugZap } from "lucide-react";
import { simulateAgentAction, testAgentAiAction, type SimulateOutcome } from "@/app/(app)/agent-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { BANT_LABEL, HEAT_LABEL, PHASE_LABEL } from "@/lib/agent/ficha";
import { cn } from "@/lib/utils";

const EXAMPLES = ["Quanto custa?", "Já tenho site", "Vou pensar", "Quem é você?", "Dá pra parcelar?", "Gostei muito!"];

/** Testa a conexão com a IA (chave e modelo). Uma chamada mínima. */
export function TestAiButton({ aiOn }: { aiOn: boolean }) {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={!aiOn || pending}
        onClick={() =>
          startTransition(async () => {
            const r = await testAgentAiAction();
            setNotice({ ok: r.ok, text: r.message });
          })
        }
      >
        <PlugZap className="size-3.5" aria-hidden />
        {pending ? "Testando…" : "Testar a IA"}
      </Button>
      {notice ? (
        <p role={notice.ok ? "status" : "alert"} className={cn("text-[12px] leading-snug whitespace-pre-line", notice.ok ? "text-accent" : "text-danger")}>
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}

/** Escreva o que um lead diria e veja o que o agente responderia. Não grava nada e não envia nada. */
export function AgentSimulator({ aiOn }: { aiOn: boolean }) {
  const [text, setText] = useState("Quanto custa?");
  const [kind, setKind] = useState<"none" | "social" | "weak" | "real">("none");
  const [demoSent, setDemoSent] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [outcome, setOutcome] = useState<SimulateOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (t = text) =>
    startTransition(async () => setOutcome(await simulateAgentAction({ text: t, websiteKind: kind, demoSent, useAi: useAi && aiOn })));

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Field label="O que o lead escreveu" htmlFor="sim-text">
          <Textarea id="sim-text" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1.5" aria-label="Exemplos">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="border border-line px-2 py-1 text-[12px] text-muted transition-colors hover:border-accent/50 hover:text-fg"
              onClick={() => {
                setText(ex);
                run(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Site do lead" htmlFor="sim-kind">
            <Select id="sim-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="none">Sem site</option>
              <option value="social">Só Instagram</option>
              <option value="weak">Site fraco</option>
              <option value="real">Tem site</option>
            </Select>
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1 text-[13px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={demoSent} onChange={(e) => setDemoSent(e.target.checked)} />
              Prévia já enviada
            </label>
            <label className={cn("flex items-center gap-2", !aiOn && "text-faint")}>
              <input type="checkbox" checked={useAi && aiOn} disabled={!aiOn} onChange={(e) => setUseAi(e.target.checked)} />
              Usar a IA {aiOn ? "" : "(desligada)"}
            </label>
          </div>
        </div>
        <div>
          <Button type="submit" variant="primary" size="sm" disabled={pending || text.trim().length === 0}>
            <FlaskConical className="size-3.5" aria-hidden />
            {pending ? "Pensando…" : "Ver a resposta"}
          </Button>
        </div>
      </form>

      <div className="min-h-40" aria-live="polite">
        {!outcome ? (
          <p className="text-[13px] text-faint">A resposta do agente aparece aqui. Isto é só um teste: nada é salvo nem enviado.</p>
        ) : !outcome.ok ? (
          <p role="alert" className="text-[13px] text-danger">
            {outcome.message}
          </p>
        ) : (
          <Result outcome={outcome} />
        )}
      </div>
    </div>
  );
}

function Result({ outcome }: { outcome: Extract<SimulateOutcome, { ok: true }> }) {
  const r = outcome.result;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="warn">{r.topicLabel}</Badge>
        <Badge tone="accent">{r.source === "ai" ? "Escrito pela IA" : "Escrito pelas regras"}</Badge>
        <Badge tone="neutral">{HEAT_LABEL[r.ficha.heat]}</Badge>
        <Badge tone="ghost">{PHASE_LABEL[r.ficha.phase]}</Badge>
      </div>

      {r.reply ? (
        <div className="max-w-[460px] border border-accent/30 bg-accent-dim px-3.5 py-2.5">
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{r.reply}</p>
          <p className="label mt-1.5 text-[10px] text-faint">{r.reply.length} caracteres</p>
        </div>
      ) : (
        <p className="border border-line px-3.5 py-2.5 text-[13px] text-muted">O agente não escreve nada para isso: quem responde é você.</p>
      )}

      {r.handoff.needed ? (
        <p className="border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] leading-snug">
          <span className="label mr-2 text-[10px] text-warn">Chama você</span>
          {r.handoff.reason}
        </p>
      ) : null}
      {r.nextAction ? (
        <p className="text-[12px] text-muted">
          <span className="label mr-2 text-[10px] text-accent">Próximo passo</span>
          {r.nextAction.label}
        </p>
      ) : null}

      <p className="text-[12px] text-muted">
        Necessidade: {BANT_LABEL[r.ficha.need]} · Quem decide: {BANT_LABEL[r.ficha.authority]} · Orçamento: {BANT_LABEL[r.ficha.budget]} · Prazo: {BANT_LABEL[r.ficha.timing]}
      </p>

      {r.issues.length > 0 ? (
        <ul className="text-[12px] text-warn">
          {r.issues.map((i) => (
            <li key={i.rule}>Humanizador: {i.message}</li>
          ))}
        </ul>
      ) : r.reply ? (
        <p className="text-[12px] text-accent">Passou nas regras do humanizador.</p>
      ) : null}
      {r.notes.length > 0 ? <p className="text-[12px] text-faint">{r.notes.join(" ")}</p> : null}
    </div>
  );
}
