import { NextResponse, type NextRequest } from "next/server";
import { isLoggedIn } from "@/lib/session";
import { fetchAdjustedDaily } from "@/lib/data/yahoo";
import { computeSeasonality } from "@/lib/seasonality";

export async function GET(request: NextRequest) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim() ?? "";
  if (!symbol) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const year = new Date().getFullYear();
  try {
    // Ab Dezember vor dem ersten Jahr, damit es einen Basiskurs gibt
    const points = await fetchAdjustedDaily(symbol, new Date(Date.UTC(year - 11, 11, 1)));
    return NextResponse.json({ year, 5: computeSeasonality(points, 5, year) ?? null, 10: computeSeasonality(points, 10, year) ?? null });
  } catch {
    return NextResponse.json({ year, 5: null, 10: null });
  }
}
