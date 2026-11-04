import type { RawPlace } from "./to-place";

export const MAX_IMPORT_ITEMS = 5000;
const WRAPPER_KEYS = ["items", "results", "leads", "places", "data"] as const;

export interface ParsedJson {
  items: RawPlace[];
  error: string | null;
}

function isObject(v: unknown): v is RawPlace {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function pickArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (isObject(value)) {
    for (const key of WRAPPER_KEYS) {
      const inner = value[key];
      if (Array.isArray(inner)) return inner;
    }
  }
  return null;
}

/**
 * Lê o JSON exportado do Apify (ou do site antigo). Aceita:
 * - um array de lugares;
 * - um objeto com os lugares em `items`, `results`, `leads`, `places` ou `data`;
 * - um item por linha (NDJSON).
 */
export function parseLeadsJson(text: string): ParsedJson {
  const clean = text.replace(/^﻿/, "").trim();
  if (!clean) return { items: [], error: "O arquivo está vazio." };

  let list: unknown[] | null = null;
  try {
    list = pickArray(JSON.parse(clean));
    if (!list) {
      return {
        items: [],
        error: "Não achei uma lista de lugares. Esperava um array ou um objeto com `items`.",
      };
    }
  } catch {
    const lines = clean.split(/\r?\n/).filter((l) => l.trim());
    const parsed: unknown[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        return { items: [], error: "O texto não é um JSON válido." };
      }
    }
    list = parsed;
  }

  const items = list.filter(isObject);
  if (items.length === 0) return { items: [], error: "Nenhum lugar encontrado na lista." };
  if (items.length > MAX_IMPORT_ITEMS) {
    return { items: [], error: `Muitos itens (${items.length}). O limite por importação é ${MAX_IMPORT_ITEMS}.` };
  }
  return { items, error: null };
}
