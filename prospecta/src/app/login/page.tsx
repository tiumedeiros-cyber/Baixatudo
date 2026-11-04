import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCheck, Crosshair, MessageSquare, ShieldCheck } from "lucide-react";
import { JKMark } from "@/components/brand/jk-mark";
import { getViewer, isLocalNow } from "@/lib/auth";
import { sessionSecret } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Acesso restrito" };

const NOTICES: Record<string, string> = {
  remoto: "O acesso de 1 clique só funciona abrindo o painel por localhost. Entre com e-mail e senha.",
  config: "Faltam OWNER_EMAIL ou SESSION_SECRET no .env.local para o acesso de 1 clique.",
  link: "Esse link de acesso não vale mais.",
  acesso: "Esse e-mail não tem acesso a este painel.",
};

const POINTS = [
  { icon: Crosshair, title: "Acha quem precisa", text: "Garimpa negócios locais no Google Maps e dá nota ao potencial de cada um." },
  { icon: MessageSquare, title: "Conduz a conversa", text: "O agente abre, qualifica e responde no WhatsApp, no seu jeito." },
  { icon: ShieldCheck, title: "Você no comando", text: "Envio espalhado nos melhores horários, com pausa geral e aprovação." },
] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await getViewer()) redirect("/");
  const { erro } = await searchParams;
  const canQuickLogin = Boolean(sessionSecret()) && (await isLocalNow());

  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-bg text-fg lg:grid-cols-[1.15fr_1fr]">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />

      <section className="relative z-10 hidden flex-col justify-between border-r border-line bg-surface-0/60 p-14 lg:flex">
        <div className="flex items-center gap-3">
          <JKMark className="h-7 w-auto" title="JK" />
          <span className="label text-muted">
            <span className="text-accent">/</span> Prospect X1
          </span>
        </div>

        <div className="flex max-w-xl flex-col gap-10">
          <div className="flex flex-col gap-5">
            <p className="label kicker text-accent">Painel do dono</p>
            <h1 className="text-[44px] leading-[1.02] font-semibold tracking-[-0.04em] text-balance">
              Prospecção que abre a conversa e prepara o fechamento.
            </h1>
          </div>

          <ul className="flex flex-col border-y border-line">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4 border-b border-line-soft py-4 last:border-b-0">
                <span className="grid size-9 shrink-0 place-items-center border border-accent-line bg-accent-dim text-accent">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold tracking-[-0.01em]">{title}</span>
                  <span className="text-[13px] leading-relaxed text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="label inline-flex items-center gap-2 text-[10px] text-faint">
          <CheckCheck className="size-3.5 text-accent" aria-hidden />
          Kelvin Studio · sistema de uso exclusivo
        </p>
      </section>

      <section className="relative z-10 flex items-center justify-center px-5 py-14 sm:px-8">
        <div className="flex w-full max-w-[420px] flex-col gap-8 border border-line bg-surface-1 p-7 sm:p-9">
          <div className="flex flex-col gap-3">
            <JKMark className="h-6 w-auto lg:hidden" title="JK" />
            <p className="label kicker text-accent">00 — Autenticação</p>
            <h2 className="text-[26px] leading-tight font-semibold tracking-[-0.03em]">Entrar no Comando</h2>
            <p className="text-[13px] leading-relaxed text-muted">Acesso restrito ao dono do painel.</p>
          </div>

          <LoginForm canQuickLogin={canQuickLogin} notice={erro ? (NOTICES[erro] ?? null) : null} />
        </div>
      </section>
    </main>
  );
}
