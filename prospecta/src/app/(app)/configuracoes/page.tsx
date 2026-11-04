import type { Metadata } from "next";
import { AutomationSettings, RealSendSwitch } from "@/components/outreach/automation-settings";
import { SettingsForm } from "@/components/settings-form";
import { PageBody, PageHeader, Panel } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import {
  apifyToken,
  appMode,
  gowaEnv,
  ownerEmail,
  supabaseSecretKey,
  webhookSecret,
  workerToken,
} from "@/lib/env";
import { getDefaultProvider } from "@/lib/outreach/runtime";
import { getRepo } from "@/lib/repo";

export const metadata: Metadata = { title: "Configurações" };

interface Check {
  name: string;
  ok: boolean;
  okText: string;
  badText: string;
}

export default async function SettingsPage() {
  const repo = await getRepo();
  const settings = await repo.getSettings();
  const mode = appMode();
  const provider = await getDefaultProvider(repo, { timeoutMs: 3000 });
  const status = await provider.status();
  const demo = mode === "demo";

  const checks: Check[] = [
    {
      name: "Banco e login (Supabase)",
      ok: mode === "supabase",
      okText: "conectado",
      badText: demo ? "modo demonstração (dados em memória)" : "não configurado",
    },
    {
      name: "Dono do painel (OWNER_EMAIL)",
      ok: !demo && !!ownerEmail(),
      okText: "definido",
      badText: demo ? "não precisa no modo demonstração" : "defina no ambiente",
    },
    {
      name: "Busca no Maps (APIFY_TOKEN)",
      ok: !!apifyToken(),
      okText: "token configurado",
      badText: "sem token: use JSON ou a demonstração",
    },
    {
      name: "Chave secreta do Supabase (worker e webhook)",
      ok: demo || !!supabaseSecretKey(),
      okText: demo ? "não precisa na demonstração" : "SUPABASE_SECRET_KEY definida",
      badText: "falta SUPABASE_SECRET_KEY: sem ela o worker e as respostas do WhatsApp não gravam no banco",
    },
    {
      name: "Worker (WORKER_TOKEN)",
      ok: !!workerToken(),
      okText: "senha do worker definida",
      badText: "falta WORKER_TOKEN",
    },
    {
      name: "Webhook do WhatsApp (WA_WEBHOOK_SECRET)",
      ok: !!webhookSecret(),
      okText: "segredo definido",
      badText: "falta WA_WEBHOOK_SECRET",
    },
    {
      name: "WhatsApp (GOWA)",
      ok: status.connected,
      okText: status.detail,
      badText: gowaEnv() ? status.detail : "GOWA_URL não definida: o painel só consegue simular",
    },
  ];

  const missing = checks.filter((c) => !c.ok && c.name !== "Busca no Maps (APIFY_TOKEN)").map((c) => c.name);
  const readyToSend = status.connected;

  return (
    <>
      <PageHeader
        eyebrow="10 — Configurações"
        title="Configurações"
        description="Sua oferta, o ticket médio, os limites de gasto e as regras de envio. Chaves e tokens ficam só no ambiente, nunca aqui."
      />
      <PageBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Oferta e limites" eyebrow="Negócio">
            <SettingsForm settings={settings} />
          </Panel>
          <Panel title="Regras de envio" eyebrow="Proteção do número">
            <AutomationSettings
              cfg={settings.automation}
              senderName={settings.senderName}
              brandName={settings.brandName}
              senderFullName={settings.senderFullName}
              senderRole={settings.senderRole}
            />
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Envio real" eyebrow="Simulação ou de verdade">
            <RealSendSwitch
              dryRun={settings.automation.dryRun}
              ready={readyToSend}
              readyText={
                readyToSend
                  ? "WhatsApp conectado. Dá para ligar o envio real."
                  : `Ainda não dá para ligar: ${status.detail}.`
              }
            />
          </Panel>
          <Panel title="Ambiente" eyebrow="Diagnóstico">
            <ul className="flex flex-col">
              {checks.map((c) => (
                <li key={c.name} className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px]">{c.name}</p>
                    <Badge tone={c.ok ? "accent" : "ghost"}>{c.ok ? "ok" : "pendente"}</Badge>
                  </div>
                  <p className="text-[12px] text-faint">{c.ok ? c.okText : c.badText}</p>
                </li>
              ))}
            </ul>
            {missing.length > 0 ? (
              <p className="border-t border-line px-4 py-3 text-[12px] leading-snug text-muted">
                Faltam {missing.length} itens para o envio real. O passo a passo está em docs/WHATSAPP.md.
              </p>
            ) : null}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
