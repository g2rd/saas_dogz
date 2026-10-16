import { describe, expect, it } from "vitest";
import {
  clientFullName,
  clientInputSchema,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  sanitizeSearch,
} from "./client";

describe("normalizePhone", () => {
  it("adds +48 to 9-digit Polish numbers and strips separators", () => {
    expect(normalizePhone("600 123 456")).toBe("+48600123456");
    expect(normalizePhone("600-123-456")).toBe("+48600123456");
  });

  it("keeps international numbers", () => {
    expect(normalizePhone("+49 151 2345 6789")).toBe("+4915123456789");
    expect(normalizePhone("0048600123456")).toBe("+48600123456");
    expect(normalizePhone("48600123456")).toBe("+48600123456");
  });

  it("returns null for empty input", () => {
    expect(normalizePhone("   ")).toBeNull();
  });

  it("leaves garbage unchanged so validation can reject it", () => {
    const value = normalizePhone("12345");
    expect(value).toBe("12345");
    expect(isValidPhone(value!)).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims, empty becomes null", () => {
    expect(normalizeEmail("  Anna@Example.COM ")).toBe("anna@example.com");
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("clientFullName", () => {
  it("joins first and last name, tolerating a missing last name", () => {
    expect(clientFullName({ firstName: "Anna", lastName: "Kowalska" })).toBe("Anna Kowalska");
    expect(clientFullName({ firstName: "Anna", lastName: "" })).toBe("Anna");
  });
});

describe("sanitizeSearch", () => {
  it("removes PostgREST filter control characters", () => {
    expect(sanitizeSearch('a,b)(c%d*"e\\')).toBe("a b c d e");
  });

  it("limits length", () => {
    expect(sanitizeSearch("x".repeat(200))).toHaveLength(80);
  });
});

describe("clientInputSchema", () => {
  it("accepts a minimal client and applies defaults", () => {
    const parsed = clientInputSchema.parse({ firstName: " Anna " });
    expect(parsed).toEqual({
      firstName: "Anna",
      lastName: "",
      email: null,
      phone: null,
      status: "active",
      assignedTrainerId: null,
    });
  });

  it("normalizes email and phone", () => {
    const parsed = clientInputSchema.parse({
      firstName: "Jan",
      email: "JAN@Example.com",
      phone: "600 111 222",
      assignedTrainerId: "",
    });
    expect(parsed.email).toBe("jan@example.com");
    expect(parsed.phone).toBe("+48600111222");
    expect(parsed.assignedTrainerId).toBeNull();
  });

  it("rejects missing first name, bad email and bad phone", () => {
    const result = clientInputSchema.safeParse({ firstName: "", email: "nie-email", phone: "123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["firstName", "email", "phone"]));
    }
  });
});
