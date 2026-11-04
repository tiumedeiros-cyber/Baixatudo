import "server-only";
import { requireViewer } from "@/lib/auth";
import { appMode } from "@/lib/env";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSeededDemoRepo } from "./demo-seed";
import type { MemoryRepo } from "./memory";
import { createSupabaseRepo } from "./supabase";
import type { Repo } from "./types";

const globalForDemo = globalThis as unknown as { __jkDemoRepo?: Promise<MemoryRepo> };

/** O modo demonstração vive em memória e sobrevive ao hot reload do `next dev`. */
function demoRepo(): Promise<MemoryRepo> {
  globalForDemo.__jkDemoRepo ??= createSeededDemoRepo();
  return globalForDemo.__jkDemoRepo;
}

/**
 * Única porta de entrada para os dados DE QUEM ESTÁ NO PAINEL. Exige o dono logado ANTES de tocar
 * no banco (o layout e a página renderizam em paralelo, então só o layout checar não basta).
 *
 * Duas formas de entrar, duas formas de acessar o banco:
 *  - login de verdade (e-mail e senha): sessão do Supabase, com a proteção do banco (RLS) valendo;
 *  - acesso de 1 clique neste computador: não há sessão no Supabase, então usa a chave de
 *    administrador. Isso só acontece para o cookie ASSINADO e vindo do próprio computador (veja auth.ts);
 *    nunca para quem abre o painel por outro endereço.
 */
export async function getRepo(): Promise<Repo> {
  const viewer = await requireViewer();
  const mode = appMode();
  if (mode === "supabase") {
    if (viewer.source === "local") return createSupabaseRepo(createSupabaseAdmin());
    return createSupabaseRepo(await createSupabaseServer());
  }
  if (mode === "demo") return demoRepo();
  throw new Error("Configuração incompleta: defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.");
}

/**
 * Para as páginas públicas (a prévia do site, aberta por quem recebeu o link). Sem sessão e sem
 * chave secreta: no Supabase o visitante só consegue chamar `view_demo`; no modo demonstração usa
 * os mesmos dados fictícios em memória.
 */
export async function getPublicRepo(): Promise<Repo> {
  const mode = appMode();
  if (mode === "supabase") return createSupabaseRepo(createSupabaseAnon());
  if (mode === "demo") return demoRepo();
  throw new Error("Configuração incompleta: defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.");
}

/**
 * Dados para quem NÃO tem sessão: o worker de envio e o webhook do WhatsApp. Ignora a RLS
 * (chave secreta), por isso só as rotas que se autenticam por segredo próprio podem chamar.
 */
export async function getAdminRepo(): Promise<Repo> {
  const mode = appMode();
  if (mode === "supabase") return createSupabaseRepo(createSupabaseAdmin());
  if (mode === "demo") return demoRepo();
  throw new Error("Configuração incompleta: defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.");
}
