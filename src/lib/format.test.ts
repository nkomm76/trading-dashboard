import { describe, expect, it } from "vitest";
import { fmtDate } from "./format";

describe("fmtDate", () => {
  it("zeigt reine Datumsangaben unabhängig von der Zeitzone am richtigen Tag", () => {
    expect(fmtDate("2026-10-23")).toBe("23.10.2026");
    expect(fmtDate("2026-10-23T00:00:00.000Z")).toBe("23.10.2026");
    expect(fmtDate(undefined)).toBe("–");
  });
});
