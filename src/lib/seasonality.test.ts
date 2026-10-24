import { describe, expect, it } from "vitest";
import { computeSeasonality, dayOfYear } from "./seasonality";

// Werktägliche Kurse: jedes Jahr im März +10 %, sonst unverändert
function series(fromYear: number, toYear: number, toDate = `${toYear}-12-31`) {
  const out = [];
  let price = 100;
  for (let t = Date.UTC(fromYear, 0, 1); ; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (date > toDate) break;
    const wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (date.slice(5) >= "03-01" && date.slice(5) <= "03-31") price *= 1.1 ** (1 / 22);
    out.push({ date, close: price });
  }
  return out;
}

describe("dayOfYear", () => {
  it("bezieht Tage auf ein Nicht-Schaltjahr", () => {
    expect(dayOfYear("2024-01-01")).toBe(1);
    expect(dayOfYear("2024-02-29")).toBe(59);
    expect(dayOfYear("2024-03-01")).toBe(60);
    expect(dayOfYear("2025-12-31")).toBe(365);
  });
});

describe("computeSeasonality", () => {
  const s = computeSeasonality(series(2015, 2026, "2026-06-30"), 10, 2026)!;

  it("nutzt nur volle Jahre mit Vorjahresbasis", () => {
    expect(s.years).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  });

  it("März ist im Schnitt der starke Monat", () => {
    const march = s.months.find((m) => m.month === 3)!;
    expect(march.avg).toBeGreaterThan(0.08);
    expect(march.positive).toBe(10);
    expect(Math.abs(s.months.find((m) => m.month === 7)!.avg)).toBeLessThan(1e-9);
  });

  it("Jahresverlauf: flach bis Februar, danach rund +10 %; laufendes Jahr endet am letzten Kurs", () => {
    expect(s.path[30].avg).toBeCloseTo(0);
    expect(s.path[200].avg).toBeGreaterThan(0.08);
    expect(s.path[150].current).toBeGreaterThan(0.08);
    expect(s.path[200].current).toBeUndefined();
  });

  it("Jahresende ist definiert, auch wenn der letzte Handelstag vor dem 31.12. liegt", () => {
    const pts = series(2015, 2026, "2026-06-30").filter((p) => p.date.slice(5) <= "12-29" || p.date >= "2026");
    const r = computeSeasonality(pts, 10, 2026)!;
    expect(r.path[364].avg).toBeGreaterThan(0.08);
    expect(r.years).toHaveLength(10);
  });

  it("zu wenig Jahre → kein Ergebnis", () => {
    expect(computeSeasonality(series(2024, 2026, "2026-03-01"), 10, 2026)).toBeUndefined();
  });
});
