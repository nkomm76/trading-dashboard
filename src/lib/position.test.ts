import { describe, expect, it } from "vitest";
import { computePosition, type Tx } from "./position";

const buy = (date: string, quantity: number, price: number, fees = 0): Tx => ({ type: "BUY", date, quantity, price, fees });
const sell = (date: string, quantity: number, price: number, fees = 0): Tx => ({ type: "SELL", date, quantity, price, fees });

describe("computePosition", () => {
  it("bildet den Durchschnittskurs aus mehreren Käufen", () => {
    const p = computePosition([buy("2025-01-01", 10, 100, 5), buy("2025-06-01", 10, 120, 5)]);
    expect(p.quantity).toBe(20);
    expect(p.avgCost).toBe(110);
    expect(p.openFeesEur).toBe(10);
  });

  it("verbucht Teilverkäufe zum Durchschnittskurs", () => {
    const p = computePosition([buy("2025-01-01", 10, 100, 4), buy("2025-06-01", 10, 120, 4), sell("2026-01-01", 5, 150, 3)]);
    expect(p.quantity).toBe(15);
    expect(p.avgCost).toBe(110); // Ø bleibt beim Verkauf gleich
    expect(p.realizedTrading).toBe((150 - 110) * 5);
    expect(p.realizedFeesEur).toBeCloseTo(8 * 0.25 + 3);
    expect(p.openFeesEur).toBeCloseTo(6);
  });

  it("schließt die Position beim Komplettverkauf", () => {
    const p = computePosition([buy("2025-01-01", 10, 100), sell("2026-01-01", 10, 90)]);
    expect(p.quantity).toBe(0);
    expect(p.avgCost).toBe(0);
    expect(p.realizedTrading).toBe(-100);
    expect(p.soldQuantity).toBe(10);
    expect(p.oversold).toBeUndefined();
  });

  it("erkennt Verkäufe über den Bestand hinaus", () => {
    expect(computePosition([buy("2025-01-01", 5, 100), sell("2025-02-01", 8, 100)]).oversold).toEqual({ date: "2025-02-01", missing: 3 });
    // Verkauf vor dem Kauf
    expect(computePosition([sell("2025-01-01", 1, 100), buy("2025-02-01", 5, 100)]).oversold?.date).toBe("2025-01-01");
  });

  it("verbucht am selben Tag den Kauf vor dem Verkauf", () => {
    expect(computePosition([sell("2025-01-01", 5, 110), buy("2025-01-01", 5, 100)]).oversold).toBeUndefined();
  });
});
