import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { Metrics } from "@/lib/metrics";
import type { LightColor, Reason } from "@/lib/rating";
import type { Sourced } from "@/lib/data/types";
import { fmtBig, fmtDate, fmtMoney, fmtMonths, fmtNum, fmtPct } from "@/lib/format";
import { Light, LIGHT_LABEL } from "@/components/light";
import { Value } from "@/components/value";
import { DividendChart, EpsFcfChart } from "@/components/charts";
import { computePosition } from "@/lib/position";
import { toTx } from "@/lib/portfolio";
import { toEur } from "@/lib/data/fx";
import { getFxRates } from "@/lib/settings";
import { setAssetClass } from "@/app/actions";
import { CLASS_LABEL } from "@/lib/wealth";

type Series = {
  dividendsByYear: { year: number; total: number }[];
  quarterly: { date: string; eps: number | null; fcf: number | null }[];
  annual: { date: string; eps: number | null; fcf: number | null }[];
};

const STATUS: Record<string, string> = { RAISED: "Prognose angehoben", CONFIRMED: "Prognose bestätigt", LOWERED: "Prognose gesenkt", UNKNOWN: "Keine verlässliche Prognose gefunden" };

export default async function StockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stock = await db.stock.findUnique({
    where: { id: Number(id) },
    include: {
      purchases: { orderBy: { date: "asc" } },
      snapshots: { orderBy: { date: "desc" }, take: 1 },
      ratings: { orderBy: { date: "desc" }, take: 1 },
      outlooks: { orderBy: { period: "desc" }, take: 1 },
      dividends: { where: { status: "CONFIRMED" }, orderBy: { exDate: "desc" } },
    },
  });
  if (!stock) notFound();

  const m = (stock.snapshots[0]?.metrics ?? {}) as Metrics;
  const series = stock.snapshots[0]?.series as Series | undefined;
  const rating = stock.ratings[0];
  const light = (rating?.light ?? "GREY") as LightColor;
  const reasons = (rating?.reasons ?? []) as Reason[];
  const outlook = stock.outlooks[0];
  const cur = stock.currency;
  const pos = computePosition(stock.purchases.map(toTx));
  const fcur = m.financialCurrency;
  // Anzeige in Euro zum aktuellen EZB-Kurs; ohne Kurs in Originalwährung
  const rates = (await getFxRates())?.rates;
  const inEur = (v: number, from = cur) => (rates ? toEur(v, from, rates) : undefined);
  const money = (v: number, from = cur) => {
    const e = inEur(v, from);
    return e === undefined ? fmtMoney(v, from) : fmtMoney(e);
  };
  const big = (v: number) => {
    const e = inEur(v, fcur ?? cur);
    return e === undefined ? fmtBig(v, fcur) : fmtBig(e, "EUR");
  };
  const eurRows = (rows: Series["annual"]) =>
    rows.map((r) => ({ ...r, eps: r.eps === null ? null : (inEur(r.eps, fcur ?? cur) ?? r.eps), fcf: r.fcf === null ? null : (inEur(r.fcf, fcur ?? cur) ?? r.fcf) }));

  const groups: { title: string; rows: [string, Sourced<unknown> | undefined, (v: never) => string][] }[] = [
    {
      title: "Dividende",
      rows: [
        ["Dividende (12 Monate)", m.dividendTTM, (v: number) => money(v)],
        ["Dividendenrendite", m.dividendYield, (v: number) => fmtPct(v)],
        ["Yield on Cost", m.yieldOnCost, (v: number) => fmtPct(v)],
        ["Ausschüttungsrhythmus", m.frequency, (v: string) => v],
        ["Monate der Ex-Tage", m.exMonths, (v: string[]) => fmtMonths(v)],
        ["Letzte Zahlung", m.lastDividend, (v: { date: string; amount: number }) => `${fmtDate(v.date)} · ${money(v.amount)}`],
        ["Nächster Ex-Tag", m.nextExDividend, (v: string) => fmtDate(v)],
        ["Dividendenwachstum CAGR 3 J.", m.dividendCagr3, (v: number) => fmtPct(v)],
        ["Dividendenwachstum CAGR 5 J.", m.dividendCagr5, (v: number) => fmtPct(v)],
        ["Dividendenwachstum CAGR 10 J.", m.dividendCagr10, (v: number) => fmtPct(v)],
      ],
    },
    {
      title: "Ausschüttung & Verschuldung",
      rows: [
        ["Payout Ratio (EPS)", m.payoutEps, (v: number) => fmtPct(v)],
        ["Payout Ratio (FCF)", m.payoutFcf, (v: number) => fmtPct(v)],
        ["Debt to Equity", m.debtToEquity, (v: number) => fmtNum(v)],
        ["Neuverschuldung ggü. Vorquartal", m.debtChangeQoQ, (v: number) => (v > 0 ? "+" : "") + fmtPct(v)],
        ["Neuverschuldung ggü. Vorjahr", m.debtChangeYoY, (v: number) => (v > 0 ? "+" : "") + fmtPct(v)],
      ],
    },
    {
      title: "Aktuelle Zahlen",
      rows: [
        ["Kurs", m.price, (v: number) => money(v)],
        ["EPS (12 Monate)", m.epsTTM, (v: number) => money(v, fcur ?? cur)],
        ["EPS letzter Bericht", m.epsLatest, (v: number) => money(v, fcur ?? cur)],
        ["EPS ggü. Vorjahresquartal", m.epsLatestYoY, (v: number) => (v > 0 ? "+" : "") + fmtPct(v)],
        ["Free Cashflow (12 Monate)", m.fcfTTM, (v: number) => big(v)],
        ["Free Cashflow letzter Bericht", m.fcfLatest, (v: number) => big(v)],
      ],
    },
  ];

  // Ampel und Aktien-Kennzahlen nur für Aktien; ETF zeigt Kurs und Ausschüttungen, Krypto nur den Kurs
  const isStock = stock.assetClass === "STOCK";
  const ETF_ROWS = ["Dividende (12 Monate)", "Dividendenrendite", "Yield on Cost", "Ausschüttungsrhythmus", "Letzte Zahlung", "Nächster Ex-Tag", "Kurs"];
  const shownGroups = isStock
    ? groups
    : groups
        .map((g) => ({ ...g, rows: g.rows.filter(([label]) => (stock.assetClass === "ETF" ? ETF_ROWS.includes(label) : label === "Kurs")) }))
        .filter((g) => g.rows.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {isStock && <Light light={light} size="lg" />}
        <div>
          <h1 className="text-xl font-semibold">{stock.name}</h1>
          <p className="text-sm text-muted">
            {stock.symbol} · {stock.exchange ?? "–"} · {stock.sector ?? "Sektor unbekannt"} · Datenstand {fmtDate(stock.snapshots[0]?.date.toISOString())}
            {rates && cur !== "EUR" && ` · Beträge in € (aus ${cur} zum aktuellen EZB-Kurs)`}
          </p>
        </div>
        <form action={setAssetClass} className="ml-auto flex items-center gap-2 text-sm">
          <input type="hidden" name="stockId" value={stock.id} />
          <label className="text-muted" htmlFor="assetClass">Anlageklasse</label>
          <select id="assetClass" name="assetClass" defaultValue={stock.assetClass} className="input w-auto py-1">
            {(["STOCK", "ETF", "CRYPTO"] as const).map((c) => (
              <option key={c} value={c}>{CLASS_LABEL[c]}</option>
            ))}
          </select>
          <button className="btn-secondary py-1">Ändern</button>
        </form>
      </div>

      {isStock && <section className="card p-5">
        <h2 className="mb-3 font-semibold">Ampel: {LIGHT_LABEL[light]}</h2>
        {reasons.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Bewertung – Daten werden beim nächsten Aktualisieren geladen.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1"><Light light={r.light} /></span>
                <span>
                  <span className="font-medium">{r.criterion}:</span> {r.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        {light === "GREY" && reasons.length > 0 && <p className="mt-3 text-xs text-muted">Zu wenige Kriterien mit Datenquelle für eine Gesamtfarbe.</p>}
      </section>}

      <section className="grid gap-4 lg:grid-cols-3">
        {shownGroups.map((g) => (
          <div key={g.title} className="card p-5">
            <h2 className="mb-3 font-semibold">{g.title}</h2>
            <dl className="space-y-2 text-sm">
              {g.rows.map(([label, s, f]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right">
                    <Value s={s as Sourced<never>} format={f} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>

      {isStock && <section className="card p-5">
        <h2 className="mb-1 font-semibold">Ausblick aufs Gesamtjahr (KI-Auswertung)</h2>
        {!outlook ? (
          <p className="text-sm text-muted">Noch keine Auswertung. Sie wird nach jedem neuen Quartalsbericht beim nächtlichen Lauf erstellt.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted">
              Bericht zum {fmtDate(outlook.period)} · ausgewertet am {fmtDate(outlook.createdAt.toISOString())} mit {outlook.model}
            </p>
            <p className="font-medium">
              {STATUS[outlook.status]}
              {outlook.dividendCut && <span className="ml-2 text-light-red">· Dividendenkürzung angekündigt</span>}
            </p>
            {(outlook.summary as string[]).length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {(outlook.summary as string[]).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
            {(outlook.risks as string[]).length > 0 && (
              <div>
                <p className="font-medium">Risiken</p>
                <ul className="list-disc space-y-1 pl-5">
                  {(outlook.risks as string[]).map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {(outlook.sources as { title: string; url: string }[]).length > 0 && (
              <div className="text-xs">
                <p className="font-medium">Quellen</p>
                <ul className="space-y-0.5">
                  {(outlook.sources as { title: string; url: string }[]).map((s, i) => (
                    <li key={i}>
                      <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent break-all">{s.title || s.url}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>}

      {series && stock.assetClass !== "CRYPTO" && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">{isStock ? "Dividende je Aktie" : "Ausschüttung je Anteil"} pro Jahr ({rates ? "€" : cur})</h2>
            {series.dividendsByYear.length ? (
              <DividendChart data={series.dividendsByYear.map((d) => ({ ...d, total: inEur(d.total) ?? d.total }))} currentYear={new Date().getFullYear()} />
            ) : (
              <p className="text-sm text-muted">Keine Dividendenhistorie verfügbar.</p>
            )}
          </div>
          {isStock && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold">EPS und Free Cashflow</h2>
              <EpsFcfChart quarterly={eurRows(series.quarterly)} annual={eurRows(series.annual)} currency={rates ? "EUR" : fcur} />
            </div>
          )}
        </section>
      )}

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Deine Buchungen</h2>
          <div className="flex gap-2 text-sm">
            {pos.quantity > 0 && <a href={`/kauf?sell=${stock.id}`} className="btn-secondary">Verkaufen</a>}
          </div>
        </div>
        <p className="mb-3 text-sm text-muted">
          {pos.quantity > 0
            ? `Bestand ${pos.quantity.toLocaleString("de-DE", { maximumFractionDigits: 8 })} Stück · Ø Einstand ${fmtMoney(pos.avgCost)}`
            : "Komplett verkauft – Kennzahlen zeigen den letzten Datenstand und werden nicht mehr aktualisiert."}
        </p>
        {stock.dividends.length > 0 && (
          <p className="mb-3 text-sm">
            Erhaltene Dividenden: <span className="tabular font-medium">{fmtMoney(stock.dividends.reduce((a, d) => a + Number(d.netEur ?? 0), 0))}</span> netto aus{" "}
            {stock.dividends.length} Zahlung{stock.dividends.length === 1 ? "" : "en"} ·{" "}
            <a href="/dividenden" className="text-accent">Details</a>
          </p>
        )}
        <ul className="space-y-1 text-sm">
          {stock.purchases.map((p) => (
            <li key={p.id} className="tabular">
              <span className={p.type === "SELL" ? "text-light-orange" : "text-light-green"}>{p.type === "SELL" ? "Verkauf" : "Kauf"}</span>{" "}
              {fmtDate(p.date.toISOString())}: {Number(p.quantity).toLocaleString("de-DE", { maximumFractionDigits: 8 })} Stück zu {fmtMoney(Number(p.price))}
              {Number(p.fees) > 0 && ` + ${fmtMoney(Number(p.fees))} Gebühren`}
              {p.note && <span className="text-muted"> – {p.note}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
