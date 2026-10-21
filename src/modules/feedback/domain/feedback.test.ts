import { describe, expect, it } from "vitest";
import { feedbackInputSchema, sanitizePage } from "./feedback";

describe("sanitizePage", () => {
  it("zostawia samą ścieżkę", () => {
    expect(sanitizePage("/app/sessions?client=anna&x=1#top")).toBe("/app/sessions");
    expect(sanitizePage("  /portal/payments ")).toBe("/portal/payments");
  });

  it("odrzuca adresy zewnętrzne i śmieci", () => {
    expect(sanitizePage("https://evil.example/app")).toBeNull();
    expect(sanitizePage("//evil.example")).toBeNull();
    expect(sanitizePage(undefined)).toBeNull();
    expect(sanitizePage(42)).toBeNull();
  });

  it("ucina długą ścieżkę", () => {
    expect(sanitizePage(`/${"a".repeat(500)}`)?.length).toBe(200);
  });
});

describe("feedbackInputSchema", () => {
  it("przyjmuje poprawne zgłoszenie", () => {
    const parsed = feedbackInputSchema.safeParse({ kind: "problem", message: "  Nie widzę zajęć ", page: "/app/sessions?x=1" });
    expect(parsed.success && parsed.data).toEqual({ kind: "problem", message: "Nie widzę zajęć", page: "/app/sessions" });
  });

  it("wymaga rodzaju i treści, ścieżka jest opcjonalna", () => {
    expect(feedbackInputSchema.safeParse({ kind: "nope", message: "x" }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ kind: "idea", message: "   " }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ kind: "idea" }).success).toBe(false);
    const parsed = feedbackInputSchema.safeParse({ kind: "other", message: "ok" });
    expect(parsed.success && parsed.data.page).toBeNull();
  });

  it("ogranicza długość", () => {
    expect(feedbackInputSchema.safeParse({ kind: "idea", message: "a".repeat(2001) }).success).toBe(false);
    expect(feedbackInputSchema.safeParse({ kind: "idea", message: "a".repeat(2000) }).success).toBe(true);
  });
});
