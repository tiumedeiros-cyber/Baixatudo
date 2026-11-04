import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { factsFromSettings } from "@/lib/agent/context";
import { agentEnv } from "@/lib/env";
import { buildProviders } from "@/lib/agent/llm";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { DEFAULT_SETTINGS } from "@/lib/leads/types";
import { createMemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { toTemplateLead } from "./engine";
import { writeOpening } from "./opening";
import type { TemplateLead } from "./templates";
import { chooseOpeningStyle, emptyHistory, remember } from "./variation";

/**
 * Avaliação das aberturas escritas pela IA, com chamadas reais. NÃO roda no `npm test`: gasta centavos da OpenAI.
 *   npm run agent:opening
 * Variáveis opcionais: AGENT_EVAL_PROVIDER=openai|gemini, AGENT_EVAL_LIMIT=24, AGENT_EVAL_OUT=caminho.json
 * Mostra, para cada lead da amostra, se a IA passou nas travas, o texto e o tempo.
 */
/** Negócios de verdade das conversas do dono (nomes públicos do Google Maps), para ver o tratamento direto da pessoa. */
const REAL: TemplateLead[] = [
  { id: "r1", name: "Dra. Heloisa Lima - Estética Avançada", neighborhood: "Álvaro Weyne", city: "Fortaleza", category: "Clínica de estética", niche: "Estética", rating: 5, reviewsCount: 60, websiteKind: "social" },
  { id: "r2", name: "Larissa Mendes Estética e Beleza", neighborhood: "Mondubim", city: "Fortaleza", category: "Estética", niche: "Estética", rating: 4.9, reviewsCount: 40, websiteKind: "social" },
  { id: "r3", name: "Raquel Souza Estética - Limpeza de pele, peeling químico, microagulhamento, cicatrizes de acne e mela...", neighborhood: "Parquelândia", city: "Fortaleza", category: "Estética", niche: "Estética", rating: 4.9, reviewsCount: 90, websiteKind: "social" },
  { id: "r4", name: "Clínica VALÉRIA SOUSA - ESTÉTICA & BELEZA", neighborhood: "Siqueira", city: "Fortaleza", category: "Spa de saúde", niche: "Estética", rating: 5, reviewsCount: 126, websiteKind: "none" },
  { id: "r5", name: "Embelezar por Bruna Prado Clinica Estética", neighborhood: "Messejana", city: "Fortaleza", category: "Clínica de estética", niche: "Estética", rating: 4.8, reviewsCount: 35, websiteKind: "none" },
  { id: "r6", name: "Rafael Neves - ADVOCACIA", neighborhood: null, city: "São Paulo", category: "Escritório de advocacia", niche: "Advocacia", rating: 4.7, reviewsCount: 18, websiteKind: "none" },
  { id: "r7", name: "Dr. Carlos Lima Odontologia", neighborhood: "Aldeota", city: "Fortaleza", category: "Dentista", niche: "Odontologia", rating: 4.4, reviewsCount: 12, websiteKind: "weak" },
  { id: "r8", name: "Espaço Prime Estética", neighborhood: "Meireles", city: "Fortaleza", category: "Estética", niche: "Estética", rating: 3.9, reviewsCount: 6, websiteKind: "none" },
];

const live = process.env.AGENT_EVAL === "1" && !!agentEnv();

describe.skipIf(!live)("aberturas escritas pela IA (chamadas reais)", () => {
  it(
    "escreve a abertura de cada lead da amostra",
    async () => {
      const repo = createMemoryRepo();
      await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
      const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 200, offset: 0 });
      const limit = Number(process.env.AGENT_EVAL_LIMIT) || 24;
      const step = rows.length / Math.min(limit, rows.length);
      const sample = Array.from({ length: Math.min(limit, rows.length) }, (_, i) => rows[Math.floor(i * step)]);

      const only = process.env.AGENT_EVAL_PROVIDER;
      const provider = buildProviders(agentEnv()).find((p) => !only || p.name.split(" ")[0] === only);
      expect(provider, "nenhuma IA liberada no .env.local").toBeTruthy();

      // AGENT_OPENING_MODE=completa avalia as três mensagens; o padrão é a abertura curta
      const settings = { ...DEFAULT_SETTINGS, agentFlow: "qualificar" as const, openingMode: process.env.AGENT_OPENING_MODE === "completa" ? ("completa" as const) : ("curta" as const) };
      const ctx = { senderName: settings.senderName, brandName: settings.brandName, senderFullName: settings.senderFullName, senderRole: settings.senderRole, flow: "qualificar" as const, mode: settings.openingMode };
      const facts = factsFromSettings(settings);

      const report: Record<string, unknown>[] = [];
      let accepted = 0;
      const targets = [...REAL, ...sample.map(toTemplateLead)];
      // o estilo de cada abertura é escolhido como no lote de verdade (sem repetir o que acabou de sair)
      const history = emptyHistory();
      const bodies: string[] = [];
      for (const lead of targets) {
        const started = Date.now();
        const choice = chooseOpeningStyle({ lead, ctx, history, recentBodies: bodies, rng: Math.random });
        const out = await writeOpening(lead, choice ? { ...ctx, style: choice.style } : ctx, { llm: provider!, facts, timeoutMs: 60_000 });
        if (choice) remember(history, bodies, choice, out.body);
        const ms = Date.now() - started;
        if (out.source === "ia") accepted++;
        report.push({ lead: lead.name, site: lead.websiteKind, source: out.source, ms, variant: out.variant, mensagens: out.parts, note: out.note });
      }
      const lines = report.map((r) => `${r.source === "ia" ? "IA    " : "MODELO"} ${String(r.ms).padStart(5)} ms  ${r.lead}\n${(r.mensagens as string[]).map((m) => `      | ${m}`).join("\n")}${r.note ? `\n      ! ${r.note}` : ""}`);
      const text = [`${provider!.name}:${provider!.model}  passou na trava: ${accepted} de ${targets.length}`, "", ...lines].join("\n");
      if (process.env.AGENT_EVAL_OUT) fs.writeFileSync(process.env.AGENT_EVAL_OUT, text);
      expect(report.length).toBeGreaterThan(0);
    },
    1_800_000,
  );
});
