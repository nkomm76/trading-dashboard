import "server-only";
import { cache } from "react";
import { db } from "./db";

// Anmelde-Einstellungen in der Tabelle Setting:
// - "totp": aktiver zweiter Faktor {secret, lastStep}
// - "totp-pending": Schlüssel während der Einrichtung, bis der erste Code bestätigt ist
// - "session-version": Zähler; jede Erhöhung macht alle bisherigen Anmeldungen ungültig

export type Totp = { secret: string; lastStep: number };

async function read<T>(key: string): Promise<T | undefined> {
  const row = await db.setting.findUnique({ where: { key } });
  return (row?.value as T | null) ?? undefined;
}

async function write(key: string, value: object | number) {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export const getTotp = () => read<Totp>("totp");
export const getPendingTotp = () => read<{ secret: string; createdAt: number }>("totp-pending");
export const savePendingTotp = (secret: string) => write("totp-pending", { secret, createdAt: Date.now() });

export async function activateTotp(secret: string, step: number) {
  await db.$transaction([
    db.setting.upsert({ where: { key: "totp" }, create: { key: "totp", value: { secret, lastStep: step } }, update: { value: { secret, lastStep: step } } }),
    db.setting.deleteMany({ where: { key: "totp-pending" } }),
  ]);
}

export async function disableTotp() {
  await db.setting.deleteMany({ where: { key: { in: ["totp", "totp-pending"] } } });
}

/** Merkt den zuletzt benutzten Zeitschritt, nur wenn er neuer ist (kein Wiederverwenden eines Codes). */
export async function markTotpUsed(step: number): Promise<boolean> {
  const t = await getTotp();
  if (!t || step <= t.lastStep) return false;
  await write("totp", { ...t, lastStep: step });
  return true;
}

/** Je Anfrage nur einmal gelesen. */
export const getSessionVersion = cache(async () => (await read<number>("session-version")) ?? 0);

export async function bumpSessionVersion() {
  await write("session-version", (await getSessionVersion()) + 1);
}
