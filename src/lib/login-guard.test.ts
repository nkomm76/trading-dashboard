import { describe, expect, it } from "vitest";
import { clientIp, GLOBAL_MAX, LoginGuard, PER_IP_LOCK, PER_IP_MAX, PER_IP_WINDOW } from "./login-guard";

describe("LoginGuard", () => {
  it("sperrt nur die IP, die zu oft falsch rät", () => {
    const g = new LoginGuard();
    const now = 1_000_000;
    for (let i = 0; i < PER_IP_MAX; i++) g.fail("1.1.1.1", now);
    expect(g.lockedFor("1.1.1.1", now)).toBe(PER_IP_LOCK);
    expect(g.lockedFor("2.2.2.2", now)).toBe(0);
    expect(g.lockedFor("1.1.1.1", now + PER_IP_LOCK)).toBe(0);
  });

  it("vergisst alte Fehlversuche und setzt nach Erfolg zurück", () => {
    const g = new LoginGuard();
    for (let i = 0; i < PER_IP_MAX - 1; i++) g.fail("ip", 0);
    g.fail("ip", PER_IP_WINDOW);
    expect(g.lockedFor("ip", PER_IP_WINDOW)).toBe(0);
    for (let i = 0; i < PER_IP_MAX - 1; i++) g.fail("x", 0);
    g.success("x");
    g.fail("x", 1);
    expect(g.lockedFor("x", 1)).toBe(0);
  });

  it("sperrt alle, wenn sehr viele IPs zusammen raten", () => {
    const g = new LoginGuard();
    for (let i = 0; i < GLOBAL_MAX; i++) g.fail(`10.0.0.${i}`, 5);
    expect(g.lockedFor("neu", 5)).toBeGreaterThan(0);
  });
});

describe("clientIp", () => {
  it("nimmt die IP vom nächstgelegenen Proxy", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" }))).toBe("5.5.5.5");
    expect(clientIp(new Headers())).toBe("unbekannt");
  });
});
