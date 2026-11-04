import "server-only";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/env";
import { isLocalUrl } from "./local-url";

/**
 * Endereço público do painel, usado nos links das prévias. Vem de SITE_URL; sem ele cai no
 * endereço pelo qual o dono está acessando agora (que, em desenvolvimento, é localhost).
 */
export async function publicBaseUrl(): Promise<{ url: string; local: boolean }> {
  const fromEnv = siteUrl();
  if (fromEnv) return { url: fromEnv, local: isLocalUrl(fromEnv) };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (isLocalUrl(`http://${host}`) ? "http" : "https");
  const url = `${proto}://${host}`;
  return { url, local: isLocalUrl(url) };
}
