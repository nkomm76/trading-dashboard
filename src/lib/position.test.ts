import { describe, expect, it } from "vitest";
import { closedCycles, computePosition, type Tx } from "./position";

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

describe("closedCycles", () => {
  it("liefert abgeschlossene Zyklen mit Durchschnittskursen", () => {
    const c = closedCycles([buy("2024-01-01", 10, 100, 2), buy("2024-03-01", 10, 120, 2), sell("2025-01-01", 5, 150, 1), sell("2025-06-01", 15, 130, 1)]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ firstBuy: "2024-01-01", lastSell: "2025-06-01", boughtQuantity: 20, avgBuyPrice: 110, avgSellPrice: 135, costTrading: 2200, feesEur: 6 });
    expect(c[0].realizedTrading).toBe(5 * 40 + 15 * 20);
  });

  it("trennt einen Rückkauf nach Komplettverkauf in einen neuen Zyklus", () => {
    const txs = [buy("2024-01-01", 10, 100), sell("2024-06-01", 10, 110), buy("2025-01-01", 5, 90), sell("2025-03-01", 5, 80), buy("2025-09-01", 3, 70)];
    const c = closedCycles(txs);
    expect(c.map((x) => [x.firstBuy, x.lastSell, x.realizedTrading])).toEqual([
      ["2024-01-01", "2024-06-01", 100],
      ["2025-01-01", "2025-03-01", -50],
    ]);
  });

  it("liefert nichts für offene Positionen", () => {
    expect(closedCycles([buy("2024-01-01", 10, 100), sell("2024-06-01", 4, 110)])).toEqual([]);
  });
});
