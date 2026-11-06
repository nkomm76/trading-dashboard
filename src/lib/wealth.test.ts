import { describe, expect, it } from "vitest";
import { assetClassFromQuoteType, concentrations, groupSlices, holdingPeriod, oneYearAfter, openLotsFifo, targetDeviation, wealthHistory } from "./wealth";
import type { Tx } from "./position";

const buy = (date: string, quantity: number, price = 100): Tx => ({ type: "BUY", date, quantity, price, fees: 0 });
const sell = (date: string, quantity: number, price = 100): Tx => ({ type: "SELL", date, quantity, price, fees: 0 });
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);

describe("assetClassFromQuoteType", () => {
  it("ordnet Yahoo-Typen zu", () => {
    expect(assetClassFromQuoteType("ETF")).toBe("ETF");
    expect(assetClassFromQuoteType("MUTUALFUND")).toBe("ETF");
    expect(assetClassFromQuoteType("CRYPTOCURRENCY")).toBe("CRYPTO");
    expect(assetClassFromQuoteType("EQUITY")).toBe("STOCK");
    expect(assetClassFromQuoteType(undefined)).toBe("STOCK");
  });
});

describe("Haltedauer", () => {
  it("verbraucht beim Verkauf die ältesten Käufe zuerst", () => {
    expect(openLotsFifo([buy("2025-01-10", 0.5), buy("2025-06-01", 0.3), sell("2025-07-01", 0.6)])).toEqual([{ date: "2025-06-01", quantity: expect.closeTo(0.2, 9) }]);
  });

  it("zählt einen Kauf erst ab dem Tag nach dem Jahrestag als über ein Jahr gehalten", () => {
    expect(oneYearAfter("2025-03-15")).toBe("2026-03-16");
    expect(oneYearAfter("2024-02-29")).toBe("2025-03-01");
    const h = holdingPeriod([buy("2025-03-15", 0.1), buy("2026-01-05", 0.02)], "2026-03-16");
    expect(h.overYear).toBeCloseTo(0.1, 9);
    expect(h.underYear).toBeCloseTo(0.02, 9);
    expect(h.next).toEqual({ date: "2027-01-06", quantity: 0.02 });
    expect(holdingPeriod([buy("2025-03-15", 0.1)], "2026-03-15").overYear).toBe(0);
  });
});

describe("Aufteilung", () => {
  it("fasst gleiche Schlüssel zusammen und lässt leere Werte weg", () => {
    const s = groupSlices([
      { key: "Tech", label: "Tech", value: 300 },
      { key: "Bar", label: "Barbestand", value: 0 },
      { key: "Tech", label: "Tech", value: 100 },
      { key: "ETF", label: "ETF", value: 600 },
    ]);
    expect(s.map((x) => [x.key, x.value, x.share])).toEqual([["ETF", 600, 0.6], ["Tech", 400, 0.4]]);
  });

  it("rechnet die Abweichung vom Ziel in Prozentpunkten und Euro", () => {
    const d = targetDeviation({ STOCK: 5000, ETF: 3000, CRYPTO: 500, CASH: 1500 }, { STOCK: 0.5, ETF: 0.3, CRYPTO: 0.1, CASH: 0.1 });
    const cash = d.find((x) => x.bucket === "CASH")!;
    expect(cash.actual).toBeCloseTo(0.15);
    expect(cash.diffEur).toBeCloseTo(500);
    expect(d.find((x) => x.bucket === "CRYPTO")!.diffEur).toBeCloseTo(-500);
  });

  it("meldet nur Positionen über der Klumpen-Grenze", () => {
    const c = concentrations([{ valueEur: 1500 }, { valueEur: 900 }, { valueEur: undefined }], 10_000, 0.1);
    expect(c).toEqual([{ valueEur: 1500, share: 0.15 }]);
  });
});

describe("wealthHistory", () => {
  it("bewertet den Bestand je Tag mit dem letzten Kurs und zählt den Kontostand ab seinem Eintrag", () => {
    const h = wealthHistory(
      [{ txs: [buy("2026-01-02", 10, 100), sell("2026-01-06", 4, 120)], closes: [{ time: t("2026-01-02"), close: 100 }, { time: t("2026-01-05"), close: 110 }, { time: t("2026-01-07"), close: 120 }] }],
      [{ date: "2026-01-05", amount: 1000 }],
      "2026-01-08",
    );
    expect(h.map((p) => p.date)).toEqual(["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]);
    expect(h[0]).toEqual({ date: "2026-01-02", securities: 1000, byClass: { STOCK: 1000, ETF: 0, CRYPTO: 0 }, cost: 1000, cash: undefined, total: 1000 });
    expect(h[1]).toMatchObject({ securities: 1100, cash: 1000, total: 2100 });
    expect(h[2]).toMatchObject({ securities: 660, cost: 600 }); // 6 Stück zum Kurs vom 05.01.
    expect(h[4]).toMatchObject({ securities: 720, total: 1720 });
  });

  it("teilt den Wert nach Anlageklassen auf", () => {
    const h = wealthHistory(
      [
        { assetClass: "ETF", txs: [buy("2026-01-02", 10, 100)], closes: [{ time: t("2026-01-02"), close: 110 }] },
        { assetClass: "CRYPTO", txs: [buy("2026-01-02", 0.5, 1000)], closes: [{ time: t("2026-01-02"), close: 900 }] },
        { txs: [buy("2026-01-02", 2, 50)], closes: [] }, // ohne Kurs: zum Einstand, ohne Klasse als Aktie
      ],
      [],
      "2026-01-02",
    );
    expect(h[0].byClass).toEqual({ STOCK: 100, ETF: 1100, CRYPTO: 450 });
    expect(h[0].securities).toBe(1650);
  });

  it("liefert nichts ohne Buchungen und Kontostände", () => {
    expect(wealthHistory([], [], "2026-01-01")).toEqual([]);
  });
});
