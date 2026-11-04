import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { getRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * O pulso do painel: uma assinatura curta do que as telas mostram. A tela aberta (`LiveRefresh`) pergunta aqui de poucos em
 * poucos segundos e só recarrega quando a assinatura muda. Só para quem está logado no painel; devolve 401 em vez de
 * redirecionar, para a tela saber que a sessão acabou.
 */
export async function GET() {
  if (!(await getViewer())) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  try {
    const repo = await getRepo();
    return NextResponse.json({ v: await repo.pulse() }, { headers: NO_STORE });
  } catch (error) {
    console.error("pulso do painel:", error);
    return NextResponse.json({ error: "indisponível" }, { status: 503, headers: NO_STORE });
  }
}
