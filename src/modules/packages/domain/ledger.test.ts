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
  const today = "2026-10-16";
  const base = { balance: 3, validUntil: null, canceledAt: null };

  it("is active with balance and no expiry", () => {
    expect(packageStatus(base, today)).toBe("active");
    expect(packageStatus({ ...base, validUntil: "2026-12-01" }, today)).toBe("active");
  });

  it("is valid through the whole last day", () => {
    expect(packageStatus({ ...base, validUntil: "2026-10-16" }, today)).toBe("active");
    expect(packageStatus({ ...base, validUntil: "2026-10-15" }, today)).toBe("expired");
  });

  it("is expired even with balance left", () => {
    expect(packageStatus({ ...base, balance: 5, validUntil: "2026-10-01" }, today)).toBe("expired");
  });

  it("is depleted at zero balance", () => {
    expect(packageStatus({ ...base, balance: 0 }, today)).toBe("depleted");
  });

  it("canceled wins over everything", () => {
    expect(packageStatus({ balance: 0, validUntil: "2020-01-01", canceledAt: new Date() }, today)).toBe("canceled");
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
