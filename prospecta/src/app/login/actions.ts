"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocalNow } from "@/lib/auth";
import { ownerEmail, sessionSecret } from "@/lib/env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "error"; message: string; email?: string };

/** Cookie do acesso antigo (qualquer valor valia como login). Não vale mais e é apagado onde der. */
const LEGACY_COOKIE = "jk_auth_session";

const WRONG = "E-mail ou senha incorretos.";

/**
 * Login de verdade: e-mail e senha do Supabase. Cria uma sessão real, então a proteção do banco
 * (RLS) continua valendo. É o caminho de quem abre o painel por outro endereço que não o localhost.
 */
export async function loginWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) return { status: "error", message: "Digite um e-mail válido.", email };
  if (!password) return { status: "error", message: "Digite a sua senha.", email };

  // Mesma resposta para e-mail errado e senha errada: não revela quem é o dono.
  const owner = ownerEmail();
  if (!owner || email !== owner) return { status: "error", message: WRONG, email };

  let ok = false;
  try {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    ok = !error;
  } catch {
    ok = false;
  }
  if (!ok) return { status: "error", message: WRONG, email };

  (await cookies()).delete(LEGACY_COOKIE);
  redirect("/");
}

/**
 * Entrada de 1 clique. SÓ funciona quando o painel é aberto neste computador (localhost): por
 * qualquer outro endereço (túnel, rede, hospedagem) é recusada e cai no login de verdade.
 */
export async function quickLogin(): Promise<void> {
  if (!(await isLocalNow())) redirect("/login?erro=remoto");

  const owner = ownerEmail();
  const secret = sessionSecret();
  if (!owner || !secret) redirect("/login?erro=config");

  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(owner, secret, Date.now()), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    secure: false, // o acesso local é http://localhost
  });
  store.delete(LEGACY_COOKIE);
  redirect("/");
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(LEGACY_COOKIE);
  try {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();
  } catch {
    /* sem sessão no Supabase: nada a encerrar */
  }
  redirect("/login");
}
