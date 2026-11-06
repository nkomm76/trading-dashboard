// Einmalcodes nach RFC 6238 (TOTP: HMAC-SHA1, 30 Sekunden, 6 Ziffern), wie Authenticator-Apps sie erzeugen.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Ungültiger Base32-Schlüssel");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Neuer zufälliger Schlüssel (160 Bit, wie von RFC 4226 empfohlen). */
export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Code für einen Zeitschritt (HOTP nach RFC 4226). */
export function codeAt(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = h[h.length - 1] & 15;
  const bin = h.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepOf = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

/**
 * Prüft einen Code mit einem Schritt Toleranz in beide Richtungen (Uhrabweichung).
 * Liefert den getroffenen Zeitschritt; Schritte bis einschließlich `usedStep` gelten als verbraucht (kein Wiederverwenden).
 */
export function verifyCode(secret: string, code: string, now = Date.now(), usedStep = -1): number | undefined {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return undefined;
  const cur = stepOf(now);
  for (const step of [cur - 1, cur, cur + 1]) {
    if (step <= usedStep) continue;
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(c))) return step;
  }
  return undefined;
}

/** Link für Authenticator-Apps (als QR-Code anzeigen). */
export function otpauthUri(secret: string, label = "Dividenden-Dashboard"): string {
  const l = encodeURIComponent(label);
  return `otpauth://totp/${l}?secret=${secret}&issuer=${l}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
