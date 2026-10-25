import { describe, expect, it } from "vitest";
import { matchListings, nameTokens, parseProfile } from "./data/listing-match";

const hit = (symbol: string, name: string, exchange?: string) => ({ symbol, name, exchange, type: "EQUITY" });

describe("parseProfile", () => {
  it("liest Name und Kürzel, ohne Namen gilt die ISIN als unbekannt", () => {
    expect(parseProfile({ name: " Unilever ", ticker: "ULVR", country: "GB" }, "GB00BVZK7T90")).toEqual({ isin: "GB00BVZK7T90", name: "Unilever", ticker: "ULVR" });
    expect(parseProfile({ name: "Unilever", ticker: "" }, "GB00BVZK7T90")?.ticker).toBeUndefined();
    expect(parseProfile({ error: "not found" }, "GB00BVZK7T90")).toBeUndefined();
    expect(parseProfile(null, "GB00BVZK7T90")).toBeUndefined();
  });
});

describe("nameTokens", () => {
  it("ignoriert Rechtsform, Satzzeichen und Akzente", () => {
    expect(nameTokens("British American Tobacco p.l.c.")).toEqual(["british", "american", "tobacco"]);
    expect(nameTokens("Nestlé S.A.")).toEqual(["nestle"]);
    expect(nameTokens("Allianz SE")).toEqual(["allianz"]);
  });
});

describe("matchListings", () => {
  const unilever = { isin: "GB00BVZK7T90", name: "Unilever PLC", ticker: "ULVR" };
  const yahoo = [
    hit("UL", "Unilever PLC", "NYSE"),
    hit("UNVR.JK", "PT Unilever Indonesia Tbk", "Jakarta"),
    hit("HINDUNILVR.NS", "Hindustan Unilever Limited", "NSE"),
    hit("ULVR.L", "Unilever PLC", "London"),
    hit("UNA.AS", "Unilever PLC", "Amsterdam"),
    hit("ULVR.L", "Unilever PLC", "London"), // doppelt aus der Suche per Kürzel
  ];

  it("behält nur Notierungen mit gleichem Kürzel oder gleichem Namen", () => {
    const m = matchListings(unilever, yahoo).map((h) => h.symbol);
    expect(m).not.toContain("UNVR.JK");
    expect(m).not.toContain("HINDUNILVR.NS");
    expect(m).toEqual(["ULVR.L", "UNA.AS", "UL"]);
  });

  it("stellt bei Nicht-US-ISINs US-Notierungen (ADRs) nach hinten, bei US-ISINs nicht", () => {
    const jnj = { isin: "US4781601046", name: "Johnson & Johnson", ticker: "JNJ" };
    const m = matchListings(jnj, [hit("JNJ.DE", "Johnson & Johnson"), hit("JNJ", "Johnson & Johnson")]).map((h) => h.symbol);
    expect(m).toEqual(["JNJ.DE", "JNJ"]);
    expect(matchListings(unilever, [hit("UL", "Unilever PLC"), hit("UNA.AS", "Unilever PLC")])[0].symbol).toBe("UNA.AS");
  });

  it("vergleicht Kürzel ohne Bindestrich und Leerzeichen", () => {
    const novo = { isin: "DK0062498333", name: "Novo Nordisk", ticker: "NOVO B" };
    expect(matchListings(novo, [hit("NOVO-B.CO", "Novo Nordisk A/S")]).map((h) => h.symbol)).toEqual(["NOVO-B.CO"]);
  });

  it("liefert nichts, wenn weder Kürzel noch Name passen", () => {
    expect(matchListings({ isin: "DE0000000000", name: "Beispiel AG" }, [hit("BSP.DE", "Anderes Beispiel AG")])).toEqual([]);
  });
});
