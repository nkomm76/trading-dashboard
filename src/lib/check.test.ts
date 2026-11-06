import { describe, expect, it } from "vitest";
import { dcfPerShare, dcfValue, expectedYield, fairValueByYield, recentFundamentals, smoothedGrowth } from "./check";
import type { MarketData } from "./data/types";

const market = (over: Partial<MarketData>): MarketData => ({
  symbol: "X",
  name: "X AG",
  currency: "EUR",
  financialCurrency: "EUR",
  price: { value: 100, source: "t", asOf: "2026-10-01" },
  dividends: [],
  quarterly: [],
  annual: [],
  fetchedAt: "",
  ...over,
});

describe("expectedYield", () => {
  it("rechnet die letzte Zahlung hoch", () => {
    const divs = ["2025-11-01", "2026-02-01", "2026-05-01", "2026-08-01"].map((date) => ({ date, amount: 0.5 }));
    expect(expectedYield(divs, 50, "2026-10-01")?.value).toBeCloseTo(0.04);
  });
});

describe("fairValueByYield", () => {
  // Quartalszahler mit 0,50 je Quartal seit 2018, Kurs konstant 50 → Rendite 4 %
  const divs = [];
  for (let y = 2018; y <= 2026; y++) for (const m of ["02", "05", "08", "11"]) if (`${y}-${m}` <= "2026-08") divs.push({ date: `${y}-${m}-15`, amount: 0.5 });
  const closes = (price: (i: number) => number) =>
    Array.from({ length: 72 }, (_, i) => {
      const d = new Date(Date.UTC(2020, 9 + i, 1));
      return { date: d.toISOString().slice(0, 10), close: price(i) };
    });

  it("fairer Wert = Jahresdividende ÷ Ø-Rendite", () => {
    const f = fairValueByYield(divs, closes(() => 50), 40, "2026-10-01")!;
    expect(f.dividend).toBeCloseTo(2);
    expect(f.avgYield).toBeCloseTo(0.04);
    expect(f.value).toBeCloseTo(50);
    expect(f.deviation).toBeCloseTo(-0.2);
    expect(f.months).toBeGreaterThanOrEqual(58);
  });

  it("höherer Durchschnittskurs ergibt höheren fairen Wert", () => {
    const f = fairValueByYield(divs, closes(() => 80), 50, "2026-10-01")!;
    expect(f.value).toBeCloseTo(80);
    expect(f.deviation).toBeLessThan(0);
  });

  it("zählt eine Jahresdividende nicht doppelt, wenn der Ex-Tag früher liegt als im Vorjahr", () => {
    // Ex-Tage rücken jedes Jahr ein paar Tage nach vorn; Kurs konstant 50, Dividende 2 → 4 %
    const annual = ["2019-05-20", "2020-05-15", "2021-05-10", "2022-05-05", "2023-04-28", "2024-04-26", "2025-04-24", "2026-04-22"].map((date) => ({ date, amount: 2 }));
    const f = fairValueByYield(annual, closes(() => 50), 50, "2026-10-01")!;
    expect(f.maxYield).toBeCloseTo(0.04);
    expect(f.value).toBeCloseTo(50);
  });

  it("zählt nach einem Wechsel von Quartals- auf Jahreszahlung frühere Quartale voll", () => {
    // Bis 2023 vier Zahlungen à 0,50, ab 2024 eine Jahreszahlung von 2, Kurs 50
    const switched = [
      ...[2019, 2020, 2021, 2022, 2023].flatMap((y) => ["02", "05", "08", "11"].map((m) => ({ date: `${y}-${m}-15`, amount: 0.5 }))),
      { date: "2024-11-15", amount: 2 },
      { date: "2025-11-14", amount: 2 },
    ];
    const f = fairValueByYield(switched, closes(() => 50), 50, "2026-10-01")!;
    // Quartalsjahre mit 4 %, nur im Umstellungsjahr weniger; früher galt der heutige Rhythmus (1 Zahlung) für alle Jahre
    expect(f.maxYield).toBeCloseTo(0.04);
    expect(f.avgYield).toBeGreaterThan(0.033);
  });

  it("behält eine Sonderdividende mitten im Jahr", () => {
    const special = [...divs, { date: "2023-03-20", amount: 1 }].sort((x, y) => x.date.localeCompare(y.date));
    const f = fairValueByYield(special, closes(() => 50), 50, "2026-10-01")!;
    // In den 12 Monaten nach der Sonderzahlung 3 statt 2 je Aktie → 6 %
    expect(f.maxYield).toBeCloseTo(0.06);
  });

  it("kein Wert bei zu kurzer Historie oder ohne aktuelle Dividende", () => {
    expect(fairValueByYield(divs.filter((d) => d.date >= "2024-06"), closes(() => 50), 50, "2026-10-01")).toBeUndefined();
    expect(fairValueByYield(divs.filter((d) => d.date < "2024"), closes(() => 50), 50, "2026-10-01")).toBeUndefined();
    expect(fairValueByYield(divs, undefined, 50, "2026-10-01")).toBeUndefined();
  });
});

describe("DCF", () => {
  const a = { discountRate: 0.08, terminalGrowth: 0.02, maxGrowth: 0.1 };

  it("ohne Wachstum entspricht der Wert fast einer ewigen Rente", () => {
    // g = 0 in Jahr 1–5, Jahre 6–10 steigen auf 2 %: liegt zwischen 100/0,08 und 100/(0,08−0,02)
    const v = dcfPerShare(100, 0, { ...a, terminalGrowth: 0 }, 1);
    expect(v).toBeCloseTo(1250, 0);
    const w = dcfPerShare(100, 0, a, 1);
    expect(w).toBeGreaterThan(1250);
    expect(w).toBeLessThan(100 / 0.06);
  });

  const rows = (fcfs: number[]) => fcfs.map((f, i) => ({ date: `${2020 + i}-12-31`, freeCashFlow: f, totalRevenue: 1000 + i * 100 }));
  const mk = (fcfs: number[], over: Partial<MarketData> = {}) =>
    market({ annual: rows(fcfs), sharesOutstanding: 10, price: { value: 100, source: "t", asOf: "2026-10-01" }, ...over });

  it("Basis = Ø der letzten 3 Jahre, Wachstum aus FCF-CAGR der Durchschnitte", () => {
    const r = dcfValue(mk([100, 110, 121, 133.1, 146.41]), a);
    if ("unavailable" in r) throw new Error(r.unavailable);
    expect(r.baseFcf).toBeCloseTo((121 + 133.1 + 146.41) / 3);
    expect(r.growth).toBeCloseTo(0.1, 2);
    expect(r.value).toBeCloseTo(dcfPerShare(r.baseFcf, r.growth, a, 10));
    expect(r.low).toBeLessThan(r.value);
    expect(r.high).toBeGreaterThan(r.value);
  });

  it("rechnet das Wachstum je Aktie (Verwässerung durch neue Aktien)", () => {
    // FCF verdoppelt sich, die Aktienzahl auch → kein Wachstum je Aktie
    const annual = [100, 130, 160, 200].map((f, i) => ({ date: `${2021 + i}-12-31`, freeCashFlow: f, dilutedAverageShares: [10, 13, 16, 20][i] }));
    const r = dcfValue(market({ annual, sharesOutstanding: 20 }), a);
    if ("unavailable" in r) throw new Error(r.unavailable);
    expect(r.growth).toBeCloseTo(0);
    expect(r.growthBasis).toContain("je Aktie");
  });

  it("begrenzt Wachstum und weicht bei negativem Start-FCF auf den Umsatz aus", () => {
    const fast = dcfValue(mk([50, 100, 200, 400, 800]), a);
    expect("unavailable" in fast ? 0 : fast.growth).toBe(0.1);
    const neg = dcfValue(mk([-150, 100, 120, 130, 140]), a);
    if ("unavailable" in neg) throw new Error(neg.unavailable);
    expect(neg.growthBasis).toContain("Umsatz");
  });

  it("ein Ausreißer im letzten Jahr kippt das Wachstum nicht", () => {
    // Einzeljahre: 100 → 130 in 5 Jahren = 5,4 % p. a.; Ø 2020–2022 (100) gegenüber Ø 2023–2025 (110) über 3 Jahre = 3,2 %
    const r = dcfValue(mk([100, 100, 100, 100, 100, 130]), a);
    if ("unavailable" in r) throw new Error(r.unavailable);
    expect(r.growth).toBeCloseTo(Math.pow(1.1, 1 / 3) - 1, 4);
    expect(r.growthBasis).toContain("Ø 2020–2022 gegenüber Ø 2023–2025");
  });

  it("kein Wert ohne Aktienzahl, bei zu kurzer Historie oder negativem FCF", () => {
    expect("unavailable" in dcfValue(mk([1, 2, 3], { sharesOutstanding: undefined }), a)).toBe(true);
    expect("unavailable" in dcfValue(mk([1, 2]), a)).toBe(true);
    expect("unavailable" in dcfValue(mk([-10, -20, 5]), a)).toBe(true);
    expect("unavailable" in dcfValue(mk([100, 110, 121], { sector: "Financial Services" }), a)).toBe(true);
  });
});

describe("smoothedGrowth", () => {
  it("vergleicht bei 4 und 5 Jahren je 2 Jahre, bei 3 Jahren die Einzeljahre", () => {
    const mk = (v: number[]) => v.map((value, i) => ({ date: `${2020 + i}-12-31`, value }));
    expect(smoothedGrowth(mk([100, 100, 121, 121]))!.growth).toBeCloseTo(0.1, 2);
    expect(smoothedGrowth(mk([100, 999, 121]))!.growth).toBeCloseTo(0.1, 2);
    expect(smoothedGrowth(mk([100]))).toBeUndefined();
    // Aktienzahl in anderer Einheit (Millionen statt Stück) → ohne Aktienzahl rechnen
    const mixed = [100, 100, 121, 121].map((value, i) => ({ date: `${2020 + i}-12-31`, value, shares: i < 2 ? 750 : 750e6 }));
    const g = smoothedGrowth(mixed)!;
    expect(g.perShare).toBe(false);
    expect(g.growth).toBeCloseTo(0.1, 2);
  });
});

describe("recentFundamentals", () => {
  it("nur Perioden der letzten 3 Jahre, FCF aus Cashflow minus Investitionen", () => {
    const rows = [
      { date: "2022-12-31", dilutedEPS: 1 },
      { date: "2023-12-31", dilutedEPS: 2, operatingCashFlow: 10, capitalExpenditure: -4 },
      { date: "2025-12-31", dilutedEPS: 3, freeCashFlow: 7 },
      { date: "2026-06-30" },
    ];
    expect(recentFundamentals(rows, "2026-10-24")).toEqual([
      { date: "2023-12-31", eps: 2, fcf: 6 },
      { date: "2025-12-31", eps: 3, fcf: 7 },
    ]);
  });
});

