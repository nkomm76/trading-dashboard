import type { CheckResult } from "./check";
import type { DividendPayment } from "./data/types";
import type { EpsPoint } from "./fair-pe";
import type { ToEur } from "./fx-convert";
import { annualTotals } from "./metrics";

// Euro-Ansicht eines Aktien Checks (ohne Netzwerk, testbar). Die Ampel-Kriterien bleiben in Originalwährung:
// Ob eine Dividende steigt oder ein Gewinn wächst, soll nicht vom Wechselkurs abhängen.

/**
 * Gewinnreihe in Euro: jeder Stichtag zu seinem Kurs, dazu ein Punkt „heute“ zum heutigen Kurs,
 * damit das Ende der Kurve im Chart zum heutigen fairen Wert im Kopfbereich passt.
 */
function eurPoints(points: EpsPoint[], trade: ToEur, now: number): EpsPoint[] {
  const out = points.map((p) => ({ date: p.date, eps: trade(p.eps, Date.parse(p.date)) }));
  const last = points.at(-1);
  const today = new Date(now).toISOString().slice(0, 10);
  if (last && last.date < today) out.push({ date: today, eps: trade(last.eps, now) });
  return out;
}

/**
 * Rechnet alle Beträge in Euro um – Tageswerte zum Kurs von heute, historische Werte (Dividenden, Gewinne je Periode)
 * zum Kurs ihres Tages. `trade` rechnet aus der Handelswährung, `fin` aus der Bilanzwährung um.
 */
export function toEurView(r: CheckResult, dividends: DividendPayment[], trade: ToEur, fin: ToEur, now = Date.now()): CheckResult {
  if (r.currency === "EUR" && (r.financialCurrency ?? "EUR") === "EUR") return r;
  const t = (d: string) => Date.parse(d);
  const today = (v: number) => trade(v, now);
  const year = new Date(now).getFullYear();
  const eurDividends = dividends.map((d) => ({ date: d.date, amount: trade(d.amount, t(d.date)) }));
  const fund = (rows: CheckResult["fundamentals"]["annual"]) =>
    rows.map((row) => ({ ...row, eps: row.eps === null ? null : fin(row.eps, t(row.date)), fcf: row.fcf === null ? null : fin(row.fcf, t(row.date)) }));

  return {
    ...r,
    currency: "EUR",
    financialCurrency: "EUR",
    nativeCurrency: r.currency,
    price: r.price && { ...r.price, value: today(r.price.value) },
    schedule: r.schedule && { ...r.schedule, last: r.schedule.last && { ...r.schedule.last, amount: trade(r.schedule.last.amount, t(r.schedule.last.date)) } },
    fairValue: r.fairValue && { ...r.fairValue, value: today(r.fairValue.value), dividend: today(r.fairValue.dividend) },
    dcf: r.dcf && ("unavailable" in r.dcf ? r.dcf : { ...r.dcf, value: today(r.dcf.value), low: today(r.dcf.low), high: today(r.dcf.high), baseFcf: fin(r.dcf.baseFcf, now) }),
    peFair:
      "unavailable" in r.peFair
        ? r.peFair
        : { ...r.peFair, value: today(r.peFair.value), eps: today(r.peFair.eps), points: eurPoints(r.peFair.points, trade, now) },
    // Jede Zahlung zum Kurs ihres Ex-Tags, so wie sie in Euro angekommen wäre
    dividendsByYear: [...annualTotals(eurDividends)].filter(([y]) => y < year && y >= year - 10).map(([y, total]) => ({ year: y, total })),
    fundamentals: { quarterly: fund(r.fundamentals.quarterly), annual: fund(r.fundamentals.annual) },
  };
}
