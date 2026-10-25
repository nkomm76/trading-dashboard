import { describe, expect, it } from "vitest";
import type { CheckResult } from "./check";
import { toEurView } from "./check-eur";

const now = Date.parse("2026-10-01");
// Dollar: 1,00 bis Ende 2024, danach 1,25 je Euro
const usd = (v: number, t: number) => (t < Date.parse("2025-01-01") ? v : v / 1.25);

const base: CheckResult = {
  symbol: "X",
  name: "X Corp",
  currency: "USD",
  financialCurrency: "USD",
  price: { value: 125, asOf: "2026-10-01" },
  schedule: { last: { date: "2026-08-01", amount: 1.25 } },
  fairValue: { value: 100, dividend: 5, dividendBasis: "", avgYield: 0.05, minYield: 0.04, maxYield: 0.06, from: "", to: "", months: 60, deviation: 0.25, notes: [] },
  dcf: { unavailable: "nicht berechnet" },
  peFair: { value: 150, eps: 6, pe: 25, minPe: 20, maxPe: 30, months: 60, from: "", to: "", deviation: -1 / 6, points: [{ date: "2024-12-31", eps: 5 }, { date: "2025-12-31", eps: 6 }], notes: [], epsBasis: "" },
  dividendsByYear: [],
  sources: [],
  fundamentals: { quarterly: [], annual: [{ date: "2024-12-31", eps: 5, fcf: 100 }] },
  items: [{ key: "dividends", title: "Dividende", light: "GREEN", verdict: "steigend", details: ["2024: 4,00"] }],
  overall: "GREEN",
  passed: 1,
};
const divs = [
  { date: "2024-05-01", amount: 4 },
  { date: "2025-05-01", amount: 5 },
];

describe("toEurView", () => {
  const r = toEurView(base, divs, usd, usd, now);

  it("rechnet Tageswerte zum heutigen Kurs um, Bewertungen bleiben gleich", () => {
    expect(r.currency).toBe("EUR");
    expect(r.nativeCurrency).toBe("USD");
    expect(r.price!.value).toBeCloseTo(100);
    expect(r.fairValue!.value).toBeCloseTo(80);
    expect(r.fairValue!.deviation).toBe(0.25);
    expect("unavailable" in r.peFair ? 0 : r.peFair.value).toBeCloseTo(120);
  });

  it("rechnet historische Beträge zum Kurs ihres Tages um", () => {
    expect(r.dividendsByYear).toEqual([
      { year: 2024, total: 4 },
      { year: 2025, total: 4 },
    ]);
    // Stichtage zu ihrem Kurs, dazu „heute“ zum heutigen Kurs (passt zum fairen Wert im Kopfbereich)
    expect("unavailable" in r.peFair ? [] : r.peFair.points.map((p) => p.eps)).toEqual([5, 4.8, 4.8]);
    expect(r.fundamentals.annual[0].fcf).toBe(100);
    expect(r.schedule!.last!.amount).toBeCloseTo(1);
  });

  it("lässt die Ampel-Kriterien in Originalwährung", () => {
    expect(r.items).toEqual(base.items);
  });

  it("ändert nichts, wenn schon alles in Euro ist", () => {
    const eur = { ...base, currency: "EUR", financialCurrency: "EUR" };
    expect(toEurView(eur, divs, usd, usd, now)).toBe(eur);
  });
});
