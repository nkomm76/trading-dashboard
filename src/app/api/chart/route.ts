import { NextResponse, type NextRequest } from "next/server";
import { isLoggedIn } from "@/lib/session";
import { fetchPriceHistory, fetchPriceWindow, type ChartRange } from "@/lib/data/yahoo";

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
    return NextResponse.json(isWindow ? await fetchPriceWindow(symbol, from, to) : await fetchPriceHistory(symbol, range));
  } catch {
    return NextResponse.json({ points: [] });
  }
}
