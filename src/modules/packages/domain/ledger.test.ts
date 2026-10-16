import { describe, expect, it } from "vitest";
import {
  consumeEntry,
  isLowBalance,
  packageBalance,
  packageStatus,
} from "./ledger";

describe("packageBalance", () => {
  it("sums purchase, usage and adjustments", () => {
    expect(
      packageBalance([
        { delta: 10, reason: "purchase" },
        consumeEntry("session"),
        consumeEntry("late_cancel"),
        { delta: 1, reason: "adjustment" },
      ]),
    ).toBe(9);
  });

  it("is zero for an empty ledger", () => {
    expect(packageBalance([])).toBe(0);
  });
});

describe("packageStatus", () => {
  const now = new Date("2026-10-16T12:00:00Z");

  it("is active with balance and valid date", () => {
    expect(packageStatus(3, new Date("2026-12-01T00:00:00Z"), now)).toBe("active");
  });

  it("is expired after validity date, even with balance", () => {
    expect(packageStatus(3, new Date("2026-10-01T00:00:00Z"), now)).toBe("expired");
  });

  it("is depleted at zero balance", () => {
    expect(packageStatus(0, null, now)).toBe("depleted");
  });
});

describe("isLowBalance", () => {
  it("flags 1-2 remaining sessions only", () => {
    expect(isLowBalance(0)).toBe(false);
    expect(isLowBalance(1)).toBe(true);
    expect(isLowBalance(2)).toBe(true);
    expect(isLowBalance(3)).toBe(false);
  });
});
