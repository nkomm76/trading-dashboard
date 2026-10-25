import { describe, expect, it } from "vitest";
import { ema, valueAt } from "./ema";

const pts = (closes: number[]) => closes.map((close, i) => ({ time: i * 10, close }));

describe("ema", () => {
  it("startet mit dem einfachen Durchschnitt und gewichtet danach mit 2/(n+1)", () => {
    const line = ema(pts([1, 2, 3, 4]), 3);
    expect(line).toHaveLength(2);
    expect(line[0]).toEqual({ time: 20, value: 2 });
    expect(line[1].value).toBeCloseTo(4 * 0.5 + 2 * 0.5);
  });

  it("liefert nichts bei zu kurzer Historie", () => {
    expect(ema(pts([1, 2]), 3)).toEqual([]);
  });

  it("bleibt bei konstantem Kurs konstant", () => {
    expect(ema(pts(Array(50).fill(7)), 20).every((p) => p.value === 7)).toBe(true);
  });
});

describe("valueAt", () => {
  const line = [
    { time: 0, value: 10 },
    { time: 10, value: 20 },
    { time: 20, value: 40 },
  ];
  it("interpoliert zwischen Stützpunkten", () => {
    expect(valueAt(line, 5)).toBe(15);
    expect(valueAt(line, 15)).toBe(30);
    expect(valueAt(line, 10)).toBe(20);
  });
  it("vor dem Beginn keiner, danach der letzte Wert", () => {
    expect(valueAt(line, -1)).toBeUndefined();
    expect(valueAt(line, 99)).toBe(40);
    expect(valueAt([], 5)).toBeUndefined();
  });
});
