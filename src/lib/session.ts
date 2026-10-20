import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sealData, unsealData } from "iron-session";

export const SESSION_COOKIE = "divdash_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 Tage

type Session = { loggedIn: true; exp: number };

function password() {
  const p = process.env.SESSION_PASSWORD;
  if (!p || p.length < 32) throw new Error("SESSION_PASSWORD fehlt oder ist kürzer als 32 Zeichen");
  return p;
}

export async function createSession() {
  const exp = Date.now() + MAX_AGE * 1000;
  const sealed = await sealData({ loggedIn: true, exp } satisfies Session, { password: password(), ttl: MAX_AGE });
  (await cookies()).set(SESSION_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function isLoggedIn(): Promise<boolean> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  try {
    const s = await unsealData<Partial<Session>>(raw, { password: password(), ttl: MAX_AGE });
    return s.loggedIn === true && typeof s.exp === "number" && s.exp > Date.now();
  } catch {
    return false;
  }
}

/** In jeder Seite und jeder Server Action aufrufen. */
export async function requireAuth() {
  if (!(await isLoggedIn())) redirect("/login");
}
