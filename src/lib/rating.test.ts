import { describe, expect, it } from "vitest";
import { rate } from "./rating";
import { dividendStatus, type Metrics } from "./metrics";

const s = <T,>(value: T, asOf = "2026-11-06") => ({ value, source: "Test", asOf });
const paying: Metrics = {
  dividendStatus: s("paying" as const),
  payoutEps: s(0.5),
  payoutFcf: s(0.6),
  debtToEquity: s(0.8),
  debtChangeYoY: s(0.02),
  dividendCagr5: s(0.07),
};
const trend = (price: number, ema200: number) => s({ price, ema200 });

describe("rate – ein Regelwerk für Depot, Aktien Check und Watchliste", () => {
  it("bewertet den Kurs zur EMA 200: grün darüber, orange bis 5 % darunter, rot darunter", () => {
    const light = (price: number) => rate({ ...paying, trend: trend(price, 100) }, undefined, undefined).reasons.find((r) => r.criterion === "Kurs zur EMA 200")!.light;
    expect(light(101)).toBe("GREEN");
    expect(light(100)).toBe("ORANGE");
    expect(light(95)).toBe("ORANGE"); // genau 5 % darunter, ohne Rundungsfehler
    expect(light(94.9)).toBe("RED");
    expect(rate({ ...paying, trend: trend(90, 100) }, undefined, undefined).light).toBe("RED");
  });

  it("nimmt die Orange-Grenze der EMA 200 aus den Einstellungen", () => {
    const r = rate({ ...paying, trend: trend(92, 100) }, undefined, undefined, { trendBelow: 0.1 } as never);
    expect(r.reasons.find((x) => x.criterion === "Kurs zur EMA 200")!.light).toBe("ORANGE");
  });

  it("lässt bei Aktien ohne Dividende die Dividendenkriterien weg, statt sie negativ zu werten", () => {
    const m: Metrics = { dividendStatus: s("none" as const), debtToEquity: s(0.5), debtChangeYoY: s(0.01), trend: trend(120, 100), dividendCagr5: s(-1), dividendCut: s(true) };
    const r = rate(m, undefined, undefined);
    expect(r.light).toBe("GREEN");
    expect(r.reasons.map((x) => x.criterion)).toEqual(["Dividende", "Debt to Equity", "Neuverschuldung (Vorjahr)", "Kurs zur EMA 200"]);
    expect(r.reasons[0].light).toBe("GREY");
  });

  it("wertet eine gerade eingestellte Dividende als rot", () => {
    const m: Metrics = { dividendStatus: s("suspended" as const), lastDividend: s({ date: "2025-05-10", amount: 1 }), debtToEquity: s(0.5), debtChangeYoY: s(0.01), trend: trend(120, 100) };
    const r = rate(m, undefined, undefined);
    expect(r.light).toBe("RED");
    expect(r.reasons[0].text).toContain("letzte am 10.05.2025");
  });

  it("zählt den Hinweis „keine Dividende“ nicht als Kriterium: zu wenig Daten bleibt grau", () => {
    const r = rate({ dividendStatus: s("none" as const), debtToEquity: s(0.5), trend: trend(120, 100) }, undefined, undefined);
    expect(r.light).toBe("GREY");
  });
});

describe("Anzeige an der Grenze", () => {
  it("zeigt eine Stelle mehr, wenn der Wert gerundet auf der Grenze liegt", () => {
    const r = rate({ ...paying, payoutEps: s(0.80031) }, undefined, undefined);
    expect(r.reasons[0]).toMatchObject({ light: "RED", text: expect.stringContaining("80,03 %") });
    expect(rate(paying, undefined, undefined).reasons[0].text.startsWith("50,0 %")).toBe(true);
  });
});

describe("dividendStatus", () => {
  it("unterscheidet zahlend, eingestellt und nie gezahlt", () => {
    expect(dividendStatus([{ date: "2026-03-01", amount: 1 }], "2026-11-06")).toBe("paying");
    expect(dividendStatus([{ date: "2024-06-01", amount: 1 }], "2026-11-06")).toBe("suspended");
    expect(dividendStatus([{ date: "2022-06-01", amount: 1 }], "2026-11-06")).toBe("none");
    expect(dividendStatus([], "2026-11-06")).toBe("none");
  });
});
