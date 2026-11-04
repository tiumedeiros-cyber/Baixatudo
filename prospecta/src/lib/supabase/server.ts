import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "@/lib/env";

/** Cliente do Supabase ligado à sessão (cookies) de quem fez a requisição. */
export async function createSupabaseServer() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase não configurado (SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY).");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components não podem gravar cookie. O proxy.ts renova a sessão.
        }
      },
    },
  });
}
