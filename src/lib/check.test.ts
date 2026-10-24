import { describe, expect, it } from "vitest";
import { checkDividends, checkGrowth, checkPayout, expectedYield, fairValueByYield } from "./check";
import type { MarketData } from "./data/types";

const yearly = (from: number, amounts: number[]) => amounts.map((a, i) => ({ date: `${from + i}-05-10`, amount: a }));

describe("checkDividends", () => {
  it("normiert Monatszahler mit 11 oder 13 Zahlungen im Kalenderjahr", () => {
    const divs = [];
    for (let i = 0; i < 84; i++) {
      const d = new Date(Date.UTC(2019, 0, 30 + i * 30.4));
      divs.push({ date: d.toISOString().slice(0, 10), amount: 0.2 + Math.floor(i / 12) * 0.01 });
    }
    expect(checkDividends(divs, 2026, "2026-01-15").light).toBe("GREEN");
  });

  it("grün bei steigender Dividende", () => {
    const r = checkDividends(yearly(2019, [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]), 2026);
    expect(r.light).toBe("GREEN");
    expect(r.verdict).toContain("steigend");
  });
  it("orange bei einer leichten Senkung, rot bei deutlicher Kürzung", () => {
    expect(checkDividends(yearly(2020, [1, 1, 1, 0.95, 1, 1]), 2026).light).toBe("ORANGE");
    expect(checkDividends(yearly(2020, [1, 1, 1, 0.5, 0.6, 0.7]), 2026).light).toBe("RED");
  });
  it("rot bei einem Jahr ohne Zahlung, grau bei zu kurzer Historie", () => {
    const gap = yearly(2019, [1, 1, 1, 1, 1, 1, 1]).filter((d) => !d.date.startsWith("2023"));
    expect(checkDividends(gap, 2026).light).toBe("RED");
    expect(checkDividends(yearly(2023, [1, 1, 1]), 2026).light).toBe("GREY");
  });
});

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

describe("checkPayout", () => {
  const divs = [{ date: "2026-05-01", amount: 3 }];
  it("bewertet die EPS-Quote", () => {
    expect(checkPayout(market({ dividends: divs, annual: [{ date: "2025-12-31", dilutedEPS: 5 }] })).light).toBe("GREEN");
    expect(checkPayout(market({ dividends: divs, annual: [{ date: "2025-12-31", dilutedEPS: 3.3 }] })).light).toBe("ORANGE");
    expect(checkPayout(market({ dividends: divs, annual: [{ date: "2025-12-31", dilutedEPS: 2 }] })).light).toBe("RED");
    expect(checkPayout(market({ dividends: divs, annual: [{ date: "2025-12-31", dilutedEPS: -1 }] })).light).toBe("RED");
  });
  it("grau ohne Gewinnangabe", () => {
    expect(checkPayout(market({ dividends: divs })).light).toBe("GREY");
  });
});

describe("checkGrowth", () => {
  const rows = (rev: number[], eps: number[]) => rev.map((r, i) => ({ date: `${2020 + i}-12-31`, totalRevenue: r, dilutedEPS: eps[i] }));
  it("grün bei Wachstum beider Kennzahlen", () => {
    const r = checkGrowth(rows([100, 110, 120, 130, 140, 150], [1, 1.1, 1.2, 1.3, 1.4, 1.5]));
    expect(r.light).toBe("GREEN");
    expect(r.details.join(" ")).toContain("2020 → 2025");
  });
  it("orange, wenn nur eine wächst; rot, wenn keine", () => {
    expect(checkGrowth(rows([100, 120], [2, 1])).light).toBe("ORANGE");
    expect(checkGrowth(rows([100, 90], [2, 1])).light).toBe("RED");
  });
  it("weist auf kurze Historie hin", () => {
    expect(checkGrowth(rows([100, 110, 120], [1, 1.1, 1.2])).details.join(" ")).toContain("nur 2 Jahre");
  });
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

  it("kein Wert bei zu kurzer Historie oder ohne aktuelle Dividende", () => {
    expect(fairValueByYield(divs.filter((d) => d.date >= "2024-06"), closes(() => 50), 50, "2026-10-01")).toBeUndefined();
    expect(fairValueByYield(divs.filter((d) => d.date < "2024"), closes(() => 50), 50, "2026-10-01")).toBeUndefined();
    expect(fairValueByYield(divs, undefined, 50, "2026-10-01")).toBeUndefined();
  });
});
