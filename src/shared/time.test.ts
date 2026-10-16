import { describe, expect, it } from "vitest";
import {
  dateInZone,
  dayRange,
  formatDateHeading,
  formatDateHeadingTitle,
  timeInZone,
  zonedDateTimeToUtc,
} from "./time";

const WARSAW = "Europe/Warsaw";

describe("zonedDateTimeToUtc", () => {
  it("converts local summer time (UTC+2) and winter time (UTC+1)", () => {
    expect(zonedDateTimeToUtc("2026-10-16", "17:30", WARSAW)?.toISOString()).toBe("2026-10-16T15:30:00.000Z");
    expect(zonedDateTimeToUtc("2026-12-16", "17:30", WARSAW)?.toISOString()).toBe("2026-12-16T16:30:00.000Z");
  });

  it("rejects malformed dates and times", () => {
    expect(zonedDateTimeToUtc("2026-02-31", "10:00", WARSAW)).toBeNull();
    expect(zonedDateTimeToUtc("2026-10-16", "25:00", WARSAW)).toBeNull();
    expect(zonedDateTimeToUtc("2026-10-16", "9:00", WARSAW)).toBeNull();
    expect(zonedDateTimeToUtc("jutro", "10:00", WARSAW)).toBeNull();
  });
});

describe("formatDateHeading", () => {
  it("formats a calendar date in Polish regardless of the machine time zone", () => {
    expect(formatDateHeading("2026-10-16")).toBe("piątek, 16 października");
    expect(formatDateHeading("2030-06-15")).toBe("sobota, 15 czerwca");
  });

  it("can capitalize only the first letter, leaving the month in lower case", () => {
    expect(formatDateHeadingTitle("2026-10-16")).toBe("Piątek, 16 października");
  });
});

describe("dateInZone and timeInZone", () => {
  it("uses the organization time zone, not UTC", () => {
    const lateEvening = new Date("2026-10-16T22:30:00Z");
    expect(dateInZone(lateEvening, WARSAW)).toBe("2026-10-17");
    expect(timeInZone(lateEvening, WARSAW)).toBe("00:30");
    expect(dateInZone(lateEvening, "UTC")).toBe("2026-10-16");
  });
});

describe("dayRange", () => {
  it("spans 24 hours on a normal day", () => {
    const { from, to } = dayRange("2026-10-16", WARSAW);
    expect(from.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-16T22:00:00.000Z");
  });

  it("is 25 hours long when clocks go back (2026-10-25) and 23 when they go forward (2026-03-29)", () => {
    const back = dayRange("2026-10-25", WARSAW);
    expect((back.to.getTime() - back.from.getTime()) / 3_600_000).toBe(25);
    const forward = dayRange("2026-03-29", WARSAW);
    expect((forward.to.getTime() - forward.from.getTime()) / 3_600_000).toBe(23);
  });
});
