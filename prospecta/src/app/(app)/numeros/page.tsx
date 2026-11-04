import Link from "next/link";
import { AddNumber } from "@/components/numbers/add-number";
import { NumberCard, type NumberView } from "@/components/numbers/number-card";
import { PageBody, PageHeader, Panel } from "@/components/shell/page";
import { gowaEnv } from "@/lib/env";
import { ensureOriginalAccount, freeDevices, getNumbersOverview, syncDevices } from "@/lib/outreach/numbers";
import { getGowaAdmin, providerForAccount } from "@/lib/outreach/runtime";
import { getRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function NumbersPage() {
  const repo = await getRepo();
  const now = new Date();
  await ensureOriginalAccount(repo);

  // junta o que o GOWA sabe dos aparelhos (telefone e endereço) ao cadastro; se o GOWA estiver fora, a tela segue sem isso
  const admin = getGowaAdmin({ timeoutMs: 3000 });
  let devices: { id: string; jid: string | null; phone: string | null; state: string }[] = [];
  if (admin) {
    try {
      devices = await admin.listDevices();
      await syncDevices(repo, devices, gowaEnv()?.deviceId ?? null);
    } catch (error) {
      console.error("sincronizar aparelhos:", error);
    }
  }

  const all = await repo.listAccounts();
  const overview = all.length > 0 ? await getNumbersOverview(repo, (a) => providerForAccount(a, { timeoutMs: 3000 }), now) : [];
  // aparelhos que existem no GOWA e nenhum número usa: dá para ligar um número a eles (ex.: depois de apagar o aparelho antigo)
  const free = freeDevices(devices, all).map((d) => ({ id: d.id, label: `${d.id}${d.phone ? ` (+${d.phone})` : ""} · ${d.state === "logged_in" ? "conectado" : "sem WhatsApp"}` }));
  // para onde dá para passar a fila de cada número: os outros que têm aparelho
  const views: NumberView[] = overview.map((o) => ({
    ...o,
    canManage: !!admin,
    freeDevices: free,
    others: overview
      .filter((x) => x.id !== o.id && !x.deviceMissing)
      .map((x) => ({ id: x.id, name: x.name, connected: x.connected, paused: x.paused, sentToday: x.sentToday, capToday: x.capToday, queued: x.queued })),
  }));
  const next = `Número ${all.filter((a) => !a.retired).length + 1}`;
  const connected = overview.filter((o) => o.connected && !o.paused).length;

  return (
    <>
      <PageHeader
        eyebrow="Sistema — Números"
        title="Números de WhatsApp"
        description="Cada número tem fila, teto por dia, intervalo e pausa próprios. Aqui você só dá o nome e conecta; na Fila você escolhe para qual número vai cada grupo de leads."
        actions={
          <Link href="/fila" className="label text-accent hover:underline">
            Escolher número na Fila →
          </Link>
        }
      />
      <PageBody className="flex flex-col gap-6">
        {all.length === 0 ? (
          <Panel title="A migração dos números ainda não foi aplicada no banco" eyebrow="Falta um passo">
            <p className="px-4 py-5 text-[13px] leading-relaxed text-muted">
              O painel segue funcionando com um número só, como sempre. Para cadastrar mais números, aplique a migração{" "}
              <code className="num">supabase/migrations/20261027000000_numbers.sql</code> no Supabase (ela só acrescenta; nada que existe é apagado).
            </p>
          </Panel>
        ) : (
          <>
            <p className="text-[13px] text-muted">
              {views.length === 0
                ? "Nenhum número ativo. Adicione um abaixo: cada número novo ganha um aparelho novo no GOWA e nasce pausado."
                : views.length === 1
                  ? views[0].legacy
                    ? "Hoje há um número só. Com o segundo, a Fila passa a perguntar para qual número vai cada grupo de leads."
                    : "Hoje há um número ativo. A Fila pergunta para qual número vai cada grupo de leads."
                  : `${connected} de ${views.length} números enviando agora.`}
            </p>
            <div className="grid gap-4 xl:grid-cols-2">
              {views.map((n) => (
                <NumberCard key={n.id} n={n} now={now.getTime()} />
              ))}
            </div>
            <AddNumber suggestion={next} disabled={admin ? undefined : "O GOWA não está configurado (GOWA_URL no .env.local). Sem ele não há como conectar números."} />
          </>
        )}

        <Panel title="Como os números trabalham juntos" eyebrow="Regras">
          <ul className="flex flex-col gap-2.5 px-4 py-4 text-[13px] leading-relaxed text-muted">
            <li>
              <span className="text-fg">Um lead, um número.</span> Depois que o primeiro contato sai, o lead fala com aquele número para sempre; nenhum outro o aborda.
            </li>
            <li>
              <span className="text-fg">Você escolhe.</span> Na Fila, cada grupo de leads liberados (ex.: Estética · São Paulo) vai para o número que você marcar. Sem número escolhido, o lead não entra na Fila.
            </li>
            <li>
              <span className="text-fg">Cada número tem as suas travas.</span> Teto por dia, aquecimento, intervalo, pausa e a parada por pouca resposta são de cada um; um problema num número pausa só ele.
            </li>
            <li>
              <span className="text-fg">Nada se repete.</span> Cada abertura sai com saudação, apresentação, pergunta e ângulo diferentes das últimas de todos os números, e o sistema recusa textos parecidos demais.
            </li>
            <li>
              <span className="text-fg">Uma mensagem por vez.</span> O envio é intercalado entre os números: dois nunca mandam no mesmo instante.
            </li>
            <li>
              <span className="text-fg">Opt-out vale para todos.</span> Quem pediu para parar não recebe de nenhum número.
            </li>
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}
