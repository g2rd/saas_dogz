import { describe, expect, it } from "vitest";
import { chargeRemaining, chargeStatus, type ChargeSnapshot } from "./charge-status";

const now = new Date("2026-10-16T12:00:00Z");
const future = new Date("2026-11-01T00:00:00Z");
const past = new Date("2026-10-01T00:00:00Z");

const base: ChargeSnapshot = {
  amountMinor: 30000,
  allocatedMinor: 0,
  dueDate: future,
  voided: false,
};

describe("chargeStatus", () => {
  it("unpaid before due date with nothing paid", () => {
    expect(chargeStatus(base, now)).toBe("unpaid");
  });

  it("partial when part is allocated", () => {
    expect(chargeStatus({ ...base, allocatedMinor: 10000 }, now)).toBe("partial");
  });

  it("paid when fully allocated, even after due date", () => {
    expect(chargeStatus({ ...base, allocatedMinor: 30000, dueDate: past }, now)).toBe("paid");
  });

  it("overdue after due date when not fully paid", () => {
    expect(chargeStatus({ ...base, allocatedMinor: 10000, dueDate: past }, now)).toBe("overdue");
  });

  it("void wins over everything", () => {
    expect(chargeStatus({ ...base, voided: true, dueDate: past }, now)).toBe("void");
  });
});

describe("chargeRemaining", () => {
  it("never goes negative on overpayment", () => {
    expect(chargeRemaining({ ...base, allocatedMinor: 35000 })).toBe(0);
    expect(chargeRemaining({ ...base, allocatedMinor: 10000 })).toBe(20000);
  });
});
