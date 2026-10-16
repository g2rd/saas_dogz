import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  formatCode,
  generateCode,
  generateToken,
  hashSecret,
  invitationExpiry,
  normalizeSecret,
} from "./secrets";

describe("generateToken", () => {
  it("is 43 URL-safe characters and different every time", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe("generateCode", () => {
  it("has the right length and only unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    }
    expect(generateCode()).toHaveLength(CODE_LENGTH);
  });

  it("never emits confusing characters even for adversarial random bytes", () => {
    // Bajty 248-255 są odrzucane, więc ciąg samych 255 nie może dać kodu z biasem; następne bajty dają kod.
    let call = 0;
    const random = (size: number) => (call++ === 0 ? Buffer.alloc(size, 255) : Buffer.alloc(size, 0));
    expect(generateCode(random)).toBe("AAAAAAAAAA");
  });

  it("covers the alphabet roughly evenly (no modulo bias)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      for (const char of generateCode()) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(counts.size).toBe(31);
    const values = [...counts.values()];
    const expected = (3000 * CODE_LENGTH) / 31;
    expect(Math.min(...values)).toBeGreaterThan(expected * 0.8);
    expect(Math.max(...values)).toBeLessThan(expected * 1.2);
  });
});

describe("formatCode", () => {
  it("groups the code in two halves", () => {
    expect(formatCode("ABCDEFGHJK")).toBe("ABCDE-FGHJK");
  });
});

describe("normalizeSecret", () => {
  it("accepts a token unchanged", () => {
    const token = generateToken();
    expect(normalizeSecret(token)).toBe(token);
    expect(normalizeSecret(`  ${token}\n`)).toBe(token);
  });

  it("accepts a code typed in any case, with spaces or a hyphen", () => {
    expect(normalizeSecret("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normalizeSecret(" abcde fghjk ")).toBe("ABCDEFGHJK");
    expect(normalizeSecret("ABCDEFGHJK")).toBe("ABCDEFGHJK");
  });

  it("rejects wrong length and confusing characters", () => {
    expect(normalizeSecret("")).toBeNull();
    expect(normalizeSecret("ABC")).toBeNull();
    expect(normalizeSecret("ABCDEFGHJ0")).toBeNull(); // zero
    expect(normalizeSecret("ABCDEFGHJO")).toBeNull(); // litera O
    expect(normalizeSecret("ABCDEFGHJI")).toBeNull();
    expect(normalizeSecret("a".repeat(44))).toBeNull();
    expect(normalizeSecret("../../etc/passwd")).toBeNull();
  });
});

describe("hashSecret", () => {
  it("is a stable 64-hex HMAC that depends on the pepper", () => {
    const a = hashSecret("ABCDEFGHJK", "pepper-one-pepper-one-pepper-1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret("ABCDEFGHJK", "pepper-one-pepper-one-pepper-1")).toBe(a);
    expect(hashSecret("ABCDEFGHJK", "pepper-two-pepper-two-pepper-2")).not.toBe(a);
    expect(hashSecret("ABCDEFGHJL", "pepper-one-pepper-one-pepper-1")).not.toBe(a);
  });
});

describe("invitationExpiry", () => {
  it("is seven days ahead", () => {
    expect(invitationExpiry(new Date("2026-10-16T10:00:00Z")).toISOString()).toBe("2026-10-23T10:00:00.000Z");
  });
});
