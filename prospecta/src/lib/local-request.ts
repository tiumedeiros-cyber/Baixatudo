/**
 * "Este pedido veio do próprio computador?" Decide quando o 1 clique do painel vale.
 *
 * Só aceita quando o endereço digitado é localhost/127.0.0.1 E nada indica que o pedido passou por
 * um túnel, proxy ou hospedagem (cabeçalhos de encaminhamento com IP de fora, Cloudflare, Vercel…).
 * Se alguém publicar o painel na internet, o endereço de fora não passa aqui e cai no login de verdade.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOOPBACK_IP = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

/** Cabeçalhos que só existem quando há um intermediário entre o visitante e o painel. */
const PROXY_HEADERS = [
  "forwarded",
  "cf-connecting-ip",
  "cf-ray",
  "cf-visitor",
  "true-client-ip",
  "x-vercel-id",
  "x-vercel-forwarded-for",
  "x-envoy-external-address",
  "x-original-forwarded-for",
  "cdn-loop",
];

/** "Localhost:3000" → "localhost"; "[::1]:3000" → "[::1]". */
function hostName(value: string): string {
  const v = value.trim().toLowerCase();
  return v.startsWith("[") ? v.slice(0, v.indexOf("]") + 1) : v.split(":")[0];
}

export function isLocalRequest(header: (name: string) => string | null): boolean {
  const host = header("host");
  if (!host || !LOCAL_HOSTS.has(hostName(host))) return false;

  const forwardedHost = header("x-forwarded-host");
  if (forwardedHost && !forwardedHost.split(",").every((h) => LOCAL_HOSTS.has(hostName(h)))) return false;

  const forwardedFor = header("x-forwarded-for");
  if (forwardedFor && !forwardedFor.split(",").every((ip) => LOOPBACK_IP.test(ip.trim()))) return false;

  const realIp = header("x-real-ip");
  if (realIp && !LOOPBACK_IP.test(realIp.trim())) return false;

  return !PROXY_HEADERS.some((name) => header(name));
}
