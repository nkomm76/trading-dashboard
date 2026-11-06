import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, codeAt, newSecret, stepOf, verifyCode } from "./totp";

// Testschlüssel aus RFC 6238, Anhang B (SHA1): "12345678901234567890"
const RFC = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("rechnet die Testwerte aus RFC 6238", () => {
    expect(codeAt(RFC, stepOf(59_000), 8)).toBe("94287082");
    expect(codeAt(RFC, stepOf(1_111_111_109_000), 8)).toBe("07081804");
    expect(codeAt(RFC, stepOf(20_000_000_000_000), 8)).toBe("65353130");
    expect(codeAt(RFC, stepOf(59_000))).toBe("287082");
  });

  it("kodiert Base32 hin und zurück", () => {
    const s = newSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(base32Decode("gezd gnbv-gy======")).toEqual(Buffer.from("123456"));
  });

  it("akzeptiert einen Schritt Abweichung, aber keinen verbrauchten Code", () => {
    const now = 1_700_000_000_000;
    const cur = stepOf(now);
    expect(verifyCode(RFC, codeAt(RFC, cur), now)).toBe(cur);
    expect(verifyCode(RFC, codeAt(RFC, cur - 1), now)).toBe(cur - 1);
    expect(verifyCode(RFC, codeAt(RFC, cur - 2), now)).toBeUndefined();
    expect(verifyCode(RFC, codeAt(RFC, cur), now, cur)).toBeUndefined();
    expect(verifyCode(RFC, "12345", now)).toBeUndefined();
    expect(verifyCode(RFC, "abcdef", now)).toBeUndefined();
  });
});
