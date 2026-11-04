import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ITEMS, parseLeadsJson } from "./import-json";

describe("parseLeadsJson", () => {
  it("aceita um array de lugares", () => {
    const r = parseLeadsJson('[{"title":"A"},{"title":"B"}]');
    expect(r.error).toBeNull();
    expect(r.items).toHaveLength(2);
  });

  it("aceita objeto com a lista em items/results/leads", () => {
    for (const key of ["items", "results", "leads", "places", "data"]) {
      const r = parseLeadsJson(JSON.stringify({ [key]: [{ title: "A" }] }));
      expect(r.items, key).toHaveLength(1);
    }
  });

  it("aceita um item por linha (NDJSON)", () => {
    const r = parseLeadsJson('{"title":"A"}\n{"title":"B"}\n');
    expect(r.items.map((i) => i.title)).toEqual(["A", "B"]);
  });

  it("ignora BOM no começo do arquivo", () => {
    expect(parseLeadsJson('﻿[{"title":"A"}]').items).toHaveLength(1);
  });

  it("descarta itens que não são objetos", () => {
    expect(parseLeadsJson('[{"title":"A"}, 3, "x", null]').items).toHaveLength(1);
  });

  it("explica o erro em português", () => {
    expect(parseLeadsJson("").error).toMatch(/vazio/i);
    expect(parseLeadsJson("isso não é json").error).toMatch(/JSON/);
    expect(parseLeadsJson('{"foo":1}').error).toMatch(/lista/i);
    expect(parseLeadsJson("[]").error).toMatch(/Nenhum/);
  });

  it("limita o tamanho da importação", () => {
    const big = JSON.stringify(Array.from({ length: MAX_IMPORT_ITEMS + 1 }, (_, i) => ({ title: `L${i}` })));
    expect(parseLeadsJson(big).error).toMatch(/limite/i);
  });
});
