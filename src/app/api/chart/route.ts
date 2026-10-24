import { NextResponse, type NextRequest } from "next/server";
import { isLoggedIn } from "@/lib/session";
import { fetchPriceHistory, type ChartRange } from "@/lib/data/yahoo";

const RANGES: ChartRange[] = ["1d", "1w", "6m", "1y", "5y"];

export async function GET(request: NextRequest) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim() ?? "";
  const range = request.nextUrl.searchParams.get("range") as ChartRange;
  if (!symbol || !RANGES.includes(range)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    return NextResponse.json(await fetchPriceHistory(symbol, range));
  } catch {
    return NextResponse.json({ points: [] });
  }
}
