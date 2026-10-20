import "server-only";
import { db } from "./db";
import { DEFAULT_THRESHOLDS, type Thresholds } from "./rating";

export async function getThresholds(): Promise<Thresholds> {
  const row = await db.setting.findUnique({ where: { key: "thresholds" } });
  return row ? { ...DEFAULT_THRESHOLDS, ...(row.value as Partial<Thresholds>) } : DEFAULT_THRESHOLDS;
}

export async function saveThresholds(t: Thresholds) {
  await db.setting.upsert({ where: { key: "thresholds" }, create: { key: "thresholds", value: t }, update: { value: t } });
}

export async function getFxRates(): Promise<{ rates: Record<string, number>; asOf: string } | undefined> {
  const row = await db.setting.findUnique({ where: { key: "fx" } });
  return (row?.value as { rates: Record<string, number>; asOf: string } | undefined) ?? undefined;
}
