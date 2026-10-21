import { describe, expect, it } from "vitest";
import { BETA_CODE_LENGTH, formatBetaCode, generateBetaCode, hashBetaCode, normalizeBetaCode } from "./beta-code";

describe("kody beta", () => {
  it("generuje kody poprawnej długości, które przechodzą normalizację", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateBetaCode();
      expect(code).toHaveLength(BETA_CODE_LENGTH);
      expect(normalizeBetaCode(code)).toBe(code);
    }
  });

  it("normalizuje wielkość liter, spacje i myślniki oraz odrzuca niepoprawne zapisy", () => {
    expect(normalizeBetaCode(" abcd-efgh-jkmn ")).toBe("ABCDEFGHJKMN");
    expect(normalizeBetaCode(formatBetaCode("ABCDEFGHJKMN"))).toBe("ABCDEFGHJKMN");
    expect(normalizeBetaCode("ABC")).toBeNull();
    expect(normalizeBetaCode("ABCDEFGHJKM0")).toBeNull(); // 0 jest wykluczone z alfabetu
  });

  it("skrót zależy od kodu i pieprzu", () => {
    const a = hashBetaCode("ABCDEFGHJKMN", "pieprz-pieprz-pieprz-pieprz-1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBetaCode("ABCDEFGHJKMN", "pieprz-pieprz-pieprz-pieprz-1")).toBe(a);
    expect(hashBetaCode("ABCDEFGHJKMP", "pieprz-pieprz-pieprz-pieprz-1")).not.toBe(a);
    expect(hashBetaCode("ABCDEFGHJKMN", "pieprz-pieprz-pieprz-pieprz-2")).not.toBe(a);
  });
});
