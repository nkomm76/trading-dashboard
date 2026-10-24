import { describe, expect, it } from "vitest";
import { quarterlyFromYtd } from "./data/sec-quarters";

describe("quarterlyFromYtd", () => {
  it("zerlegt kumulierte Cashflows in Quartale, auch Q4 aus dem Jahreswert", () => {
    const f = (start: string, end: string, val: number, form = "10-Q") => ({ start, end, val, form });
    const q = quarterlyFromYtd([
      f("2025-01-01", "2025-03-31", 10),
      f("2025-01-01", "2025-06-30", 25),
      f("2025-01-01", "2025-09-30", 45),
      f("2025-01-01", "2025-12-31", 70, "10-K"),
      f("2025-01-01", "2025-06-30", 25), // Wiederholung in späterem Bericht
    ]);
    expect([...q.entries()]).toEqual([
      ["2025-03-31", 10],
      ["2025-06-30", 15],
      ["2025-09-30", 20],
      ["2025-12-31", 25],
    ]);
  });

  it("überspringt Schritte, wenn ein Quartal fehlt", () => {
    const q = quarterlyFromYtd([
      { start: "2025-01-01", end: "2025-03-31", val: 10, form: "10-Q" },
      { start: "2025-01-01", end: "2025-09-30", val: 45, form: "10-Q" },
    ]);
    expect([...q.keys()]).toEqual(["2025-03-31"]);
  });
});
