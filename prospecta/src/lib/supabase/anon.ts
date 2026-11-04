import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";

/**
 * Cliente SEM sessão, só com a chave publishable. É o que a página pública da prévia usa: o visitante
 * não é o dono, então a RLS barra tudo, menos a função `view_demo`, liberada de propósito para
 * devolver o conteúdo de uma prévia publicada pelo endereço exato.
 */
export function createSupabaseAnon() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase não configurado (SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY).");
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
