import { describe, expect, it } from "vitest";
import { pickNextCharge, type PortalCharge } from "./portal";

const charge = (overrides: Partial<PortalCharge>): PortalCharge => ({
  id: "c",
  description: "Pakiet",
  amountMinor: 10000,
  remainingMinor: 10000,
  currency: "PLN",
  dueDate: "2026-10-20",
  status: "unpaid",
  ...overrides,
});

describe("pickNextCharge", () => {
  it("is null without open charges", () => {
    expect(pickNextCharge([])).toBeNull();
    expect(pickNextCharge([charge({ remainingMinor: 0, status: "paid" }), charge({ status: "void", remainingMinor: 0 })])).toBeNull();
  });

  it("prefers overdue over upcoming, regardless of due date order", () => {
    const upcoming = charge({ id: "soon", dueDate: "2026-10-17" });
    const overdue = charge({ id: "late", dueDate: "2026-10-01", status: "overdue" });
    expect(pickNextCharge([upcoming, overdue])?.id).toBe("late");
  });

  it("takes the earliest due date within a group", () => {
    const a = charge({ id: "a", dueDate: "2026-10-25" });
    const b = charge({ id: "b", dueDate: "2026-10-18" });
    expect(pickNextCharge([a, b])?.id).toBe("b");
    const x = charge({ id: "x", dueDate: "2026-09-30", status: "overdue" });
    const y = charge({ id: "y", dueDate: "2026-09-01", status: "overdue" });
    expect(pickNextCharge([x, y])?.id).toBe("y");
  });

  it("ignores partially paid charges only when nothing remains", () => {
    expect(pickNextCharge([charge({ id: "p", status: "partial", remainingMinor: 5000 })])?.id).toBe("p");
  });
});
