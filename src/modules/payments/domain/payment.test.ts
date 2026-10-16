import { describe, expect, it } from "vitest";
import { creditMinor, owedMinor, paidAtFromDate, paymentInputSchema } from "./payment";

const CLIENT = "10000000-0000-4000-8000-000000000001";

describe("paymentInputSchema", () => {
  it("parses a payment from form strings", () => {
    expect(
      paymentInputSchema.parse({ clientId: CLIENT, amount: "300,00", method: "cash", paidAt: "", reference: " zaliczka ", chargeId: "" }),
    ).toEqual({
      clientId: CLIENT,
      amount: 30000,
      method: "cash",
      paidAt: null,
      reference: "zaliczka",
      chargeId: null,
    });
  });

  it("rejects zero and malformed amounts, unknown methods and bad dates", () => {
    expect(paymentInputSchema.safeParse({ clientId: CLIENT, amount: "0", method: "cash" }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ clientId: CLIENT, amount: "abc", method: "cash" }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ clientId: CLIENT, amount: "10", method: "bitcoin" }).success).toBe(false);
    expect(paymentInputSchema.safeParse({ clientId: CLIENT, amount: "10", method: "cash", paidAt: "2026-02-31" }).success).toBe(false);
  });
});

describe("client balance", () => {
  it("computes what is owed and the overpayment credit", () => {
    expect(owedMinor({ clientId: "c", chargedMinor: 80000, allocatedMinor: 30000, paidMinor: 30000 })).toBe(50000);
    expect(creditMinor({ clientId: "c", chargedMinor: 80000, allocatedMinor: 30000, paidMinor: 30000 })).toBe(0);
    expect(creditMinor({ clientId: "c", chargedMinor: 10000, allocatedMinor: 10000, paidMinor: 25000 })).toBe(15000);
    expect(owedMinor({ clientId: "c", chargedMinor: 10000, allocatedMinor: 10000, paidMinor: 25000 })).toBe(0);
  });
});

describe("paidAtFromDate", () => {
  it("uses noon UTC", () => {
    expect(paidAtFromDate("2026-10-16")).toBe("2026-10-16T12:00:00.000Z");
  });
});
