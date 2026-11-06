import "server-only";
import { db } from "./db";
import { DEFAULT_THRESHOLDS, type Thresholds } from "./rating";
import type { Targets } from "./wealth";

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

/** Eigene Depot-Regeln: Zielaufteilung je Anlageklasse und Grenze für den Klumpen-Hinweis (Anteile 0..1). */
export type PortfolioSettings = { targets: Targets; maxPositionShare?: number };

export async function getPortfolioSettings(): Promise<PortfolioSettings> {
  const row = await db.setting.findUnique({ where: { key: "portfolio" } });
  return { targets: {}, ...((row?.value as Partial<PortfolioSettings> | undefined) ?? {}) };
}

export async function savePortfolioSettings(s: PortfolioSettings) {
  const value = JSON.parse(JSON.stringify(s));
  await db.setting.upsert({ where: { key: "portfolio" }, create: { key: "portfolio", value }, update: { value } });
}
