"use client";

import { useActionState, useState, useTransition } from "react";
import { saveAutomationAction, setDryRunAction } from "@/app/(app)/outreach-actions";
import type { ActionResult } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { AutomationConfig } from "@/lib/outreach/config";
import { cn } from "@/lib/utils";

const DAYS = [
  [1, "Seg"],
  [2, "Ter"],
  [3, "Qua"],
  [4, "Qui"],
  [5, "Sex"],
  [6, "Sáb"],
  [7, "Dom"],
] as const;

/** Regras anti-banimento: horários, tetos, intervalos e toques. Tem limites duros no servidor. */
export function AutomationSettings({
  cfg,
  senderName,
  brandName,
  senderFullName,
  senderRole,
}: {
  cfg: AutomationConfig;
  senderName: string;
  brandName: string;
  senderFullName: string;
  senderRole: string;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveAutomationAction, null);
  const morning = cfg.windows[0] ?? { from: "09:00", to: "12:00" };
  const afternoon = cfg.windows[1] ?? { from: "14:00", to: "18:00" };

  return (
    <form action={action} className="flex flex-col gap-6 p-4">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Seu nome nas mensagens" htmlFor="senderName">
          <Input id="senderName" name="senderName" defaultValue={senderName} />
        </Field>
        <Field label="Nome da marca" htmlFor="brandName">
          <Input id="brandName" name="brandName" defaultValue={brandName} />
        </Field>
        <Field label="Nome completo na 1ª abordagem" htmlFor="senderFullName" hint="Como você se apresenta: “Sou o Jonathan Kelvin, desenvolvedor”. A marca não aparece na abertura.">
          <Input id="senderFullName" name="senderFullName" defaultValue={senderFullName} />
        </Field>
        <Field label="Como você se define" htmlFor="senderRole" hint="Continua a frase “Sou o Jonathan Kelvin, …”. Ex.: desenvolvedor e ajudo empresas a se posicionarem na internet.">
          <Input id="senderRole" name="senderRole" defaultValue={senderRole} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3 border-t border-line pt-5">
        <legend className="label pb-1 text-muted">Quando enviar (horário de Fortaleza)</legend>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Manhã, das" htmlFor="morningFrom">
            <Input id="morningFrom" name="morningFrom" type="time" defaultValue={morning.from} className="num" />
          </Field>
          <Field label="até" htmlFor="morningTo">
            <Input id="morningTo" name="morningTo" type="time" defaultValue={morning.to} className="num" />
          </Field>
          <Field label="Tarde, das" htmlFor="afternoonFrom">
            <Input id="afternoonFrom" name="afternoonFrom" type="time" defaultValue={afternoon.from} className="num" />
          </Field>
          <Field label="até" htmlFor="afternoonTo">
            <Input id="afternoonTo" name="afternoonTo" type="time" defaultValue={afternoon.to} className="num" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
          {DAYS.map(([n, label]) => (
            <label key={n} className="label flex h-9 cursor-pointer items-center gap-2 border border-line px-3 text-[11px] has-[:checked]:border-accent has-[:checked]:bg-accent-dim has-[:checked]:text-accent">
              <input type="checkbox" name="weekdays" value={n} defaultChecked={cfg.weekdays.includes(n)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-line pt-5">
        <legend className="label pb-1 text-muted">Aquecimento: abordagens novas por dia</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Semana 1 (opcional)" htmlFor="week1" hint="Em branco: usa o teto da semana 2">
            <Input id="week1" name="week1" type="number" min={1} placeholder="sem rampa" defaultValue={cfg.caps.week1 ?? ""} className="num" />
          </Field>
          <Field label="Semana 2 (opcional)" htmlFor="week2" hint="Em branco: usa o &quot;Depois&quot;">
            <Input id="week2" name="week2" type="number" min={1} placeholder="sem rampa" defaultValue={cfg.caps.week2 ?? ""} className="num" />
          </Field>
          <Field label="Depois" htmlFor="steady" hint="O teto normal, sem máximo: o número é seu">
            <Input id="steady" name="steady" type="number" min={1} defaultValue={cfg.caps.steady} className="num" />
          </Field>
        </div>
        <p className="text-[12px] leading-snug text-faint">
          Se o número já está aquecido, deixe as duas semanas em branco e só o &quot;Depois&quot; vale desde o primeiro dia. A contagem das semanas começa no primeiro
          envio real. Número novo que dispara muito logo no começo é o que mais cai.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-line pt-5">
        <legend className="label pb-1 text-muted">Ritmo humano</legend>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Intervalo mínimo (min)" htmlFor="gapMin" hint="Piso de 1 min">
            <Input id="gapMin" name="gapMin" type="number" min={1} max={60} step={0.5} defaultValue={cfg.gapMinSec / 60} className="num" />
          </Field>
          <Field label="Intervalo máximo (min)" htmlFor="gapMax">
            <Input id="gapMax" name="gapMax" type="number" min={1} max={120} step={0.5} defaultValue={cfg.gapMaxSec / 60} className="num" />
          </Field>
          <Field label="Toques por lead" htmlFor="maxTouches" hint="Abertura + follow-ups">
            <Input id="maxTouches" name="maxTouches" type="number" min={1} max={4} defaultValue={cfg.maxTouches} className="num" />
          </Field>
          <Field label="Atendimento" htmlFor="autonomy" hint="Quem responde os leads. Muda na tela Agente.">
            <p id="autonomy" className="flex h-10 items-center text-[13px]">
              {cfg.autonomy === "semi" ? "Agente responde sozinho o que é seguro" : "Assistido: você aprova tudo"}
            </p>
          </Field>
          <Field label="1º follow-up (dias)" htmlFor="followUp1">
            <Input id="followUp1" name="followUp1" type="number" min={1} max={30} defaultValue={cfg.followUpDays[0] ?? 2} className="num" />
          </Field>
          <Field label="2º follow-up (dias)" htmlFor="followUp2">
            <Input id="followUp2" name="followUp2" type="number" min={2} max={60} defaultValue={cfg.followUpDays[1] ?? 5} className="num" />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        {state ? (
          <p role={state.ok ? "status" : "alert"} className={cn("text-[13px]", state.ok ? "text-accent" : "text-danger")}>
            {state.message}
          </p>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar regras de envio"}
        </Button>
      </div>
    </form>
  );
}

/** Interruptor do envio real. Ligar a simulação é livre; sair dela exige digitar ENVIAR. */
export function RealSendSwitch({ dryRun, ready, readyText }: { dryRun: boolean; ready: boolean; readyText: string }) {
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await fn();
      setNotice({ ok: r.ok, text: r.message });
      if (r.ok) setConfirm("");
    });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-[14px] font-medium">{dryRun ? "Hoje: simulação" : "Hoje: envio real"}</p>
        <p className="text-[13px] leading-relaxed text-muted">
          {dryRun
            ? "O worker registra o que enviaria, mas nada sai do computador. Use para conferir horários e textos sem risco."
            : "As mensagens aprovadas saem de verdade pelo WhatsApp conectado, nos horários permitidos."}
        </p>
      </div>

      {dryRun ? (
        <div className="flex flex-col gap-3 border border-line p-3">
          <p className={cn("text-[12px] leading-snug", ready ? "text-muted" : "text-warn")}>{readyText}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Para ligar, digite ENVIAR" htmlFor="confirm-send" className="min-w-[200px] flex-1">
              <Input
                id="confirm-send"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="ENVIAR"
                autoComplete="off"
                disabled={!ready}
              />
            </Field>
            <Button
              variant="danger"
              disabled={pending || !ready || confirm.trim().toUpperCase() !== "ENVIAR"}
              onClick={() => run(() => setDryRunAction(false, confirm))}
            >
              Ligar envio real
            </Button>
          </div>
          <p className="text-[12px] leading-snug text-faint">
            Mesmo depois de ligado, a automação continua pausada até você clicar em Retomar. São duas decisões.
          </p>
        </div>
      ) : (
        <div>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setDryRunAction(true))}>
            Voltar para a simulação
          </Button>
        </div>
      )}

      {notice ? (
        <p role={notice.ok ? "status" : "alert"} className={cn("text-[13px] leading-snug", notice.ok ? "text-accent" : "text-danger")}>
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
