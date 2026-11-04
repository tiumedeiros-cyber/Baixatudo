import type { Metadata } from "next";
import Link from "next/link";
import { AutonomyCard } from "@/components/agent/autonomy-card";
import { FunnelCard } from "@/components/agent/funnel-card";
import { AgentSimulator, TestAiButton } from "@/components/agent/simulator";
import { PageBody, PageHeader, Panel, Stat } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { AUTONOMY_CONFIRM } from "@/lib/agent/autonomy";
import { PRODUCT_WANTS } from "@/lib/agent/discovery";
import { factsFromSettings, simulationContext } from "@/lib/agent/context";
import { DEFAULT_GEMINI_MODEL } from "@/lib/agent/llm";
import { HANDOFF_RULES, SALES_RULES, STYLE_RULES } from "@/lib/agent/playbook";
import { buildAgentReport } from "@/lib/agent/report";
import { rulesReply } from "@/lib/agent/rules";
import { QUALIFY_SCENARIOS, SCENARIOS } from "@/lib/agent/scenarios";
import { TOPIC_LABEL, TOPICS, type NextActionKind } from "@/lib/agent/types";
import { agentEnv } from "@/lib/env";
import { getOverview } from "@/lib/outreach/engine";
import { loadFunnel } from "@/lib/outreach/funnel";
import { getDefaultProvider } from "@/lib/outreach/runtime";
import { getRepo } from "@/lib/repo";
import { formatWhen } from "@/lib/utils";

export const metadata: Metadata = { title: "Agente" };

const LEVELS = (semi: boolean) => [
  { n: 1, name: "Copiloto", text: "Modelos de texto e você escreve o resto.", on: false },
  { n: 2, name: "Agente assistido", text: "O agente escreve cada resposta. Você aprova com 1 clique.", on: !semi },
  { n: 3, name: "Semi-automático", text: "Responde sozinho o que é seguro e chama você no resto. Você confere no final.", on: semi },
];

/** O que fazer com cada lead da fila do dono, em duas palavras (o texto inteiro vem da ficha). */
const ACTION_TAG: Partial<Record<NextActionKind, string>> = {
  fazer_previa: "Fazer prévia",
  orcar_sistema: "Orçar sistema",
  criar_proposta: "Fechar valor",
  marcar_sinal: "Marcar sinal",
  enviar_proposta: "Enviar proposta",
  enviar_exemplos: "Mandar exemplos",
  ajustar_previa: "Ajustar prévia",
  ouvir_audio: "Ouvir áudio",
  responder: "Responder",
};
const ACTION_TONE: Partial<Record<NextActionKind, "accent" | "warn" | "info" | "ghost">> = {
  fazer_previa: "accent",
  orcar_sistema: "accent",
  criar_proposta: "warn",
  marcar_sinal: "warn",
};

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2 text-[13px] leading-snug text-muted">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-[7px] size-1 shrink-0 bg-accent" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AgentPage() {
  const repo = await getRepo();
  const settings = await repo.getSettings();
  const env = agentEnv();
  const facts = factsFromSettings(settings);
  // provedores de fato liberados, na ordem de uso (a OpenAI só conta quando tem OPENAI_MODEL)
  const models = { gemini: env?.gemini ? (env.gemini.model ?? DEFAULT_GEMINI_MODEL) : null, openai: env?.openai?.model ?? null };
  const keys = { gemini: env?.gemini?.apiKeys.length ?? 0, openai: env?.openai?.apiKeys.length ?? 0 };
  const usable = (env?.order ?? []).filter((n) => models[n]);
  const aiOn = usable.length > 0;
  const NAME = { gemini: "Gemini", openai: "OpenAI" } as const;
  const chain = usable.map((n) => `${NAME[n]}${keys[n] > 1 ? ` ×${keys[n]}` : ""}`);

  const cfg = settings.automation;
  const semi = cfg.autonomy === "semi";
  const now = new Date();
  const [overview, report, funnel] = await Promise.all([getOverview(repo, await getDefaultProvider(repo), now), buildAgentReport(repo, now), loadFunnel(repo, now, 30)]);
  const tz = cfg.timezone;

  // o gabarito mostrado é o do fluxo em uso
  const cases = facts.flow === "qualificar" ? QUALIFY_SCENARIOS : SCENARIOS;
  const rows = cases.map((sc) => {
    const ctx = simulationContext({ text: sc.text, media: sc.media, ...sc.setup, facts });
    return { sc, out: rulesReply(ctx) };
  });

  return (
    <>
      <PageHeader
        eyebrow="09 — Agente"
        title="Agente de atendimento"
        description="Lê o que o lead escreveu, entende o assunto, qualifica e responde no seu jeito. No modo assistido você aprova tudo; no autônomo ele responde sozinho o que é seguro e chama você no resto."
      />
      <PageBody className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Nível" value={semi ? "3 de 3" : "2 de 3"} sub={semi ? "atende sozinho" : "assistido: você aprova"} index={0} accent />
          <Stat
            label="Escrita"
            value={aiOn ? NAME[usable[0]] : "Regras"}
            sub={
              aiOn
                ? `${models[usable[0]]}${chain.length > 1 ? ` · reserva: ${chain.slice(1).join(", ")}` : ""}${env?.auto ? "" : " · só ao clicar"}`
                : env?.openai
                  ? "falta OPENAI_MODEL"
                  : "IA desligada, sem chave"
            }
            index={1}
          />
          <Stat label="Assuntos" value={String(TOPICS.length - 1)} sub="que ele entende" index={2} />
          <Stat label="Casos treinados" value={String(cases.length)} sub="conferidos nos testes" index={3} />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Panel title="Respondeu sozinho" eyebrow={`Hoje: ${report.autoToday}${report.autoWaiting ? ` · ${report.autoWaiting} esperando a hora de sair` : ""}`} bodyClassName="max-h-[420px] overflow-y-auto">
            {report.recent.length === 0 ? (
              <p className="p-4 text-[13px] text-faint">Nada ainda. Quando você ligar o atendimento sozinho, cada resposta que o agente mandar aparece aqui para você conferir.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {report.recent.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/conversas/${r.conversationId}`} className="text-[13px] font-medium hover:text-accent">
                        {r.leadName}
                      </Link>
                      <Badge tone="ghost">{r.topicLabel}</Badge>
                      <Badge tone={r.source === "ai" ? "accent" : "neutral"}>{r.source === "ai" ? "IA" : "Regras"}</Badge>
                      <span className="label text-[10px] text-faint">{formatWhen(r.at, tz)}{r.status === "approved" ? " · na fila" : r.status === "simulated" ? " · simulada" : ""}</span>
                    </div>
                    <p className="text-[13px] leading-snug whitespace-pre-wrap text-muted">{r.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Precisa de você" eyebrow={`${report.needYou.length} conversas · respondeu ${report.stages.respondeu} · proposta ${report.stages.proposta} · ganho ${report.stages.ganho}`} bodyClassName="max-h-[420px] overflow-y-auto">
            {report.needYou.length === 0 ? (
              <p className="p-4 text-[13px] text-faint">Ninguém esperando por você agora.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {report.needYou.map((r) => (
                  <li key={r.conversationId} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/conversas/${r.conversationId}`} className="text-[13px] font-medium hover:text-accent">
                        {r.leadName}
                      </Link>
                      {r.action ? <Badge tone={ACTION_TONE[r.action.kind] ?? "ghost"}>{ACTION_TAG[r.action.kind] ?? r.action.label}</Badge> : null}
                      {r.product ? <Badge tone="info">{PRODUCT_WANTS[r.product]}</Badge> : null}
                      <span className="label text-[10px] text-faint">{formatWhen(r.at, tz)}</span>
                    </div>
                    <p className="text-[13px] leading-snug text-muted">“{r.preview}”</p>
                    {r.action ? <p className="text-[12px] leading-snug text-accent">{r.action.label}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <FunnelCard report={funnel} />

        <Panel title="Atendimento" eyebrow={semi ? "O agente atende sozinho" : "Hoje: você aprova tudo"}>
          <AutonomyCard
            mode={cfg.autonomy}
            autoClose={cfg.autoClose}
            autoFreeform={cfg.autoFreeform}
            autoBatch={cfg.autoBatch}
            maxPerConversation={cfg.autoMaxPerConversation}
            maxPerDay={cfg.autoMaxPerDay}
            confirmPhrase={AUTONOMY_CONFIRM}
            readiness={{ ai: aiOn, whatsappConnected: overview.connected, live: !cfg.dryRun, running: !cfg.paused }}
          />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Como ele trabalha" eyebrow="Camadas">
            <div className="flex flex-col gap-4 p-4 text-[13px] leading-relaxed text-muted">
              <p>
                <span className="text-fg">1. Regras do playbook</span> sempre rodam primeiro. São grátis, instantâneas e conferidas caso a caso. É a rede de segurança.
              </p>
              <p>
                <span className="text-fg">2. IA (opcional)</span> reescreve ou estende a resposta quando há chave no <code className="num">.env.local</code>. A ordem é <code className="num">AGENT_ORDER</code> (padrão: OpenAI primeiro, depois as chaves do Google); quem vem depois só é chamado se o anterior falhar. Ela lê o playbook, os fatos que você cadastrou e a conversa.
              </p>
              <p>
                <span className="text-fg">3. Trava</span> confere o que a IA escreveu: preço, prazo, sinal, link e chave Pix só podem ser os seus. Texto com cara de IA é reprovado pelo humanizador. Reprovou, vale a resposta das regras.
              </p>
              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <TestAiButton aiOn={!!env} />
                {!env ? (
                  <p className="text-[12px] leading-snug text-faint">
                    Para ligar: pegue uma chave grátis no Google AI Studio e coloque <code className="num">GEMINI_API_KEY=...</code> no <code className="num">.env.local</code>. No plano grátis o Google pode usar o conteúdo enviado para melhorar os produtos dele: as mensagens dos seus leads iriam para lá.
                  </p>
                ) : (
                  <p className="text-[12px] leading-snug text-faint">
                    {aiOn ? `${NAME[usable[0]]} recebe toda conversa que a IA escrever${usable.length > 1 ? `; ${usable.slice(1).map((n) => NAME[n]).join(" e ")} só recebe se o anterior falhar` : ""}. ` : ""}
                    {models.gemini ? "No plano grátis do Gemini o Google pode usar o conteúdo que receber para melhorar os produtos dele. " : ""}
                    {models.openai ? "Confirme na política da OpenAI como ela trata dados enviados pela API. " : ""}
                    {env.openai && !models.openai ? "A OPENAI_API_KEY está no arquivo, mas falta o OPENAI_MODEL: clique em Testar a IA para ver os modelos da sua conta. " : ""}
                    Vão na chamada: as últimas mensagens da conversa, o nome e o bairro do negócio e os fatos de Configurações. Nunca vão: telefone, chave Pix e dados de outros leads.{" "}
                    {env.auto
                      ? "Agora a IA escreve todo rascunho de resposta. Para ela só entrar quando você clicar em “Pedir resposta ao agente”, ponha AGENT_AI_MODE=manual no .env.local."
                      : "Modo manual: os rascunhos nascem pelas regras e a conversa só vai para a IA quando você clica em “Pedir resposta ao agente”."}
                  </p>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Níveis de autonomia" eyebrow="Onde estamos">
            <ol className="flex flex-col gap-3 p-4">
              {LEVELS(semi).map((l) => (
                <li key={l.n} className={`flex items-start gap-3 border px-3 py-2.5 ${l.on ? "border-accent/40 bg-accent-dim" : "border-line"}`}>
                  <span className="num grid size-6 shrink-0 place-items-center border border-line-strong text-[12px]">{l.n}</span>
                  <div className="flex flex-col gap-0.5">
                    <p className="flex items-center gap-2 text-[13px] font-medium">
                      {l.name} {l.on ? <Badge tone="accent">em uso</Badge> : null}
                    </p>
                    <p className="text-[12px] leading-snug text-muted">{l.text}</p>
                  </div>
                </li>
              ))}
              <li className="text-[12px] leading-snug text-faint">
                Em qualquer nível, PARE, horário, tetos diários, uma mensagem por vez e o botão de pausa continuam valendo. Eles não passam pelo agente.
              </li>
            </ol>
          </Panel>
        </div>

        <Panel title="Simulador" eyebrow="Teste sem enviar nada">
          <AgentSimulator aiOn={aiOn} />
        </Panel>

        <Panel title="O que ele sabe responder" eyebrow={`${cases.length} casos treinados, escritos com os seus fatos`} bodyClassName="max-h-[70dvh] overflow-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="label border-b border-line text-[10px] text-faint">
                <th className="px-4 py-2 font-normal">O lead diz</th>
                <th className="px-4 py-2 font-normal">Assunto</th>
                <th className="px-4 py-2 font-normal">O agente escreve</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sc, out }) => (
                <tr key={sc.id} className="border-b border-line align-top last:border-0">
                  <td className="w-[22%] px-4 py-2.5">{sc.text ?? (sc.media === "audio" ? "(áudio)" : sc.media ? `(${sc.media})` : "")}</td>
                  <td className="w-[20%] px-4 py-2.5">
                    <Badge tone="ghost">{TOPIC_LABEL[out.topic]}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {out.reply ? (
                      <p className="leading-snug whitespace-pre-wrap">{out.reply}</p>
                    ) : (
                      <p className="text-faint">Nada: quem responde é você.</p>
                    )}
                    {out.handoff.needed ? <p className="mt-1 text-[12px] text-warn">Chama você: {out.handoff.reason}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Como ele escreve" eyebrow="Humanizador">
            <div className="p-4">
              <List items={STYLE_RULES} />
            </div>
          </Panel>
          <Panel title="Como ele vende" eyebrow="Playbook de vendas">
            <div className="p-4">
              <List items={SALES_RULES} />
            </div>
          </Panel>
          <Panel title="Quando ele chama você" eyebrow="Nunca decide sozinho">
            <div className="p-4">
              <List items={HANDOFF_RULES} />
            </div>
          </Panel>
        </div>

        <p className="text-[12px] leading-relaxed text-faint">
          Método de escrita adaptado de blader/humanizer e método de vendas adaptado de msitarzewski/agency-agents (ambos MIT). Veja <code className="num">docs/AGENTE.md</code> para o que foi aproveitado e o que ficou de fora.
        </p>
      </PageBody>
    </>
  );
}
