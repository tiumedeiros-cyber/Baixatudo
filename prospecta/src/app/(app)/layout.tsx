import { LiveRefresh } from "@/components/shell/live-refresh";
import { Sidebar, type AutomationPulse } from "@/components/shell/sidebar";
import { StuckBanner } from "@/components/shell/stuck-banner";
import { requireViewer } from "@/lib/auth";
import { loadRoster } from "@/lib/outreach/roster";
import { loadStuckQueues, type StuckQueue } from "@/lib/outreach/stuck-queue";
import { getRepo } from "@/lib/repo";
import { signOut } from "@/app/login/actions";

/**
 * O que a casca mostra sem custo: selos do menu e o estado da automação, mais o pulso de agora (a tela aberta o compara com o
 * do servidor para se atualizar sozinha). Se algo falhar, abre sem eles em vez de derrubar a página.
 */
async function shellInfo(demo: boolean): Promise<{ badges: Record<string, number>; pulse: AutomationPulse; stamp: string | null; stuck: StuckQueue[] }> {
  try {
    const repo = await getRepo();
    const [counts, waiting, settings, roster, stamp] = await Promise.all([
      repo.messageCounts(),
      repo.listConversations({ statuses: ["awaiting_human"], limit: 1 }),
      repo.getSettings(),
      loadRoster(repo),
      repo.pulse().catch(() => null),
    ]);
    const a = settings.automation;
    // número que caiu com fila parada; no modo demonstração não há robô de envio, então não há o que avisar. Se a leitura
    // falhar, a casca abre sem o aviso
    const stuck = demo ? [] : await loadStuckQueues(repo, roster, a, new Date()).catch(() => []);
    // com vários números o pulso diz quantos estão liberados para enviar
    const ready = roster.active.filter((n) => !n.paused).length;
    const many = roster.multi ? ` · ${ready}/${roster.active.length} números` : "";
    const pulse: AutomationPulse = a.paused
      ? { state: "paused", label: "Pausada" }
      : a.dryRun
        ? { state: "sim", label: `Simulação${many}` }
        : { state: "on", label: `Ligada${many}` };
    return { badges: { "/fila": counts.draft, "/conversas": waiting.total, "/numeros": stuck.length }, pulse, stamp, stuck };
  } catch {
    return { badges: {}, pulse: { state: "paused", label: "Sem leitura" }, stamp: null, stuck: [] };
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const { badges, pulse, stamp, stuck } = await shellInfo(viewer.demo);
  return (
    <div className="min-h-dvh lg:pl-[var(--sidebar-w)]">
      <LiveRefresh initial={stamp} />
      <Sidebar email={viewer.email} demo={viewer.demo} signOutAction={signOut} badges={badges} pulse={pulse} />
      <main className="min-w-0">
        <StuckBanner queues={stuck} />
        {children}
      </main>
    </div>
  );
}
