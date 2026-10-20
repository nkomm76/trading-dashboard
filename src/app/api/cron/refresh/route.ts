import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { refreshAll } from "@/lib/refresh";

export const maxDuration = 600;

// Aufruf durch den Hostinger-Cronjob: GET /api/cron/refresh mit Header "Authorization: Bearer <CRON_SECRET>"
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? request.nextUrl.searchParams.get("token") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await refreshAll({ outlook: true });
  return NextResponse.json(result);
}
