import { describe, expect, it } from "vitest";
import { fmtDate, localToday } from "./format";

describe("fmtDate", () => {
  it("zeigt reine Datumsangaben unabhängig von der Zeitzone am richtigen Tag", () => {
    expect(fmtDate("2026-10-23")).toBe("23.10.2026");
    expect(fmtDate("2026-10-23T00:00:00.000Z")).toBe("23.10.2026");
    expect(fmtDate(undefined)).toBe("–");
  });
});

describe("localToday", () => {
  it("nimmt den Kalendertag in Deutschland, nicht den UTC-Tag", () => {
    // 00:30 Uhr Sommerzeit in Berlin = 22:30 UTC des Vortags
    expect(localToday(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
    // 00:30 Uhr Winterzeit = 23:30 UTC
    expect(localToday(new Date("2026-11-06T23:30:00Z"))).toBe("2026-11-07");
    expect(localToday(new Date("2026-11-06T12:00:00Z"))).toBe("2026-11-06");
  });
});
