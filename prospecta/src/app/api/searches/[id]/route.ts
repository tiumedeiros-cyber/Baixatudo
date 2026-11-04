import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { apifyToken } from "@/lib/env";
import { getRepo } from "@/lib/repo";
import { advanceApifySearch } from "@/lib/sources/advance";

/** Estado de uma busca. Se o Apify já terminou, esta consulta importa os leads. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getViewer())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const repo = await getRepo();
  let search = await repo.getSearch(id);
  if (!search) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const token = apifyToken();
  if (search.status === "running" && search.source === "apify") {
    search = token
      ? await advanceApifySearch(repo, search, token)
      : await repo.updateSearch(id, {
          status: "failed",
          error: "APIFY_TOKEN não está configurado neste ambiente.",
          finishedAt: new Date().toISOString(),
        });
  }

  return NextResponse.json(
    {
      id: search.id,
      status: search.status,
      found: search.found,
      inserted: search.inserted,
      duplicates: search.duplicates,
      eligible: search.eligible,
      error: search.error,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
