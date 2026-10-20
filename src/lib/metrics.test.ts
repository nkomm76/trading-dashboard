import { describe, expect, it } from "vitest";
import { computeMetrics, detectDividendCut, detectFrequency, dividendCagr, ttmSum } from "./metrics";
import { rate } from "./rating";
import type { MarketData } from "./data/types";

const quarterlyDivs = (fromYear: number, toYear: number, start: number, growth: number) => {
  const out = [];
  for (let y = fromYear; y <= toYear; y++)
    for (const m of ["02", "05", "08", "11"]) out.push({ date: `${y}-${m}-15`, amount: start * Math.pow(1 + growth, y - fromYear) });
  return out;
};

describe("Dividenden", () => {
  it("berechnet CAGR über abgeschlossene Jahre", () => {
    const divs = quarterlyDivs(2015, 2026, 1, 0.06);
    expect(dividendCagr(divs, 5, "2026-10-20")).toBeCloseTo(0.06, 6);
    expect(dividendCagr(divs, 10, "2026-10-20")).toBeCloseTo(0.06, 6);
  });

  it("liefert keinen CAGR ohne vollständige Historie", () => {
    expect(dividendCagr(quarterlyDivs(2023, 2026, 1, 0.05), 5, "2026-10-20")).toBeUndefined();
  });

  it("erkennt den Ausschüttungsrhythmus", () => {
    expect(detectFrequency(quarterlyDivs(2024, 2026, 1, 0), "2026-12-01")).toBe("quartalsweise");
    expect(detectFrequency([{ date: "2025-05-08", amount: 15 }, { date: "2026-05-08", amount: 17 }], "2026-10-20")).toBe("jährlich");
    const monthly = Array.from({ length: 24 }, (_, i) => ({ date: new Date(Date.UTC(2024, 10 + i, 15)).toISOString().slice(0, 10), amount: 0.27 }));
    expect(detectFrequency(monthly, "2026-10-20")).toBe("monatlich");
    expect(detectFrequency([], "2026-10-20")).toBeUndefined();
  });

  it("erkennt Kürzungen gegenüber der Vorjahreszahlung", () => {
    const divs = quarterlyDivs(2024, 2025, 1, 0);
    expect(detectDividendCut(divs, "quartalsweise")).toBe(false);
    divs[divs.length - 1] = { ...divs[divs.length - 1], amount: 0.5 };
    expect(detectDividendCut(divs, "quartalsweise")).toBe(true);
  });
});

describe("TTM", () => {
  it("summiert nur lückenlose Quartale", () => {
    const rows = ["2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30"].map((date) => ({ date, dilutedEPS: 1 }));
    expect(ttmSum(rows, "dilutedEPS")?.value).toBe(4);
    expect(ttmSum([rows[0], rows[1], rows[3], { date: "2026-09-30", dilutedEPS: 1 }], "dilutedEPS")).toBeUndefined();
  });
});

const market = (over: Partial<MarketData> = {}): MarketData => ({
  symbol: "TEST",
  name: "Test AG",
  currency: "EUR",
  financialCurrency: "EUR",
  price: { value: 100, source: "Yahoo Finance", asOf: "2026-10-19" },
  dividends: quarterlyDivs(2015, 2026, 0.5, 0.06).filter((d) => d.date < "2026-10-20"),
  quarterly: [
    { date: "2025-06-30", dilutedEPS: 2, totalDebt: 900, stockholdersEquity: 1000, operatingCashFlow: 300, capitalExpenditure: -100, cashDividendsPaid: -80 },
    { date: "2025-09-30", dilutedEPS: 2, operatingCashFlow: 300, capitalExpenditure: -100, cashDividendsPaid: -80 },
    { date: "2025-12-31", dilutedEPS: 2, operatingCashFlow: 300, capitalExpenditure: -100, cashDividendsPaid: -80 },
    { date: "2026-03-31", dilutedEPS: 2, totalDebt: 950, stockholdersEquity: 1000, operatingCashFlow: 300, capitalExpenditure: -100, cashDividendsPaid: -80 },
    { date: "2026-06-30", dilutedEPS: 2.4, totalDebt: 1000, stockholdersEquity: 1000, operatingCashFlow: 300, capitalExpenditure: -100, cashDividendsPaid: -80 },
  ],
  annual: [],
  fetchedAt: "2026-10-20T00:00:00Z",
  ...over,
});

describe("computeMetrics", () => {
  it("berechnet Kennzahlen mit Quelle", () => {
    const m = computeMetrics({ market: market(), avgCost: 80, asOf: "2026-10-20" });
    expect(m.epsTTM?.value).toBeCloseTo(8.4);
    expect(m.payoutEps?.value).toBeCloseTo((m.dividendTTM!.value) / 8.4);
    expect(m.yieldOnCost?.value).toBeCloseTo(m.dividendTTM!.value / 80);
    expect(m.fcfTTM?.value).toBe(800);
    expect(m.payoutFcf?.value).toBeCloseTo(320 / 800);
    expect(m.debtToEquity?.value).toBe(1);
    expect(m.debtChangeQoQ?.value).toBeCloseTo(50 / 950);
    expect(m.debtChangeYoY?.value).toBeCloseTo(100 / 900);
    expect(m.epsLatestYoY?.value).toBeCloseTo(0.2);
    expect(m.frequency?.value).toBe("quartalsweise");
    expect(m.latestPeriod).toBe("2026-06-30");
  });

  it("lässt Werte ohne Quelle leer", () => {
    const m = computeMetrics({ market: market({ quarterly: [], annual: [], dividends: [], price: undefined }), asOf: "2026-10-20" });
    expect(m.price).toBeUndefined();
    expect(m.dividendYield).toBeUndefined();
    expect(m.payoutEps).toBeUndefined();
    expect(m.debtToEquity).toBeUndefined();
    expect(m.fcfTTM).toBeUndefined();
  });

  it("rechnet EPS in die Handelswährung um, bevor der Payout berechnet wird", () => {
    const m = computeMetrics({
      market: market({ currency: "EUR", financialCurrency: "USD" }),
      toTradingCurrency: (v) => v / 2,
      asOf: "2026-10-20",
    });
    expect(m.payoutEps?.value).toBeCloseTo(m.dividendTTM!.value / 4.2);
    const noFx = computeMetrics({ market: market({ currency: "EUR", financialCurrency: "USD" }), asOf: "2026-10-20" });
    expect(noFx.payoutEps).toBeUndefined();
  });
});

describe("Ampel", () => {
  const base = computeMetrics({ market: market(), avgCost: 80, asOf: "2026-10-20" });

  it("nimmt die schlechteste Einzelbewertung", () => {
    const r = rate(base, undefined, undefined);
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
    expect(r.light).toBe("ORANGE"); // D/E = 1,0 liegt im orangen Band, Neuverschuldung 11 %
  });

  it("wird rot bei gesenkter Prognose", () => {
    expect(rate(base, undefined, { status: "LOWERED", dividendCut: false, period: "2026-06-30" }).light).toBe("RED");
  });

  it("vergibt Grau bei zu wenig Daten", () => {
    expect(rate({ payoutEps: base.payoutEps }, undefined, undefined).light).toBe("GREY");
  });
});
