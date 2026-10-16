import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_MINOR, addMoney, formatMoney, money, parseAmountToMinor, subtractMoney } from "./money";

describe("parseAmountToMinor", () => {
  it("parses whole and decimal amounts with comma or dot", () => {
    expect(parseAmountToMinor("800")).toBe(80000);
    expect(parseAmountToMinor("800,50")).toBe(80050);
    expect(parseAmountToMinor("800.5")).toBe(80050);
    expect(parseAmountToMinor("0")).toBe(0);
    expect(parseAmountToMinor("0,07")).toBe(7);
  });

  it("ignores spaces and non-breaking spaces used as thousands separators", () => {
    expect(parseAmountToMinor("1 200,00")).toBe(120000);
    expect(parseAmountToMinor("1 200")).toBe(120000);
  });

  it("rejects invalid input without rounding", () => {
    expect(parseAmountToMinor("")).toBeNull();
    expect(parseAmountToMinor("abc")).toBeNull();
    expect(parseAmountToMinor("12,345")).toBeNull();
    expect(parseAmountToMinor("-5")).toBeNull();
    expect(parseAmountToMinor("1,200,50")).toBeNull();
    expect(parseAmountToMinor("1e3")).toBeNull();
  });

  it("enforces the upper limit", () => {
    expect(parseAmountToMinor("1000000")).toBe(MAX_AMOUNT_MINOR);
    expect(parseAmountToMinor("1000000,01")).toBeNull();
  });
});

describe("money", () => {
  it("requires integer minor units", () => {
    expect(() => money(10.5)).toThrow(RangeError);
  });

  it("adds and subtracts in the same currency only", () => {
    expect(addMoney(money(100), money(250)).amountMinor).toBe(350);
    expect(subtractMoney(money(100), money(250)).amountMinor).toBe(-150);
    expect(() => addMoney(money(1, "PLN"), money(1, "EUR"))).toThrow(RangeError);
  });

  it("formats in Polish locale", () => {
    expect(formatMoney(money(80050))).toMatch(/800,50\s*zł/);
  });
});
