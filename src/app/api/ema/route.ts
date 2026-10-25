import { NextResponse, type NextRequest } from "next/server";
import { isLoggedIn } from "@/lib/session";
import { fetchCloses } from "@/lib/data/yahoo";
import { ema } from "@/lib/ema";

const YEAR = 365 * 86_400_000;

export async function GET(request: NextRequest) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim() ?? "";
  if (!symbol) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const now = Date.now();
  // 8 Jahre laden: der 5-Jahres-Chart beginnt erst nach drei Jahren Vorlauf, bis dahin hat sich der Startwert ausgeglichen
  const from = new Date(now - 8 * YEAR);
  const shown = (line: { time: number }[]) => line.filter((p) => p.time >= now - 5.1 * YEAR);
  const [daily, weekly] = await Promise.all([fetchCloses(symbol, from, "1d").catch(() => []), fetchCloses(symbol, from, "1wk").catch(() => [])]);
  return NextResponse.json({ ema200d: shown(ema(daily, 200)), ema20w: shown(ema(weekly, 20)) });
}
