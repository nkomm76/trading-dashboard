import { describe, expect, it } from "vitest";
import { suggestDividends } from "./dividends";
import type { Tx } from "./position";

const tx = (type: "BUY" | "SELL", date: string, quantity: number): Tx => ({ type, date, quantity, price: 100, fees: 0 });
const pay = (date: string, amount: number) => ({ date, amount });

describe("suggestDividends", () => {
  it("schlägt nur Zahlungen ab dem ersten Kauf vor, mit Bestand am Ex-Tag", () => {
    const s = suggestDividends([tx("BUY", "2025-03-01", 10), tx("BUY", "2025-07-01", 5)], [pay("2025-02-01", 1), pay("2025-05-01", 1), pay("2025-08-01", 1)], new Set(), "2026-01-01");
    expect(s.map((x) => [x.exDate, x.quantity, x.grossTrading])).toEqual([
      ["2025-08-01", 15, 15],
      ["2025-05-01", 10, 10],
    ]);
  });

  it("Kauf am Ex-Tag zählt nicht, Verkauf am Ex-Tag schon", () => {
    expect(suggestDividends([tx("BUY", "2025-05-01", 10)], [pay("2025-05-01", 1)], new Set(), "2026-01-01")).toHaveLength(0);
    const s = suggestDividends([tx("BUY", "2025-01-01", 10), tx("SELL", "2025-05-01", 10)], [pay("2025-05-01", 1), pay("2025-08-01", 1)], new Set(), "2026-01-01");
    expect(s.map((x) => x.exDate)).toEqual(["2025-05-01"]);
  });

  it("überspringt bereits erfasste oder ignorierte und künftige Zahlungen", () => {
    const s = suggestDividends([tx("BUY", "2025-01-01", 10)], [pay("2025-05-01", 1), pay("2025-08-01", 1), pay("2026-03-01", 1)], new Set(["2025-05-01"]), "2026-01-01");
    expect(s.map((x) => x.exDate)).toEqual(["2025-08-01"]);
  });
});
