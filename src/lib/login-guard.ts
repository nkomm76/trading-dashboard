// Bremse gegen Passwort-Raten: Sperre je Absender-IP, dazu eine hohe Obergrenze für alle zusammen
// (falls jemand wechselnde IPs vortäuscht). Zustand je Server-Prozess, bewusst ohne Datenbank.

export const PER_IP_MAX = 5; // Fehlversuche je IP …
export const PER_IP_WINDOW = 15 * 60_000; // … innerhalb von 15 Minuten
export const PER_IP_LOCK = 15 * 60_000;
export const GLOBAL_MAX = 100; // Fehlversuche aller IPs innerhalb einer Stunde
export const GLOBAL_WINDOW = 60 * 60_000;
export const GLOBAL_LOCK = 15 * 60_000;
const MAX_ENTRIES = 10_000;

type Entry = { fails: number[]; lockedUntil: number };

export class LoginGuard {
  private ips = new Map<string, Entry>();
  private global: number[] = [];
  private globalLockedUntil = 0;

  /** Restliche Sperrzeit in ms (0 = Versuch erlaubt). */
  lockedFor(ip: string, now = Date.now()): number {
    const own = this.ips.get(ip)?.lockedUntil ?? 0;
    return Math.max(0, own - now, this.globalLockedUntil - now);
  }

  fail(ip: string, now = Date.now()) {
    this.prune(now);
    const e = this.ips.get(ip) ?? { fails: [], lockedUntil: 0 };
    e.fails = e.fails.filter((t) => now - t < PER_IP_WINDOW);
    e.fails.push(now);
    if (e.fails.length >= PER_IP_MAX) {
      e.lockedUntil = now + PER_IP_LOCK;
      e.fails = [];
    }
    this.ips.delete(ip); // neu einfügen: Map bleibt nach letzter Aktivität sortiert
    this.ips.set(ip, e);
    this.global = this.global.filter((t) => now - t < GLOBAL_WINDOW);
    this.global.push(now);
    if (this.global.length >= GLOBAL_MAX) {
      this.globalLockedUntil = now + GLOBAL_LOCK;
      this.global = [];
    }
  }

  success(ip: string) {
    this.ips.delete(ip);
  }

  private prune(now: number) {
    for (const [k, e] of this.ips) {
      if (e.lockedUntil <= now && e.fails.every((t) => now - t >= PER_IP_WINDOW)) this.ips.delete(k);
    }
    while (this.ips.size >= MAX_ENTRIES) this.ips.delete(this.ips.keys().next().value!);
  }
}

/**
 * Absender-IP aus genau einem Header, den der eigene Proxy setzt und ein Browser nicht vorgeben kann:
 * hinter Traefik "x-real-ip" (Standard), hinter Cloudflare "cf-connecting-ip" (CLIENT_IP_HEADER).
 * Andere Header werden ignoriert, sonst könnte ein Angreifer mit erfundenen IPs die Sperre umgehen.
 * Fehlt der Header, zählt der letzte Eintrag in x-forwarded-for (den setzt der nächstgelegene Proxy).
 */
export function clientIp(h: Headers, header = process.env.CLIENT_IP_HEADER || "x-real-ip"): string {
  const trusted = h.get(header)?.trim();
  if (trusted) return trusted;
  const xff = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return xff?.at(-1) ?? "unbekannt";
}
