"use client";

import { useState, useTransition } from "react";
import { Power, ShieldCheck } from "lucide-react";
import { saveAutonomyAction } from "@/app/(app)/agent-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface Readiness {
  /** Chave de IA liberada (sem ela o agente responde pelas regras). */
  ai: boolean;
  whatsappConnected: boolean;
  /** Envio real ligado, fora da simulação. */
  live: boolean;
  /** Automação rodando, não pausada. */
  running: boolean;
}

const ALONE = [
  "Quem é você, como funciona, de onde tem o número, prazo e o preço inicial",
  "Cumprimentos, perguntas de descoberta e o que o lead quer do site",
  "Objeções leves: vou pensar, agora não, estou sem tempo, já tenho site ou quem faça",
  "Áudio e imagem: pede com educação para escrever (e te avisa)",
  "Perguntas fora do roteiro (\"você cria sites?\"): a IA responde com os seus fatos",
  "Garantia, hospedagem, pagamento, exemplos e desconto: com a SUA resposta escrita em Configurações",
  "Gerar a prévia e mandar o link, quando o painel tem endereço público (SITE_URL)",
];
const YOURS = [
  "Contrato e nota fiscal, e o que você não escreveu em Configurações",
  "Lead irritado ou desconfiado, pedido de ligação ou reunião, ajuste na prévia",
  "Quando a IA diz que precisa confirmar com você (a conversa segue em Precisa de você)",
  "Oferta de fechamento e Pix, a menos que você ligue o fechamento sozinho",
  "O lote do dia da Fila, a menos que você ligue o lote sozinho",
];

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <span className={cn("mt-[3px] size-2 shrink-0", ok ? "bg-accent" : "bg-danger")} aria-hidden />
      <span className={ok ? "text-muted" : "text-fg"}>{children}</span>
    </li>
  );
}

/** Liga e desliga o atendimento sozinho. Ligar pede uma frase digitada; desligar é um clique. */
export function AutonomyCard({
  mode,
  autoClose: initialClose,
  autoFreeform: initialFreeform,
  autoBatch: initialBatch,
  maxPerConversation: initialConv,
  maxPerDay: initialDay,
  readiness,
  confirmPhrase,
}: {
  mode: "copiloto" | "semi";
  autoClose: boolean;
  autoFreeform: boolean;
  autoBatch: boolean;
  maxPerConversation: number;
  maxPerDay: number;
  readiness: Readiness;
  confirmPhrase: string;
}) {
  const on = mode === "semi";
  const [autoClose, setAutoClose] = useState(initialClose);
  const [autoFreeform, setAutoFreeform] = useState(initialFreeform);
  const [autoBatch, setAutoBatch] = useState(initialBatch);
  const [perConv, setPerConv] = useState(String(initialConv));
  const [perDay, setPerDay] = useState(String(initialDay));
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (next: "copiloto" | "semi") =>
    startTransition(async () => {
      const r = await saveAutonomyAction({ mode: next, confirm, autoClose, autoFreeform, autoBatch, maxPerConversation: Number(perConv), maxPerDay: Number(perDay) });
      setNotice({ ok: r.ok, text: r.message });
      if (r.ok) setConfirm("");
    });

  const needsConfirm = !on || (autoClose && !initialClose) || (autoFreeform && !initialFreeform) || (autoBatch && !initialBatch);

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge tone={on ? "accent" : "ghost"}>{on ? "Atendendo sozinho" : "Assistido"}</Badge>
          <p className="text-[13px] text-muted">{on ? "O agente responde sozinho o que é seguro." : "O agente só escreve rascunhos. Você aprova tudo."}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="label text-[10px] text-accent">Faz sozinho</p>
            <ul className="flex flex-col gap-1.5 text-[12px] leading-snug text-muted">
              {ALONE.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <p className="label text-[10px] text-warn">Continua com você</p>
            <ul className="flex flex-col gap-1.5 text-[12px] leading-snug text-muted">
              {YOURS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-[12px] leading-snug text-faint">
          Em qualquer modo valem: PARE bloqueia na hora, horário e tetos de abordagem, uma mensagem por vez, e a pausa geral. No autônomo, a resposta sai
          20 a 90 segundos depois (e só dentro do horário de envio) e passa de novo pela trava de fatos. Se você responder pelo celular, o agente larga a
          conversa.
        </p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(on ? "semi" : "semi");
        }}
      >
        <div className="flex flex-col gap-2 border border-line p-3">
          <p className="label text-[10px] text-faint">Para as respostas saírem de verdade</p>
          <ul className="flex flex-col gap-1.5">
            <Check ok={readiness.whatsappConnected}>WhatsApp conectado</Check>
            <Check ok={readiness.live}>Envio real ligado (fora da simulação)</Check>
            <Check ok={readiness.running}>Automação rodando (não pausada)</Check>
            <Check ok={readiness.ai}>{readiness.ai ? "IA ligada" : "IA desligada: responde pelas regras do playbook"}</Check>
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Máx. por conversa" htmlFor="auto-conv" hint="Contra loop com robô">
            <Input id="auto-conv" type="number" min={1} max={30} value={perConv} onChange={(e) => setPerConv(e.target.value)} className="num" />
          </Field>
          <Field label="Máx. por dia" htmlFor="auto-day" hint="Respostas sozinho">
            <Input id="auto-day" type="number" min={1} max={300} value={perDay} onChange={(e) => setPerDay(e.target.value)} className="num" />
          </Field>
        </div>

        <label className="flex items-start gap-2 text-[13px] leading-snug">
          <input type="checkbox" className="mt-1" checked={autoFreeform} onChange={(e) => setAutoFreeform(e.target.checked)} />
          <span>
            <span className="text-fg">Responde perguntas livres</span>
            <span className="block text-[12px] text-muted">
              Quando o lead pergunta algo que as regras não conhecem, a IA responde com os seus fatos, passando pela trava, e te avisa se precisar confirmar.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-[13px] leading-snug">
          <input type="checkbox" className="mt-1" checked={autoClose} onChange={(e) => setAutoClose(e.target.checked)} />
          <span>
            <span className="text-fg">Pode fechar sozinho</span>
            <span className="block text-[12px] text-muted">Faz a oferta com valor, sinal e prazo e passa a chave Pix. Dinheiro: deixe desligado até confiar no resto.</span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-[13px] leading-snug">
          <input type="checkbox" className="mt-1" checked={autoBatch} onChange={(e) => setAutoBatch(e.target.checked)} />
          <span>
            <span className="text-fg">Aprova o lote do dia sozinho</span>
            <span className="block text-[12px] text-muted">
              Uma vez por dia, dentro do horário, prepara e aprova as aberturas e follow-ups da Fila. Os tetos, o aquecimento e os intervalos continuam valendo.
            </span>
          </span>
        </label>

        {needsConfirm ? (
          <Field label={`Para ligar, digite ${confirmPhrase}`} htmlFor="auto-confirm">
            <Input id="auto-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder={confirmPhrase} />
          </Field>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={pending || (needsConfirm && confirm.trim().length === 0)}>
            <ShieldCheck className="size-3.5" aria-hidden />
            {pending ? "Salvando…" : on ? "Salvar limites" : "Ligar atendimento sozinho"}
          </Button>
          {on ? (
            <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => send("copiloto")}>
              <Power className="size-3.5" aria-hidden />
              Voltar ao assistido
            </Button>
          ) : null}
        </div>
        {notice ? (
          <p role={notice.ok ? "status" : "alert"} className={cn("text-[12px] leading-snug", notice.ok ? "text-muted" : "text-danger")}>
            {notice.text}
          </p>
        ) : null}
      </form>
    </div>
  );
}
