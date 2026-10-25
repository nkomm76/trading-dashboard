import { describe, expect, it } from "vitest";
import { epsAt, epsSeries, fairCurve, fairValueByPe } from "./fair-pe";

const monthly = (from: string, n: number, price: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(from));
    d.setUTCMonth(d.getUTCMonth() + i);
    return { date: d.toISOString().slice(0, 10), close: price(i) };
  });

describe("epsAt", () => {
  const pts = [
    { date: "2020-12-31", eps: 2 },
    { date: "2021-12-31", eps: 4 },
  ];
  it("interpoliert zwischen Geschäftsjahren, danach der letzte Wert", () => {
    expect(epsAt(pts, Date.parse("2021-07-02"))).toBeCloseTo(3, 1);
    expect(epsAt(pts, Date.parse("2020-12-31"))).toBe(2);
    expect(epsAt(pts, Date.parse("2023-01-01"))).toBe(4);
    expect(epsAt(pts, Date.parse("2020-06-30"))).toBeUndefined();
  });
  it("schwingt zwischen den Stützpunkten nicht über", () => {
    const zig = [
      { date: "2020-12-31", eps: 2 },
      { date: "2021-12-31", eps: 4 },
      { date: "2022-12-31", eps: 3 },
      { date: "2023-12-31", eps: 5 },
    ];
    for (let t = Date.parse("2020-12-31"); t <= Date.parse("2023-12-31"); t += 7 * 86_400_000) {
      const v = epsAt(zig, t)!;
      expect(v).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(v).toBeLessThanOrEqual(5 + 1e-9);
    }
    // Hoch- und Tiefpunkte liegen genau auf den Stützpunkten
    expect(epsAt(zig, Date.parse("2021-06-30"))!).toBeLessThanOrEqual(4);
    expect(epsAt(zig, Date.parse("2022-06-30"))!).toBeGreaterThanOrEqual(3);
  });

  it("kein fairer Wert bei Verlust", () => {
    expect(fairCurve([{ date: "2020-12-31", eps: -1 }], 20)(Date.parse("2021-01-01"))).toBeUndefined();
  });
});

describe("epsSeries", () => {
  const annual = [
    { date: "2024-12-31", dilutedEPS: 6 },
    { date: "2023-12-31", dilutedEPS: 3 },
    { date: "2022-12-31", dilutedEPS: 3 },
    { date: "2021-12-31" },
  ];
  it("glättet als Ø der letzten 3 Jahre und hängt ein neueres 12-Monats-EPS an", () => {
    expect(epsSeries(annual, { date: "2025-06-30", eps: 6 })).toEqual([
      { date: "2022-12-31", eps: 3 },
      { date: "2023-12-31", eps: 3 },
      { date: "2024-12-31", eps: 4 },
      // überschneidet sich mit 2024: Ø aus 2022, 2023 und den 12 Monaten
      { date: "2025-06-30", eps: 4 },
    ]);
  });
  it("lässt ein unpassendes oder zu nahes 12-Monats-EPS weg", () => {
    expect(epsSeries(annual, { date: "2025-06-30", eps: 50 })).toHaveLength(3);
    expect(epsSeries(annual, { date: "2025-01-15", eps: 6.1 })).toHaveLength(3);
  });
  it("nimmt nach einem Verlustjahr das neue 12-Monats-EPS", () => {
    const loss = [
      { date: "2023-12-31", dilutedEPS: 2 },
      { date: "2024-12-31", dilutedEPS: -1 },
    ];
    expect(epsSeries(loss, { date: "2025-06-30", eps: 1.5 }, 1).at(-1)).toEqual({ date: "2025-06-30", eps: 1.5 });
  });

  it("ohne Glättung die Rohwerte", () => {
    expect(epsSeries(annual, undefined, 1).map((p) => p.eps)).toEqual([3, 3, 6]);
  });
});

describe("fairValueByPe", () => {
  // Gewinn wächst von 2 auf 3, Kurs immer 20 × Gewinn → Ø-KGV 20
  const pts = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y, i) => ({ date: `${y}-12-31`, eps: 2 + i / 6 }));
  const closes = monthly("2020-11-30", 60, (i) => 20 * (epsAt(pts, Date.parse(monthly("2020-11-30", 60, () => 0)[i].date)) ?? 0));

  it("fairer Wert = aktueller Gewinn × Ø-KGV", () => {
    const f = fairValueByPe(pts, closes, 45, "2025-11-15");
    if ("unavailable" in f) throw new Error(f.unavailable);
    expect(f.pe).toBeCloseTo(20);
    expect(f.value).toBeCloseTo(60);
    expect(f.deviation).toBeCloseTo(-0.25);
  });

  it("zählt Monate ohne Gewinndaten nicht als Verlustmonate", () => {
    // Gewinnreihe erst ab Ende 2021: die Monate davor fehlen, sind aber kein Verlust
    const late = pts.filter((p) => p.date >= "2021");
    const f = fairValueByPe(late, closes, 45, "2025-11-15");
    if ("unavailable" in f) throw new Error(f.unavailable);
    expect(f.notes.some((n) => n.includes("ohne Gewinn"))).toBe(false);
    expect(f.notes.some((n) => n.includes("Jahre für das Ø-KGV"))).toBe(true);
  });

  it("kein Wert bei zu kurzer Historie oder aktuellem Verlust", () => {
    expect("unavailable" in fairValueByPe(pts, closes.slice(-20), 45, "2025-11-15")).toBe(true);
    expect("unavailable" in fairValueByPe([...pts, { date: "2026-06-30", eps: -1 }], closes, 45, "2026-07-15")).toBe(true);
  });
});
