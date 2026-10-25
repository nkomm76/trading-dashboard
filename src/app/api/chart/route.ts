import { NextResponse, type NextRequest } from "next/server";
import { isLoggedIn } from "@/lib/session";
import { fetchPriceHistory, fetchPriceWindow, type ChartRange } from "@/lib/data/yahoo";
import { toEurConverter } from "@/lib/data/fx-history";

const RANGES: ChartRange[] = ["1d", "1w", "6m", "1y", "5y"];

export async function GET(request: NextRequest) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const symbol = params.get("symbol")?.trim() ?? "";
  const range = params.get("range") as ChartRange;
  // Zoom: Ausschnitt als Zeitstempel in Millisekunden
  const from = Number(params.get("from"));
  const to = Number(params.get("to"));
  const isWindow = Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from;
  if (!symbol || (!isWindow && !RANGES.includes(range))) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    const data = isWindow ? await fetchPriceWindow(symbol, from, to) : await fetchPriceHistory(symbol, range);
    // Alle Kurse in Euro, jeweils zum Wechselkurs des Tages
    const toEur = data.currency ? await toEurConverter(data.currency) : undefined;
    if (!toEur) return NextResponse.json({ points: [] });
    return NextResponse.json({ currency: "EUR", points: data.points.map((p) => ({ ...p, close: toEur(p.close, p.time) })) });
  } catch {
    return NextResponse.json({ points: [] });
  }
}
