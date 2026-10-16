import { describe, expect, it } from "vitest";
import { allocatePayment, allocateToCharge, type OpenCharge } from "./allocation";

const charge = (id: string, remainingMinor: number, dueDate: string, createdAt = "2026-10-01T10:00:00Z"): OpenCharge => ({
  id,
  remainingMinor,
  dueDate,
  createdAt,
});

describe("allocatePayment", () => {
  it("pays the oldest due date first and carries the rest over", () => {
    const plan = allocatePayment(50000, [
      charge("late", 30000, "2026-12-01"),
      charge("early", 30000, "2026-10-20"),
    ]);
    expect(plan.allocations).toEqual([
      { chargeId: "early", amountMinor: 30000 },
      { chargeId: "late", amountMinor: 20000 },
    ]);
    expect(plan.unallocatedMinor).toBe(0);
  });

  it("breaks due-date ties by creation time", () => {
    const plan = allocatePayment(100, [
      charge("b", 500, "2026-10-20", "2026-10-02T00:00:00Z"),
      charge("a", 500, "2026-10-20", "2026-10-01T00:00:00Z"),
    ]);
    expect(plan.allocations).toEqual([{ chargeId: "a", amountMinor: 100 }]);
  });

  it("keeps an overpayment as unallocated credit", () => {
    const plan = allocatePayment(100000, [charge("a", 30000, "2026-10-20")]);
    expect(plan.allocations).toEqual([{ chargeId: "a", amountMinor: 30000 }]);
    expect(plan.unallocatedMinor).toBe(70000);
  });

  it("allocates nothing when there is nothing open", () => {
    expect(allocatePayment(5000, [])).toEqual({ allocations: [], unallocatedMinor: 5000 });
    expect(allocatePayment(5000, [charge("a", 0, "2026-10-20")])).toEqual({ allocations: [], unallocatedMinor: 5000 });
  });

  it("never allocates more than the payment", () => {
    const plan = allocatePayment(10, [charge("a", 500, "2026-10-20"), charge("b", 500, "2026-10-21")]);
    const total = plan.allocations.reduce((sum, a) => sum + a.amountMinor, 0);
    expect(total + plan.unallocatedMinor).toBe(10);
    expect(plan.allocations).toHaveLength(1);
  });

  it("does not mutate its input", () => {
    const input = [charge("b", 1, "2026-10-21"), charge("a", 1, "2026-10-20")];
    allocatePayment(1, input);
    expect(input.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("allocateToCharge", () => {
  it("caps the allocation at what is left on the charge", () => {
    expect(allocateToCharge(50000, charge("a", 30000, "2026-10-20"))).toEqual({
      allocations: [{ chargeId: "a", amountMinor: 30000 }],
      unallocatedMinor: 20000,
    });
  });

  it("allocates the whole payment when it fits", () => {
    expect(allocateToCharge(10000, charge("a", 30000, "2026-10-20")).allocations).toEqual([
      { chargeId: "a", amountMinor: 10000 },
    ]);
  });

  it("allocates nothing to a settled charge", () => {
    expect(allocateToCharge(100, charge("a", 0, "2026-10-20"))).toEqual({ allocations: [], unallocatedMinor: 100 });
  });
});
