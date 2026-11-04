"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, Check, Pencil, Pause, Play, PlugZap, QrCode, RefreshCw, Trash2, Unplug } from "lucide-react";
import {
  checkNumberAction,
  connectNumberCodeAction,
  connectNumberQrAction,
  disconnectNumberAction,
  moveQueueAction,
  reconnectNumberAction,
  renameNumberAction,
  replaceNumberDeviceAction,
  retireNumberAction,
  setNumberCapsAction,
  setNumberPausedAction,
  linkExistingDeviceAction,
  type ConnectResult,
} from "@/app/(app)/numeros-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn, timeAgo } from "@/lib/utils";

export interface NumberView {
  id: string;
  name: string;
  legacy: boolean;
  phone: string | null;
  paused: boolean;
  pausedReason: string | null;
  connected: boolean;
  /** O aparelho dele foi apagado no GOWA. */
  deviceMissing: boolean;
  detail: string;
  sentToday: number;
  capToday: number;
  queued: number;
  drafts: number;
  nextAt: string | null;
  sentTotal: number;
  replyRate: number | null;
  lastSendAt: string | null;
  failures: number;
  caps: { week1: number | null; week2: number | null; steady: number };
  /** Só com GOWA configurado dá para conectar, cadastrar e desconectar. */
  canManage: boolean;
  /** Aparelhos do GOWA que nenhum número usa. */
  freeDevices: { id: string; label: string }[];
  /** Os outros números que podem receber a fila deste. */
  others: { id: string; name: string; connected: boolean; paused: boolean; sentToday: number; capToday: number; queued: number }[];
}

type Notice = { ok: boolean; text: string } | null;

function Line({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role={notice.ok ? "status" : "alert"}
      className={cn("border px-3 py-2 text-[12.5px] leading-snug", notice.ok ? "border-accent/40 bg-accent-dim text-accent" : "border-danger/40 bg-danger/10 text-danger")}
    >
      {notice.text}
    </p>
  );
}

function pct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0).replace(".", ",")}%`;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="label text-[9px] text-faint">{label}</span>
      <span className="num text-[18px] leading-none font-medium tracking-[-0.02em]">{value}</span>
      {sub ? <span className="truncate text-[11px] text-muted">{sub}</span> : null}
    </div>
  );
}

/** O cartão de um número: o nome (a única coisa que o dono edita), o estado e o que ele fez hoje. */
export function NumberCard({ n, now }: { n: NumberView; now: number }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(n.name);
  const [panel, setPanel] = useState<"qr" | "code" | "ajustes" | "fila" | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [qr, setQr] = useState<{ src: string; seconds: number } | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [caps, setCaps] = useState({ week1: n.caps.week1?.toString() ?? "", week2: n.caps.week2?.toString() ?? "", steady: n.caps.steady.toString() });
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [pickedDevice, setPickedDevice] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: (ok: boolean) => void) =>
    start(async () => {
      const r = await fn();
      setNotice({ ok: r.ok, text: r.message });
      after?.(r.ok);
    });

  const connect = (fn: () => Promise<ConnectResult>) =>
    start(async () => {
      const r = await fn();
      setNotice({ ok: r.ok, text: r.message });
      if (r.ok && r.qr) setQr({ src: r.qr, seconds: r.seconds ?? 30 });
      if (r.ok && r.code) setCode(r.code);
    });

  /** Cria um aparelho novo e já mostra o QR para escanear. */
  const replaceDevice = () =>
    start(async () => {
      const r = await replaceNumberDeviceAction(n.id);
      setNotice({ ok: r.ok, text: r.message });
      setConfirmReplace(false);
      if (r.ok) {
        setPanel("qr");
        if (r.qr) setQr({ src: r.qr, seconds: r.seconds ?? 30 });
      }
    });

  const state = n.deviceMissing
    ? { tone: "danger" as const, label: "Sem aparelho" }
    : n.paused
    ? { tone: "warn" as const, label: "Pausado" }
    : n.connected
      ? { tone: "accent" as const, label: "Enviando" }
      : { tone: "danger" as const, label: "Desconectado" };

  return (
    <article className={cn("flex flex-col gap-4 border bg-surface-1 p-4", n.connected && !n.paused ? "border-accent-line" : "border-line")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          {editing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => renameNumberAction(n.id, name), (done) => done && setEditing(false));
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Nome do número" className="h-9 w-56" autoFocus />
              <Button type="submit" variant="primary" size="sm" disabled={pending}>
                <Check className="size-3.5" aria-hidden />
                Salvar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setEditing(false);
                  setName(n.name);
                }}
              >
                Cancelar
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[18px] font-semibold tracking-[-0.02em]">{n.name}</h2>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="grid size-7 place-items-center text-muted transition-colors hover:bg-surface-3 hover:text-fg"
                aria-label={`Renomear ${n.name}`}
                title="Mudar o nome"
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
          <p className="num text-[12px] text-muted">{n.phone ?? "WhatsApp ainda sem telefone registrado"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {n.legacy ? <Badge tone="ghost">Original</Badge> : null}
          <Badge tone={state.tone} dot>
            {state.label}
          </Badge>
        </div>
      </header>

      {n.paused && n.pausedReason ? <p className="text-[12px] leading-snug text-warn">{n.pausedReason}</p> : null}
      {n.deviceMissing ? (
        <div className="flex flex-col gap-3 border border-danger/40 bg-danger/5 p-3">
          <p className="text-[12.5px] leading-snug text-danger">
            O aparelho deste número foi apagado do GOWA, então nada sai por ele. O número continua aqui com a fila e as conversas; falta ligá-lo a um aparelho.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="primary" size="sm" disabled={pending || !n.canManage} onClick={replaceDevice}>
              <PlugZap className="size-3.5" aria-hidden />
              Conectar em aparelho novo
            </Button>
            {n.freeDevices.length > 0 ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="label text-[10px] text-muted">ou usar um que já existe</span>
                  <select
                    value={pickedDevice}
                    onChange={(e) => setPickedDevice(e.target.value)}
                    aria-label="Aparelho do GOWA"
                    className="h-8 border border-line bg-surface-1 px-2 text-[12px] text-fg"
                  >
                    <option value="">Escolha…</option>
                    {n.freeDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="secondary" size="sm" disabled={pending || !pickedDevice} onClick={() => run(() => linkExistingDeviceAction(n.id, pickedDevice))}>
                  Usar este aparelho
                </Button>
              </>
            ) : null}
          </div>
          <p className="text-[11.5px] leading-snug text-faint">
            O número fica pausado até você conectar o WhatsApp e liberar o envio. O painel nunca apaga nada no GOWA.
          </p>
        </div>
      ) : !n.connected ? (
        <p className="text-[12px] leading-snug text-danger">WhatsApp: {n.detail}</p>
      ) : null}
      {n.failures > 0 ? <p className="text-[12px] text-warn">{n.failures} {n.failures === 1 ? "falha seguida" : "falhas seguidas"} no último envio.</p> : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Metric label="Hoje" value={`${n.sentToday}/${n.capToday}`} sub="enviadas / teto" />
        <Metric label="Na fila" value={String(n.queued)} sub={n.nextAt ? `próxima ${new Date(n.nextAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" })}` : "nada agendado"} />
        <Metric label="Para aprovar" value={String(n.drafts)} sub="rascunhos" />
        <Metric label="Respostas" value={pct(n.replyRate)} sub={`${n.sentTotal} enviadas no total${n.lastSendAt ? ` · última ${timeAgo(n.lastSendAt, now)}` : ""}`} />
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={n.paused ? "primary" : "secondary"}
          size="sm"
          disabled={pending || (n.deviceMissing && n.paused)}
          title={n.deviceMissing && n.paused ? "Ligue o número a um aparelho do GOWA antes de liberar o envio" : undefined}
          onClick={() => run(() => setNumberPausedAction(n.id, !n.paused))}
        >
          {n.paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          {n.paused ? "Liberar envio" : "Pausar"}
        </Button>
        {n.others.length > 0 ? (
          <Button
            variant={(!n.connected || n.deviceMissing) && n.queued + n.drafts > 0 ? "primary" : "secondary"}
            size="sm"
            disabled={pending || n.queued + n.drafts === 0}
            title={n.queued + n.drafts === 0 ? "Não há nada esperando neste número" : "Passa as aberturas que ainda não saíram para outro número"}
            onClick={() => setPanel(panel === "fila" ? null : "fila")}
          >
            <ArrowRightLeft className="size-3.5" aria-hidden />
            Passar a fila
          </Button>
        ) : null}
        {n.canManage && !n.deviceMissing ? (
          <>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => setPanel(panel === "qr" ? null : "qr")}>
              <QrCode className="size-3.5" aria-hidden />
              Conectar por QR
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => setPanel(panel === "code" ? null : "code")}>
              <PlugZap className="size-3.5" aria-hidden />
              Conectar por código
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => reconnectNumberAction(n.id))} title="Pede ao GOWA para reconectar este número">
              <RefreshCw className="size-3.5" aria-hidden />
              Reconectar
            </Button>
          </>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setPanel(panel === "ajustes" ? null : "ajustes")}>
          Ajustes
        </Button>
      </div>

      {panel === "qr" ? (
        <div className="flex flex-col gap-3 border border-line bg-surface-2 p-3">
          <p className="text-[12.5px] leading-snug text-muted">No celular deste número: WhatsApp → Aparelhos conectados → Conectar um aparelho, e escaneie.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm" disabled={pending} onClick={() => connect(() => connectNumberQrAction(n.id))}>
              {qr ? "Gerar outro QR" : "Gerar QR code"}
            </Button>
            <Button variant="soft" size="sm" disabled={pending} onClick={() => connect(() => checkNumberAction(n.id))}>
              Já escaneei, conferir
            </Button>
          </div>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem em data URL gerada na hora, sem otimização possível
            <img src={qr.src} alt="QR code para conectar o WhatsApp" className="size-56 bg-white p-2" />
          ) : null}
          {qr ? <p className="text-[11px] text-faint">O QR vale por cerca de {qr.seconds} segundos. Se expirar, gere outro.</p> : null}
        </div>
      ) : null}

      {panel === "code" ? (
        <div className="flex flex-col gap-3 border border-line bg-surface-2 p-3">
          <p className="text-[12.5px] leading-snug text-muted">Sem câmera: digite o telefone deste número, gere o código e digite-o no celular (WhatsApp → Aparelhos conectados → Conectar com número de telefone).</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5585999998888" inputMode="numeric" aria-label="Telefone deste número" className="h-9 w-52" />
            <Button variant="primary" size="sm" disabled={pending || phone.replace(/\D/g, "").length < 10} onClick={() => connect(() => connectNumberCodeAction(n.id, phone))}>
              Gerar código
            </Button>
            <Button variant="soft" size="sm" disabled={pending} onClick={() => connect(() => checkNumberAction(n.id))}>
              Já digitei, conferir
            </Button>
          </div>
          {code ? <p className="num text-[28px] font-semibold tracking-[0.18em]">{code}</p> : null}
        </div>
      ) : null}

      {panel === "fila" ? (
        <div className="flex flex-col gap-3 border border-line bg-surface-2 p-3">
          <p className="text-[12.5px] leading-snug text-muted">
            Passa para outro número as aberturas de {n.name} que ainda não saíram (aprovadas e rascunhos), junto com a conversa de cada uma. As aprovadas ganham horário novo no
            fim da fila do destino, com o teto, a janela e o intervalo dele. <span className="text-fg">Nada é enviado agora e nada é apagado.</span>
          </p>
          <p className="text-[11.5px] leading-snug text-faint">
            Cutucadas, mensagens “enviando” e conversas que já aconteceram ficam aqui: o lead já conhece este número e continua falando com ele.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="label text-[10px] text-muted">Passar para</span>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Número que recebe a fila" className="h-8 border border-line bg-surface-1 px-2 text-[12px] text-fg">
                <option value="">Escolha…</option>
                {n.others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {o.paused ? "pausado" : o.connected ? "enviando" : "desconectado"} · hoje {o.sentToday}/{o.capToday} · {o.queued} na fila
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="primary"
              size="sm"
              disabled={pending || !moveTo}
              onClick={() =>
                run(
                  () => moveQueueAction(n.id, moveTo),
                  (done) => {
                    if (done) {
                      setPanel(null);
                      setMoveTo("");
                    }
                  },
                )
              }
            >
              <ArrowRightLeft className="size-3.5" aria-hidden />
              Passar a fila
            </Button>
          </div>
          {(() => {
            const dest = n.others.find((o) => o.id === moveTo);
            if (!dest || (dest.connected && !dest.paused)) return null;
            return (
              <p className="text-[11.5px] leading-snug text-warn">
                {dest.name} está {dest.paused ? "pausado" : "desconectado"}: as aberturas ficam na fila dele e só saem quando ele estiver enviando.
              </p>
            );
          })()}
        </div>
      ) : null}

      {panel === "ajustes" ? (
        <div className="flex flex-col gap-4 border border-line bg-surface-2 p-3">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const num = (v: string) => (v.trim() === "" ? null : Number(v));
              run(() => setNumberCapsAction(n.id, { week1: num(caps.week1), week2: num(caps.week2), steady: Number(caps.steady) }));
            }}
          >
            <p className="label text-[10px] text-muted">Teto de abordagens novas por dia</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["week1", "1ª semana"],
                  ["week2", "2ª semana"],
                  ["steady", "Depois"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-[11px] text-faint">{label}</span>
                  <Input value={caps[key]} onChange={(e) => setCaps({ ...caps, [key]: e.target.value })} inputMode="numeric" className="h-9" placeholder={key === "steady" ? "" : "igual ao seguinte"} />
                </label>
              ))}
            </div>
            <p className="text-[11.5px] leading-snug text-faint">
              Número recém-conectado precisa de rampa: começar devagar e subir. O aquecimento deste número conta a partir do primeiro envio dele.
              {n.legacy ? " O número original usa o teto das Configurações; aqui você define um próprio para ele." : ""}
            </p>
            <div>
              <Button type="submit" variant="secondary" size="sm" disabled={pending}>
                Salvar teto
              </Button>
            </div>
          </form>

          {n.canManage && !n.deviceMissing ? (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-2">
                {confirmReplace ? (
                  <>
                    <Button variant="danger" size="sm" disabled={pending} onClick={replaceDevice}>
                      <PlugZap className="size-3.5" aria-hidden />
                      Confirmar: criar aparelho novo para {n.name}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmReplace(false)}>
                      Voltar
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmReplace(true)} title="Para quando o número foi restringido ou a conexão ficou ruim: reconecta em um aparelho novo, sem reaproveitar a sessão antiga">
                    <PlugZap className="size-3.5" aria-hidden />
                    Trocar o aparelho (criar um novo)
                  </Button>
                )}
              </div>
              {confirmReplace ? (
                <p className="text-[11.5px] leading-snug text-warn">
                  Cria um aparelho novo no GOWA e liga este número a ele. O número fica pausado até você conectar e liberar; nome, conversas e fila ficam. O aparelho
                  antigo continua no GOWA até você apagá-lo lá.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {n.canManage && !n.deviceMissing ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => disconnectNumberAction(n.id))} title="Sai do WhatsApp deste número e pausa. O lugar dele fica.">
                <Unplug className="size-3.5" aria-hidden />
                Desconectar WhatsApp
              </Button>
            ) : null}
            {confirmRetire ? (
              <>
                <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => retireNumberAction(n.id))}>
                  <Trash2 className="size-3.5" aria-hidden />
                  Confirmar: aposentar {n.name}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRetire(false)}>
                  Voltar
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmRetire(true)}>
                <Trash2 className="size-3.5" aria-hidden />
                Aposentar este número
              </Button>
            )}
          </div>
          {confirmRetire ? (
            <p className="text-[11.5px] leading-snug text-warn">
              Aposentar cancela o que ainda não saiu deste número (rascunhos e aprovadas); os leads voltam para a lista de liberados. As conversas já abertas ficam como estão.
            </p>
          ) : null}
        </div>
      ) : null}

      <Line notice={notice} />
    </article>
  );
}
