import "server-only";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/env";

/** Endereço público do painel (para o link do e-mail de login). */
export async function requestOrigin(): Promise<string> {
  const configured = siteUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}
