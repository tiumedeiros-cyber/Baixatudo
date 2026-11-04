import { NextResponse, type NextRequest } from "next/server";
import { getAutoAgentLlm } from "@/lib/agent/runtime";
import { isLocalUrl } from "@/lib/deals/local-url";
import { siteUrl, webhookSecret } from "@/lib/env";
import { accountMatchesDevice } from "@/lib/outreach/accounts";
import { handleAckEvent, handleMessageEvent } from "@/lib/outreach/engine";
import { loadRoster } from "@/lib/outreach/roster";
import { MissingSecretKeyError } from "@/lib/supabase/admin";
import { parseWebhook, verifySignature } from "@/lib/outreach/webhook";
import { getAdminRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Webhook do GOWA: respostas dos leads e recibos de entrega/leitura.
 * Só aceita o que vier assinado com WA_WEBHOOK_SECRET (HMAC-SHA256, cabeçalho X-Hub-Signature-256).
 * Responde 200 para tudo que não interessa, para o GOWA não ficar reenviando.
 */
export async function POST(request: NextRequest) {
  const secret = webhookSecret();
  if (!secret) return NextResponse.json({ error: "WA_WEBHOOK_SECRET não configurado" }, { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: "corpo não é JSON" });
  }

  const evt = parseWebhook(body);
  if (evt.kind === "ignored") {
    // Uma resposta que não casou com nenhum número some em silêncio, e isso esconde bug. Deixa um
    // aviso no feed do Comando, só com os NOMES dos campos (nunca o texto nem o número).
    if (evt.reason.startsWith("sem telefone")) {
      try {
        await (await getAdminRepo()).addEvents([
          { leadId: null, type: "automacao", payload: { text: `mensagem recebida e ignorada: ${evt.reason}` } },
        ]);
      } catch (error) {
        console.error("webhook do WhatsApp (diagnóstico):", error);
      }
    }
    return NextResponse.json({ ok: true, ignored: evt.reason });
  }

  try {
    const repo = await getAdminRepo();
    if (evt.kind === "ack") {
      return NextResponse.json({ ok: true, updated: await handleAckEvent(repo, evt) });
    }
    const site = siteUrl();
    // com vários números, o aparelho que recebeu diz em qual deles a mensagem chegou
    const roster = await loadRoster(repo);
    const arrivedOn = roster.multi && evt.deviceId ? (roster.active.find((a) => accountMatchesDevice(a, evt.deviceId))?.id ?? null) : null;
    const result = await handleMessageEvent(repo, evt, new Date(), {
      publicBaseUrl: site && !isLocalUrl(site) ? site : null,
      agent: { llm: getAutoAgentLlm() },
      arrivedOn,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof MissingSecretKeyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    console.error("webhook do WhatsApp:", error);
    // 500 faz o GOWA tentar de novo mais tarde, o que é o certo para falha nossa
    return NextResponse.json({ ok: false, error: "falha ao processar" }, { status: 500 });
  }
}
