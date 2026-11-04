import { describe, expect, it } from "vitest";
import { parsePhoneBR, waLink } from "./phone";

describe("parsePhoneBR", () => {
  it("normaliza celular com máscara", () => {
    const p = parsePhoneBR("(85) 99123-4567");
    expect(p).toMatchObject({ e164: "+5585991234567", isMobile: true, ddd: "85", display: "(85) 99123-4567" });
  });

  it("aceita código do país e espaços", () => {
    expect(parsePhoneBR("+55 85 99123-4567").e164).toBe("+5585991234567");
    expect(parsePhoneBR("5585991234567").e164).toBe("+5585991234567");
  });

  it("remove o zero de operadora", () => {
    expect(parsePhoneBR("085 99123-4567").e164).toBe("+5585991234567");
  });

  it("reconhece telefone fixo", () => {
    const p = parsePhoneBR("(85) 3322-1100");
    expect(p).toMatchObject({ e164: "+558533221100", isMobile: false, display: "(85) 3322-1100" });
  });

  it("acrescenta o 9 em celular antigo de 8 dígitos", () => {
    const p = parsePhoneBR("8599123456");
    expect(p.e164).toBe("+5585999123456");
    expect(p.isMobile).toBe(true);
    expect(p.addedNinthDigit).toBe(true);
  });

  it("não confunde DDD 55 com código do país", () => {
    expect(parsePhoneBR("(55) 99999-8888").e164).toBe("+5555999998888");
  });

  it("rejeita DDD inexistente e números malformados", () => {
    expect(parsePhoneBR("(00) 99999-9999").e164).toBeNull();
    expect(parsePhoneBR("(20) 99999-9999").e164).toBeNull();
    expect(parsePhoneBR("12345").e164).toBeNull();
    expect(parsePhoneBR("(85) 88123-4567").e164).toBeNull();
  });

  it("devolve vazio para entrada nula ou em branco", () => {
    expect(parsePhoneBR(null).e164).toBeNull();
    expect(parsePhoneBR(undefined).e164).toBeNull();
    expect(parsePhoneBR("   ").e164).toBeNull();
    expect(parsePhoneBR("sem telefone").e164).toBeNull();
  });
});

describe("waLink", () => {
  it("monta o link do wa.me sem o +", () => {
    expect(waLink("+5585991234567")).toBe("https://wa.me/5585991234567");
  });
  it("codifica o texto", () => {
    expect(waLink("+5585991234567", "oi tudo bem?")).toBe("https://wa.me/5585991234567?text=oi%20tudo%20bem%3F");
  });
  it("devolve null sem número", () => {
    expect(waLink(null)).toBeNull();
  });
});
