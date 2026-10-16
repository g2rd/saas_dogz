import { describe, expect, it } from "vitest";
import { isLateCancellation, shouldConsumeOnCancel } from "./cancellation";
import {
  cancelInputSchema,
  completeInputSchema,
  formatSessionRange,
  scheduleInputSchema,
} from "./session";
import { sessionTypeInputSchema } from "./session-type";

const CLIENT = "10000000-0000-4000-8000-000000000001";
const TYPE = "40000000-0000-4000-8000-000000000001";

describe("sessionTypeInputSchema", () => {
  it("parses duration and price from form strings", () => {
    expect(sessionTypeInputSchema.parse({ name: " Trening ", durationMinutes: "60", defaultPrice: "100,50" })).toEqual({
      name: "Trening",
      durationMinutes: 60,
      defaultPriceMinor: 10050,
    });
  });

  it("rejects out-of-range duration and bad price", () => {
    expect(sessionTypeInputSchema.safeParse({ name: "X", durationMinutes: "3", defaultPrice: "0" }).success).toBe(false);
    expect(sessionTypeInputSchema.safeParse({ name: "X", durationMinutes: "500", defaultPrice: "0" }).success).toBe(false);
    expect(sessionTypeInputSchema.safeParse({ name: "X", durationMinutes: "60", defaultPrice: "abc" }).success).toBe(false);
    expect(sessionTypeInputSchema.safeParse({ name: "", durationMinutes: "60", defaultPrice: "0" }).success).toBe(false);
  });
});

describe("scheduleInputSchema", () => {
  const base = { clientId: CLIENT, sessionTypeId: TYPE, date: "2026-10-20", time: "17:30" };

  it("accepts a minimal session and normalizes optional fields", () => {
    expect(scheduleInputSchema.parse({ ...base, dogId: "", location: "  ", trainerId: "" })).toEqual({
      ...base,
      dogId: null,
      location: null,
      trainerId: null,
    });
  });

  it("rejects bad time, bad date and missing ids with field paths", () => {
    const result = scheduleInputSchema.safeParse({ clientId: "", sessionTypeId: "", date: "2026-02-31", time: "9:5" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["clientId", "sessionTypeId", "date", "time"]));
    }
  });
});

describe("completeInputSchema", () => {
  it("defaults to settling from a package, without a note", () => {
    expect(completeInputSchema.parse({})).toEqual({ note: null, packageId: null, withoutPackage: false });
  });

  it("reads the without-package flag and a note", () => {
    expect(completeInputSchema.parse({ note: " Świetnie ", withoutPackage: "1" })).toMatchObject({
      note: "Świetnie",
      withoutPackage: true,
    });
  });
});

describe("cancelInputSchema", () => {
  it("is tri-state: policy decides when the value is missing", () => {
    expect(cancelInputSchema.parse({}).consume).toBeNull();
    expect(cancelInputSchema.parse({ consume: "1" }).consume).toBe(true);
    expect(cancelInputSchema.parse({ consume: "0" }).consume).toBe(false);
  });
});

describe("cancellation policy", () => {
  const startsAt = new Date("2026-10-20T15:00:00Z");

  it("is late when fewer than the configured hours remain", () => {
    expect(isLateCancellation(startsAt, new Date("2026-10-20T00:00:00Z"), 24)).toBe(true);
    expect(isLateCancellation(startsAt, new Date("2026-10-19T14:59:00Z"), 24)).toBe(false);
    expect(isLateCancellation(startsAt, new Date("2026-10-19T15:00:00Z"), 24)).toBe(false);
  });

  it("consumes a session only when the organization policy says so", () => {
    const now = new Date("2026-10-20T10:00:00Z");
    expect(shouldConsumeOnCancel(startsAt, now, { lateCancelHours: 24, lateCancelConsumesSession: true })).toBe(true);
    expect(shouldConsumeOnCancel(startsAt, now, { lateCancelHours: 24, lateCancelConsumesSession: false })).toBe(false);
    expect(
      shouldConsumeOnCancel(startsAt, new Date("2026-10-10T10:00:00Z"), { lateCancelHours: 24, lateCancelConsumesSession: true }),
    ).toBe(false);
  });
});

describe("formatSessionRange", () => {
  it("shows start and end in the given time zone", () => {
    expect(
      formatSessionRange(
        { startsAt: new Date("2026-10-20T15:30:00Z"), endsAt: new Date("2026-10-20T16:30:00Z") },
        "Europe/Warsaw",
      ),
    ).toBe("17:30–18:30");
  });
});
