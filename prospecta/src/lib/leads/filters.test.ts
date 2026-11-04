import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, PAGE_SIZE, filtersToSearch, parseFilters, toLeadQuery } from "./filters";

describe("parseFilters", () => {
  it("sem parâmetros devolve o padrão do Caçador", () => {
    expect(parseFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it("lê valores válidos", () => {
    const f = parseFilters({ site: "oportunidade", etapa: "qualificado", elegivel: "todos", min: "60", ordem: "reviews", pagina: "3", q: "aurora" });
    expect(f).toMatchObject({ site: "oportunidade", etapa: "qualificado", elegivel: "todos", min: 60, ordem: "reviews", pagina: 3, q: "aurora" });
  });

  it("valores inválidos caem no padrão", () => {
    const f = parseFilters({ site: "xxx", etapa: "yyy", min: "abc", pagina: "-4", ordem: "zzz", busca: "nao-e-uuid" });
    expect(f).toEqual(DEFAULT_FILTERS);
  });

  it("limita nota mínima a 0–100 e usa o primeiro valor de listas", () => {
    expect(parseFilters({ min: "900" }).min).toBe(100);
    expect(parseFilters({ min: ["40", "80"] }).min).toBe(40);
  });
});

describe("toLeadQuery", () => {
  it("traduz o filtro de site para tipos", () => {
    expect(toLeadQuery({ ...DEFAULT_FILTERS, site: "sem" }).siteKinds).toEqual(["none", "social"]);
    expect(toLeadQuery({ ...DEFAULT_FILTERS, site: "oportunidade" }).siteKinds).toEqual(["none", "social", "weak"]);
    expect(toLeadQuery({ ...DEFAULT_FILTERS, site: "todos" }).siteKinds).toBeUndefined();
  });

  it("elegibilidade, etapa e paginação", () => {
    const q = toLeadQuery({ ...DEFAULT_FILTERS, elegivel: "nao", etapa: "todas", pagina: 3, min: 70 });
    expect(q).toMatchObject({ eligible: false, stages: undefined, minScore: 70, limit: PAGE_SIZE, offset: PAGE_SIZE * 2 });
  });
});

describe("filtersToSearch", () => {
  it("padrão gera endereço limpo", () => {
    expect(filtersToSearch(DEFAULT_FILTERS)).toBe("");
  });
  it("só inclui o que mudou", () => {
    expect(filtersToSearch({ ...DEFAULT_FILTERS, site: "todos", pagina: 2 })).toBe("?site=todos&pagina=2");
  });
  it("ida e volta preserva os filtros", () => {
    const f = { ...DEFAULT_FILTERS, site: "fraco" as const, min: 60, q: "clínica aurora" };
    const params = Object.fromEntries(new URLSearchParams(filtersToSearch(f)));
    expect(parseFilters(params)).toEqual(f);
  });
});
