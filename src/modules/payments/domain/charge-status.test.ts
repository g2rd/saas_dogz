import { describe, expect, it } from "vitest";
import { chargeRemaining, chargeStatus, type ChargeSnapshot } from "./charge-status";

const today = "2026-10-16";

const base: ChargeSnapshot = {
  amountMinor: 30000,
  allocatedMinor: 0,
  dueDate: "2026-11-01",
  voided: false,
};

describe("chargeStatus", () => {
  it("unpaid before due date with nothing paid", () => {
    expect(chargeStatus(base, today)).toBe("unpaid");
  });

  it("partial when part is allocated", () => {
    expect(chargeStatus({ ...base, allocatedMinor: 10000 }, today)).toBe("partial");
  });

  it("paid when fully allocated, even after due date", () => {
    expect(chargeStatus({ ...base, allocatedMinor: 30000, dueDate: "2026-10-01" }, today)).toBe("paid");
  });

  it("overdue only from the day after the due date", () => {
    expect(chargeStatus({ ...base, dueDate: "2026-10-16" }, today)).toBe("unpaid");
    expect(chargeStatus({ ...base, dueDate: "2026-10-15" }, today)).toBe("overdue");
    expect(chargeStatus({ ...base, allocatedMinor: 10000, dueDate: "2026-10-01" }, today)).toBe("overdue");
  });

  it("void wins over everything", () => {
    expect(chargeStatus({ ...base, voided: true, dueDate: "2026-10-01" }, today)).toBe("void");
  });
});

describe("chargeRemaining", () => {
  it("never goes negative on overpayment", () => {
    expect(chargeRemaining({ ...base, allocatedMinor: 35000 })).toBe(0);
    expect(chargeRemaining({ ...base, allocatedMinor: 10000 })).toBe(20000);
  });
});
