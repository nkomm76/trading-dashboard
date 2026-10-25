import { describe, expect, it } from "vitest";
import { eurConverter } from "./fx-convert";

const day = (d: string) => Date.parse(d);
// 1 EUR = 1,00 USD am 1.1., 1,20 USD am 1.7.
const series = [
  { time: day("2025-01-01"), value: 1.0 },
  { time: day("2025-07-01"), value: 1.2 },
];

describe("eurConverter", () => {
  it("rechnet mit dem Kurs des jeweiligen Tages", () => {
    const toEur = eurConverter("USD", series)!;
    expect(toEur(120, day("2025-07-01"))).toBeCloseTo(100);
    expect(toEur(100, day("2025-01-01"))).toBeCloseTo(100);
    // vor Beginn der erste, danach der letzte Kurs
    expect(toEur(100, day("2024-06-01"))).toBeCloseTo(100);
    expect(toEur(120, day("2026-01-01"))).toBeCloseTo(100);
  });

  it("Euro bleibt Euro, Pence werden zu Pfund, ohne Reihe gilt der Ersatzkurs", () => {
    expect(eurConverter("EUR", undefined)!(50, 0)).toBe(50);
    expect(eurConverter("GBp", undefined, 0.8)!(1000, 0)).toBeCloseTo(12.5);
    expect(eurConverter("USD", undefined)).toBeUndefined();
  });
});
