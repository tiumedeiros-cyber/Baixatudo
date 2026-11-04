import { describe, expect, it } from "vitest";
import { mergeAutomation } from "./config";
import {
  addDays,
  dailyCapFor,
  daysBetween,
  evaluateStop,
  gapMs,
  inWindow,
  localParts,
  nextOpening,
  startOfLocalDay,
  typingMs,
  weekdayOf,
  zonedToUtc,
} from "./guardrails";
import { planSchedule } from "./schedule";

// Fortaleza é UTC-3 o ano todo. 2026-10-22 é quinta-feira.
const cfg = mergeAutomation({});
const at = (iso: string) => new Date(iso);
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("fuso e calendário", () => {
  it("converte UTC para o horário de Fortaleza", () => {
    const p = localParts(at("2026-10-22T13:30:00Z"), cfg.timezone);
    expect(p).toMatchObject({ ymd: "2026-10-22", hour: 10, minute: 30, minutes: 630, weekday: 4 });
  });

  it("virada de dia no fuso: 02:00 UTC ainda é a noite anterior", () => {
    expect(localParts(at("2026-10-23T02:00:00Z"), cfg.timezone)).toMatchObject({ ymd: "2026-10-22", hour: 23 });
  });

  it("zonedToUtc é o inverso de localParts", () => {
    expect(zonedToUtc("2026-10-22", 9 * 60, cfg.timezone).toISOString()).toBe("2026-10-22T12:00:00.000Z");
    expect(zonedToUtc("2026-10-22", 0, cfg.timezone).toISOString()).toBe("2026-10-22T03:00:00.000Z");
  });

  it("datas", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(weekdayOf("2026-10-22")).toBe(4);
    expect(weekdayOf("2026-10-25")).toBe(7);
    expect(daysBetween("2026-10-01", "2026-10-22")).toBe(21);
  });
});

describe("janelas de envio", () => {
  it("dentro da manhã e da tarde, em dia útil", () => {
    expect(inWindow(at("2026-10-22T13:00:00Z"), cfg)).toBe(true); // 10:00
    expect(inWindow(at("2026-10-22T18:00:00Z"), cfg)).toBe(true); // 15:00
  });

  it("fora: almoço, noite e madrugada", () => {
    expect(inWindow(at("2026-10-22T15:30:00Z"), cfg)).toBe(false); // 12:30
    expect(inWindow(at("2026-10-22T22:00:00Z"), cfg)).toBe(false); // 19:00
    expect(inWindow(at("2026-10-22T08:00:00Z"), cfg)).toBe(false); // 05:00
  });

  it("a janela é aberta no começo e fechada no fim", () => {
    expect(inWindow(at("2026-10-22T12:00:00Z"), cfg)).toBe(true); // 09:00
    expect(inWindow(at("2026-10-22T15:00:00Z"), cfg)).toBe(false); // 12:00
  });

  it("fim de semana nunca", () => {
    expect(inWindow(at("2026-10-24T13:00:00Z"), cfg)).toBe(false); // sábado 10:00
    expect(inWindow(at("2026-10-25T13:00:00Z"), cfg)).toBe(false); // domingo
  });

  it("próxima abertura", () => {
    expect(nextOpening(at("2026-10-22T13:00:00Z"), cfg).toISOString()).toBe("2026-10-22T13:00:00.000Z"); // já aberta
    expect(nextOpening(at("2026-10-22T15:30:00Z"), cfg).toISOString()).toBe("2026-10-22T17:00:00.000Z"); // 12:30 → 14:00
    expect(nextOpening(at("2026-10-22T22:00:00Z"), cfg).toISOString()).toBe("2026-10-23T12:00:00.000Z"); // noite → sexta 09:00
    expect(nextOpening(at("2026-10-23T22:00:00Z"), cfg).toISOString()).toBe("2026-10-26T12:00:00.000Z"); // sexta à noite → segunda 09:00
  });
});

describe("teto diário e aquecimento", () => {
  it("antes do primeiro envio vale a semana 1", () => {
    expect(dailyCapFor("2026-10-22", cfg)).toBe(8);
  });

  it("rampa: semana 1, semana 2, ritmo normal", () => {
    const warm = mergeAutomation({ warmupStart: "2026-10-01" });
    expect(dailyCapFor("2026-10-01", warm)).toBe(8);
    expect(dailyCapFor("2026-10-07", warm)).toBe(8);
    expect(dailyCapFor("2026-10-08", warm)).toBe(15);
    expect(dailyCapFor("2026-10-14", warm)).toBe(15);
    expect(dailyCapFor("2026-10-15", warm)).toBe(30);
  });
});

describe("teto diário: rampa opcional e sem máximo", () => {
  it("sem as duas semanas, só o teto normal vale, desde o primeiro dia", () => {
    const flat = mergeAutomation({ warmupStart: "2026-10-01", caps: { week1: null, week2: null, steady: 150 } });
    for (const day of ["2026-10-01", "2026-10-07", "2026-10-08", "2026-10-15"]) expect(dailyCapFor(day, flat)).toBe(150);
    expect(dailyCapFor("2026-10-22", mergeAutomation({ caps: { week1: null, week2: null, steady: 150 } }))).toBe(150); // antes do 1º envio
  });

  it("semana em branco usa a próxima", () => {
    const onlyWeek2 = mergeAutomation({ warmupStart: "2026-10-01", caps: { week1: null, week2: 100, steady: 300 } });
    expect(dailyCapFor("2026-10-03", onlyWeek2)).toBe(100);
    expect(dailyCapFor("2026-10-10", onlyWeek2)).toBe(100);
    expect(dailyCapFor("2026-10-20", onlyWeek2)).toBe(300);
    const onlyWeek1 = mergeAutomation({ warmupStart: "2026-10-01", caps: { week1: 50, week2: null, steady: 300 } });
    expect(dailyCapFor("2026-10-03", onlyWeek1)).toBe(50);
    expect(dailyCapFor("2026-10-10", onlyWeek1)).toBe(300);
  });

  it("não há máximo: o número do dono vale, e o que está salvo como em branco continua em branco", () => {
    const big = mergeAutomation({ warmupStart: "2026-10-01", caps: { week1: 500, week2: 1000, steady: 5000 } });
    expect(dailyCapFor("2026-10-02", big)).toBe(500);
    expect(dailyCapFor("2026-12-01", big)).toBe(5000);
    expect(mergeAutomation({ caps: { week1: null, week2: null, steady: 80 } }).caps).toEqual({ week1: null, week2: null, steady: 80 });
  });
});

describe("intervalos humanos", () => {
  it("o intervalo fica entre o mínimo e o máximo", () => {
    expect(gapMs(() => 0, cfg)).toBe(180_000);
    expect(gapMs(() => 1, cfg)).toBe(540_000);
    expect(gapMs(() => 0.5, cfg)).toBe(360_000);
  });

  it("digitando: proporcional ao texto, sempre dentro do limite", () => {
    const short = typingMs("oi", () => 0.5, cfg);
    const long = typingMs("x".repeat(400), () => 0.5, cfg);
    expect(short).toBeGreaterThanOrEqual(cfg.typingMinMs);
    expect(long).toBeLessThanOrEqual(cfg.typingMaxMs);
    expect(long).toBeGreaterThanOrEqual(short);
  });
});

describe("parada automática", () => {
  const counts = (sent: number, replied: number) => ({
    prospectingSent: sent,
    conversationsReplied: replied,
    draft: 0,
    approved: 0,
    simulated: 0,
    failed: 0,
  });

  it("amostra pequena não decide nada", () => {
    expect(evaluateStop(counts(39, 0), cfg).stop).toBe(false);
  });

  it("40 envios e ninguém respondeu: pausa", () => {
    const r = evaluateStop(counts(40, 0), cfg);
    expect(r.stop).toBe(true);
    expect(r.reason).toMatch(/0,0%/);
  });

  it("taxa saudável continua", () => {
    expect(evaluateStop(counts(40, 4), cfg).stop).toBe(false);
    expect(evaluateStop(counts(100, 3), cfg).stop).toBe(false); // exatamente 3%
    expect(evaluateStop(counts(100, 2), cfg).stop).toBe(true);
  });
});

describe("início do dia local", () => {
  it("meia-noite de Fortaleza em UTC", () => {
    expect(startOfLocalDay(at("2026-10-22T20:00:00Z"), cfg).toISOString()).toBe("2026-10-22T03:00:00.000Z");
    expect(startOfLocalDay(at("2026-10-23T01:00:00Z"), cfg).toISOString()).toBe("2026-10-22T03:00:00.000Z");
  });
});

describe("planSchedule", () => {
  it("só marca horários dentro das janelas e em ordem", () => {
    const now = at("2026-10-22T12:30:00Z"); // quinta 09:30
    const times = planSchedule({ count: 8, now, cfg, rng: seq(0.1, 0.5, 0.9), usedToday: 0 });
    expect(times).toHaveLength(8);
    for (const t of times) expect(inWindow(t, cfg), t.toISOString()).toBe(true);
    for (let i = 1; i < times.length; i++) expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
  });

  it("respeita o intervalo mínimo entre mensagens", () => {
    const times = planSchedule({ count: 6, now: at("2026-10-22T12:30:00Z"), cfg, rng: seq(0, 0.3, 1), usedToday: 0 });
    for (let i = 1; i < times.length; i++) {
      const gap = times[i].getTime() - times[i - 1].getTime();
      // dentro da janela o respiro mínimo vale; trocar de janela/dia só aumenta
      expect(gap).toBeGreaterThanOrEqual(cfg.gapMinSec * 1000);
    }
  });

  it("não passa do teto: o que sobra vai para o próximo dia útil", () => {
    const times = planSchedule({ count: 12, now: at("2026-10-22T12:30:00Z"), cfg, rng: seq(0.2), usedToday: 0 });
    const perDay: Record<string, number> = {};
    for (const t of times) {
      const d = localParts(t, cfg.timezone).ymd;
      perDay[d] = (perDay[d] ?? 0) + 1;
    }
    expect(Math.max(...Object.values(perDay))).toBeLessThanOrEqual(8);
    expect(Object.keys(perDay).length).toBeGreaterThanOrEqual(2);
  });

  it("o que já saiu hoje conta contra o teto", () => {
    const times = planSchedule({ count: 3, now: at("2026-10-22T12:30:00Z"), cfg, rng: seq(0.2), usedToday: 7 });
    const today = times.filter((t) => localParts(t, cfg.timezone).ymd === "2026-10-22");
    expect(today).toHaveLength(1);
  });

  it("sexta à noite começa na segunda", () => {
    const [first] = planSchedule({ count: 1, now: at("2026-10-23T23:00:00Z"), cfg, rng: seq(0), usedToday: 0 });
    expect(localParts(first, cfg.timezone)).toMatchObject({ ymd: "2026-10-26", weekday: 1 });
  });

  it("zero mensagens não faz nada", () => {
    expect(planSchedule({ count: 0, now: new Date(), cfg, rng: Math.random, usedToday: 0 })).toEqual([]);
  });
});
