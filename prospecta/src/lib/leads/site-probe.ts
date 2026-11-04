import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isBuilderHost, toUrl } from "./site";

export type ProbeSignal =
  | "fora_do_ar"
  | "certificado_invalido"
  | "sem_https"
  | "sem_viewport"
  | "pouco_conteudo"
  | "desatualizado"
  | "construtor_gratuito";

export const PROBE_SIGNAL_LABEL: Record<ProbeSignal, string> = {
  fora_do_ar: "Site fora do ar",
  certificado_invalido: "Certificado de segurança inválido",
  sem_https: "Sem HTTPS (navegador avisa 'não seguro')",
  sem_viewport: "Não adaptado para celular",
  pouco_conteudo: "Quase sem conteúdo",
  desatualizado: "Rodapé com ano antigo",
  construtor_gratuito: "Endereço de construtor gratuito",
};

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  signals: ProbeSignal[];
  /** Site considerado fraco o bastante para oferecer um novo. */
  weak: boolean;
  error?: string;
}

export interface ProbeDeps {
  fetchImpl?: typeof fetch;
  lookupImpl?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
  year?: number;
}

/** True para endereços que nunca devem ser acessados pelo servidor (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    if (v.startsWith("::ffff:")) {
      const tail = v.slice(7);
      return isIP(tail) === 4 ? isPrivateAddress(tail) : true;
    }
    return false;
  }
  return true;
}

async function defaultLookup(host: string): Promise<string[]> {
  const rows = await dnsLookup(host, { all: true });
  return rows.map((r) => r.address);
}

async function assertPublicHost(host: string, lookupImpl: (h: string) => Promise<string[]>) {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("host_privado");
  }
  const addresses = isIP(host) ? [host] : await lookupImpl(host);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("host_privado");
  }
}

/** Heurísticas sobre o HTML. Separada para testar sem rede. */
export function analyzeHtml(html: string, year: number): ProbeSignal[] {
  const signals: ProbeSignal[] = [];
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) signals.push("sem_viewport");

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 1200) signals.push("pouco_conteudo");

  const years = [...text.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,20}((?:19|20)\d{2})/gi)].map((m) =>
    Number(m[1]),
  );
  if (years.length > 0 && Math.max(...years) <= year - 4) signals.push("desatualizado");
  return signals;
}

export function isWeak(signals: ProbeSignal[]): boolean {
  const hard: ProbeSignal[] = ["fora_do_ar", "certificado_invalido", "sem_https", "construtor_gratuito"];
  if (signals.some((s) => hard.includes(s))) return true;
  return signals.length >= 2;
}

const MAX_HOPS = 4;
const MAX_BYTES = 300_000;

export async function probeSite(rawUrl: string, deps: ProbeDeps = {}): Promise<ProbeResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookupImpl = deps.lookupImpl ?? defaultLookup;
  const timeoutMs = deps.timeoutMs ?? 7000;
  const year = deps.year ?? new Date().getFullYear();

  const start = toUrl(rawUrl);
  if (!start) {
    return { ok: false, status: null, finalUrl: null, signals: [], weak: false, error: "url_invalida" };
  }

  const signals: ProbeSignal[] = [];
  let current = start;
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      await assertPublicHost(current.hostname, lookupImpl);
      const res = await fetchImpl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; JKProspectBot/1.0; +analise-de-site)",
          accept: "text/html,*/*;q=0.5",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;
        current = new URL(location, current);
        if (current.protocol !== "http:" && current.protocol !== "https:") break;
        continue;
      }

      if (current.protocol === "http:") signals.push("sem_https");
      if (isBuilderHost(current.hostname)) signals.push("construtor_gratuito");

      if (res.status >= 400) {
        signals.push("fora_do_ar");
        return finish(false, res.status, current, signals);
      }
      const html = (await res.text()).slice(0, MAX_BYTES);
      signals.push(...analyzeHtml(html, year));
      return finish(true, res.status, current, signals);
    }
    return { ok: false, status: null, finalUrl: current.toString(), signals, weak: false, error: "redirecionamentos" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "host_privado") {
      return { ok: false, status: null, finalUrl: current.toString(), signals: [], weak: false, error: message };
    }
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    const text = `${message} ${cause}`.toLowerCase();
    if (/cert|ssl|tls|self.signed|unable to verify/.test(text)) signals.push("certificado_invalido");
    else signals.push("fora_do_ar");
    return finish(false, null, current, signals, message);
  }
}

function finish(
  ok: boolean,
  status: number | null,
  url: URL,
  signals: ProbeSignal[],
  error?: string,
): ProbeResult {
  const unique = [...new Set(signals)];
  return { ok, status, finalUrl: url.toString(), signals: unique, weak: isWeak(unique), error };
}
