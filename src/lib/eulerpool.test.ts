import { describe, expect, it } from "vitest";
import { extendHistory, fiscalYear, normalizeEulerpool } from "./data/eulerpool-normalize";

describe("normalizeEulerpool", () => {
  const income = [
    { period: "2024-12-29", revenue: 88821, diluted_eps: 5.8, shares: 2427.1 },
    { period: "2022-01-01", revenue: 79990, diluted_eps: 6.73, shares: 2663.9 },
    { period: "2026-12-31e", revenue: 101214, diluted_eps: null, shares: null },
  ];
  const cashflow = [
    { period: "2024-12-29", netOperatingCashFlow: 24266, capex: -4424 },
    { period: "2022-01-02", netOperatingCashFlow: 21194, capex: -4009 },
  ];
  const rows = normalizeEulerpool(income, cashflow);

  it("verwirft Schätzungen, sortiert und rechnet Millionen um", () => {
    expect(rows.map((r) => r.date)).toEqual(["2022-01-01", "2024-12-29"]);
    expect(rows[1].totalRevenue).toBe(88_821e6);
    expect(rows[1].dilutedAverageShares).toBeCloseTo(2_427.1e6);
    expect(rows[1].capitalExpenditure).toBe(-4_424e6);
  });

  it("ordnet Cashflow und GuV über das Geschäftsjahr zu, auch bei abweichendem Stichtag", () => {
    expect(fiscalYear("2022-01-01")).toBe(2021);
    expect(rows[0].operatingCashFlow).toBe(21_194e6);
  });

  it("verträgt unerwartete Antworten", () => {
    expect(normalizeEulerpool({ error: "x" }, null)).toEqual([]);
  });
});

describe("extendHistory", () => {
  const y = (year: number, revenue: number, ocf?: number) => ({ date: `${year}-12-31`, totalRevenue: revenue, operatingCashFlow: ocf });
  const base = [y(2022, 100, 20), y(2023, 110, 22), y(2024, 120, 24), y(2025, 130, 26)];

  it("ergänzt nur ältere Jahre, wenn die gemeinsamen Jahre passen", () => {
    const extra = [y(2019, 80, 15), y(2020, 85, 16), y(2021, 90, 18), y(2022, 102, 21), y(2025, 999, 99)].slice(0, 4);
    const r = extendHistory(base, extra);
    expect(r.addedYears).toEqual([2020, 2021]);
    expect(r.rows.map((x) => x.date.slice(0, 4))).toEqual(["2020", "2021", "2022", "2023", "2024", "2025"]);
    expect(r.rows.find((x) => x.date.startsWith("2022"))!.totalRevenue).toBe(100); // Hauptquelle bleibt
  });

  it("übernimmt nur so viele Jahre, wie ins 5-Jahres-Fenster passen", () => {
    const extra = [2015, 2016, 2017, 2018, 2019, 2020, 2021].map((yr) => y(yr, 50 + yr - 2015)).concat([y(2022, 100)]);
    expect(extendHistory(base, extra).addedYears).toEqual([2020, 2021]);
  });

  it("verwirft Eulerpool bei Abweichung über 10 % (z. B. andere Währung)", () => {
    const r = extendHistory(base, [y(2020, 85), y(2023, 125)]);
    expect(r.addedYears).toEqual([]);
    expect(r.rejected).toContain("Umsatz 2023");
    expect(r.rows).toBe(base);
  });

  it("verwirft bei abweichendem Cashflow und ohne gemeinsame Jahre", () => {
    expect(extendHistory(base, [y(2020, 85, 10), y(2024, 121, 30)]).rejected).toContain("Cashflow 2024");
    expect(extendHistory(base, [y(2018, 70)]).rejected).toContain("keine gemeinsamen Jahre");
  });
});
