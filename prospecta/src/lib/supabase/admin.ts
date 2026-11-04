import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig, supabaseSecretKey } from "@/lib/env";

export class MissingSecretKeyError extends Error {
  constructor() {
    super("Falta SUPABASE_SECRET_KEY no .env.local (Supabase → Project Settings → API Keys → secret).");
    this.name = "MissingSecretKeyError";
  }
}

/**
 * Cliente com a chave secreta: ignora a RLS. Use SÓ no worker e no webhook, que rodam no PC
 * sem sessão de usuário, e nunca devolva o que ele lê sem checar quem está pedindo.
 */
export function createSupabaseAdmin() {
  const config = supabaseConfig();
  const secret = supabaseSecretKey();
  if (!config) throw new Error("Supabase não configurado (SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY).");
  if (!secret) throw new MissingSecretKeyError();
  return createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
