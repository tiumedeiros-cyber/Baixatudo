import { describe, expect, it } from "vitest";
import { MAX_PARTS, betweenPartsMs, countParts, splitMessageParts } from "./parts";

describe("splitMessageParts", () => {
  it("um parágrafo é uma mensagem só", () => {
    expect(splitMessageParts("Oi! Aqui é o Jonathan, da Kelvin Studio. Vale uma conversa rápida? Para parar de receber, responda PARE.")).toHaveLength(1);
  });

  it("uma linha em branco separa as mensagens, na ordem, sem espaço sobrando", () => {
    expect(splitMessageParts("Oi! Aqui é o Jonathan.\n\n  Vi a Clínica no Google.  \n\nJá pensaram em ter um site? responda PARE.")).toEqual([
      "Oi! Aqui é o Jonathan.",
      "Vi a Clínica no Google.",
      "Já pensaram em ter um site? responda PARE.",
    ]);
  });

  it("quebra de linha simples não separa; várias linhas em branco contam como uma", () => {
    expect(splitMessageParts("linha um\nlinha dois")).toEqual(["linha um\nlinha dois"]);
    expect(splitMessageParts("a\n\n\n\n\nb")).toEqual(["a", "b"]);
    expect(splitMessageParts("a\n \t \nb")).toEqual(["a", "b"]);
  });

  it(`passou de ${MAX_PARTS} parágrafos, o resto entra junto na última`, () => {
    const parts = splitMessageParts("um\n\ndois\n\ntrês\n\nquatro\n\ncinco");
    expect(parts).toHaveLength(MAX_PARTS);
    expect(parts[0]).toBe("um");
    expect(parts[MAX_PARTS - 1]).toBe("três\n\nquatro\n\ncinco");
  });

  it("texto vazio ou só de espaços não vira zero mensagens", () => {
    expect(splitMessageParts("")).toEqual([""]);
    expect(splitMessageParts("   \n\n  ")).toEqual([""]);
  });

  it("countParts diz quantas mensagens o lead recebe", () => {
    expect(countParts("a\n\nb")).toBe(2);
    expect(countParts("só uma")).toBe(1);
  });

  it("a pausa entre mensagens é curta e varia", () => {
    expect(betweenPartsMs(() => 0)).toBe(700);
    expect(betweenPartsMs(() => 1)).toBe(2000);
    expect(betweenPartsMs(() => 0.5)).toBeGreaterThan(700);
  });
});
