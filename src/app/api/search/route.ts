import { NextResponse, type NextRequest } from "next/server";
import { isLoggedIn } from "@/lib/session";
import { findListings } from "@/lib/data/search";

export async function GET(request: NextRequest) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  // Kennt Yahoo eine ISIN nicht, sucht findListings über Eulerpool weiter
  return NextResponse.json((await findListings(q)).hits);
}
