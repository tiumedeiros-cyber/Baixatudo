// Worker de envio: chama /api/worker/tick de tempos em tempos. Roda no seu PC.
//
//   npm run worker            (usa o .env.local e o painel em http://localhost:3000)
//   npm run worker -- --interval=30 --url=http://localhost:3000
//
// O painel (npm run dev ou npm start) precisa estar no ar. Cada volta envia NO MÁXIMO uma
// mensagem, e só se passar por todas as travas: pausa geral, simulação, janela de horário,
// teto do dia, intervalo mínimo, opt-out. Com a automação pausada (o padrão), nada acontece.

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const base = (args.url || process.env.WORKER_URL || "http://localhost:3000").replace(/\/$/, "");
const interval = Math.max(5, Number(args.interval || process.env.WORKER_INTERVAL || 20));
const token = process.env.WORKER_TOKEN;

if (!token) {
  console.error("Falta WORKER_TOKEN. Rode com: npm run worker (ele lê o .env.local).");
  process.exit(1);
}

const stamp = () => new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour12: false });
let last = "";
let stopped = false;

process.on("SIGINT", () => {
  stopped = true;
  console.log(`\n[${stamp()}] worker parado.`);
  process.exit(0);
});

function describe(r) {
  // com vários números a resposta traz uma volta por número
  if (r.action === "multi") return r.accounts.map((a) => `${a.name}: ${describe(a.result)}`).join(" | ");
  switch (r.action) {
    case "paused":
      return `pausado${r.reason ? `: ${r.reason}` : ""}`;
    case "offline":
      return `parado: ${r.reason}`;
    case "idle":
      return "nada na fila";
    case "deferred":
      return `adiada (${r.reason}) para ${new Date(r.until).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}`;
    case "cancelled":
      return `cancelada (${r.reason})`;
    case "simulated":
      return "simulou um envio (nada saiu)";
    case "sent":
      return "MENSAGEM ENVIADA";
    case "failed":
      return `falhou: ${r.error}${r.paused ? " (automação pausada)" : ""}`;
    default:
      return JSON.stringify(r);
  }
}

console.log(`[${stamp()}] worker ligado em ${base}, volta a cada ${interval}s. Ctrl+C para parar.`);

while (!stopped) {
  try {
    const res = await fetch(`${base}/api/worker/tick`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.json().catch(() => ({}));
    const line = res.ok ? describe(body) : `erro ${res.status}: ${body.error ?? "sem detalhe"}`;
    // só imprime quando muda, para o terminal não virar uma parede de texto
    if (line !== last || /ENVIADA|simulou|falhou/.test(line)) {
      console.log(`[${stamp()}] ${line}`);
      last = line;
    }
  } catch (error) {
    const line = `painel indisponível em ${base} (${error instanceof Error ? error.message : error})`;
    if (line !== last) console.log(`[${stamp()}] ${line}`);
    last = line;
  }
  await new Promise((r) => setTimeout(r, interval * 1000));
}
