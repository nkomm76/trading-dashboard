import { describe, expect, it } from "vitest";
import { mapLimit } from "./watchlist";

describe("mapLimit", () => {
  it("behält die Reihenfolge und begrenzt gleichzeitige Aufrufe", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (x) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, x));
      running--;
      return x * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });

  it("kommt mit einer leeren Liste aus", async () => {
    expect(await mapLimit([], 3, async (x) => x)).toEqual([]);
  });
});
