// Ein Wert mit Herkunft. Fehlt die Quelle, gibt es keinen Wert – es wird nichts geschätzt.
export type Sourced<T = number> = {
  value: T;
  source: string; // z. B. "Yahoo Finance", "SEC EDGAR", "EZB", "berechnet"
  asOf: string; // ISO-Datum des Datenstands
  period?: "Quartal" | "Halbjahr" | "Jahr" | "TTM";
  note?: string;
};

export type DividendPayment = { date: string; amount: number };

export type PricePoint = { date: string; close: number };

export type StatementRow = {
  date: string; // Periodenende
  dilutedEPS?: number;
  operatingCashFlow?: number;
  capitalExpenditure?: number; // negativ
  freeCashFlow?: number;
  totalDebt?: number;
  stockholdersEquity?: number;
  cashDividendsPaid?: number; // negativ
  totalRevenue?: number;
  dilutedAverageShares?: number;
};

export type MarketData = {
  symbol: string;
  name: string;
  currency: string; // Handelswährung (kann "GBp" sein)
  quoteType?: string; // Yahoo-Typ: EQUITY, ETF, CRYPTOCURRENCY …
  financialCurrency?: string; // Berichtswährung der Bilanz
  exchange?: string;
  sector?: string;
  price?: Sourced;
  epsTTM?: Sourced;
  sharesOutstanding?: number;
  nextExDividend?: Sourced<string>;
  dividends: DividendPayment[];
  /** Monatsschlusskurse (split-bereinigt) für Bewertungen über mehrere Jahre */
  monthlyCloses?: PricePoint[];
  quarterly: StatementRow[];
  annual: StatementRow[];
  fetchedAt: string;
};
