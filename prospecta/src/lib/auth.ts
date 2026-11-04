import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { appMode, ownerEmail, sessionSecret } from "@/lib/env";
import { isLocalRequest } from "@/lib/local-request";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";

export interface Viewer {
  email: string;
  demo: boolean;
  /**
   * - `demo`: modo demonstração (dados fictícios, sem login);
   * - `local`: o dono entrou com o 1 clique, neste computador (cookie assinado). Não há sessão no
   *   Supabase, então os dados passam pela chave de administrador (veja getRepo);
   * - `supabase`: login de verdade (e-mail e senha), com a proteção do banco (RLS) valendo.
   */
  source: "demo" | "local" | "supabase";
}

/** Este pedido veio do próprio computador (e não de um túnel, rede ou hospedagem)? */
export async function isLocalNow(): Promise<boolean> {
  const h = await headers();
  return isLocalRequest((name) => h.get(name));
}

/** Quem está usando o painel agora, ou null. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  await connection();

  const mode = appMode();
  if (mode === "demo") return { email: "demo@local", demo: true, source: "demo" };
  if (mode !== "supabase") return null;

  const owner = ownerEmail();
  if (!owner) return null;

  // 1) Acesso de 1 clique: cookie ASSINADO, e só se o pedido vier do próprio computador.
  const secret = sessionSecret();
  if (secret && (await isLocalNow())) {
    const email = verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret, Date.now());
    if (email && email.toLowerCase() === owner) return { email: owner, demo: false, source: "local" };
  }

  // 2) Login de verdade no Supabase (e-mail e senha), só para o dono.
  try {
    const sb = await createSupabaseServer();
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user?.email) return null;
    if (data.user.email.toLowerCase() !== owner) return null;
    return { email: data.user.email, demo: false, source: "supabase" };
  } catch {
    return null;
  }
});

/** Use no início de toda página e Server Action do painel. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}
