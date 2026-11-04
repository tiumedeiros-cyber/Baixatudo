import { NextResponse, type NextRequest } from "next/server";
import { appMode, ownerEmail } from "@/lib/env";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Destino do link de acesso enviado por e-mail: troca o código pela sessão,
 * confere que é o dono e, no primeiro acesso, registra o dono do workspace.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const fail = (reason: "link" | "acesso") =>
    NextResponse.redirect(`${origin}/login?erro=${reason}`);

  if (appMode() !== "supabase") return fail("acesso");
  const code = searchParams.get("code");
  if (!code) return fail("link");

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("link");

  const { data } = await supabase.auth.getUser();
  const owner = ownerEmail();
  if (!owner || data.user?.email?.toLowerCase() !== owner) {
    await supabase.auth.signOut();
    return fail("acesso");
  }

  const claim = await supabase.rpc("claim_workspace");
  if (claim.error || claim.data !== data.user.id) {
    // Já existe outro dono registrado neste banco.
    await supabase.auth.signOut();
    return fail("acesso");
  }

  return NextResponse.redirect(`${origin}/`);
}
