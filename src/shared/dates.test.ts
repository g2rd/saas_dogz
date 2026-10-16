import { describe, expect, it } from "vitest";
import { addDaysIso, daysBetween, formatIsoDate, isRealIsoDate, isoDate } from "./dates";

describe("isRealIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isRealIsoDate("2026-10-16")).toBe(true);
    expect(isRealIsoDate("2024-02-29")).toBe(true);
    expect(isRealIsoDate("2026-02-29")).toBe(false);
    expect(isRealIsoDate("2026-13-01")).toBe(false);
    expect(isRealIsoDate("16.10.2026")).toBe(false);
  });
});

describe("addDaysIso", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysIso("2026-10-16", 14)).toBe("2026-10-30");
    expect(addDaysIso("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDaysIso("2024-02-28", 2)).toBe("2024-03-01");
  });
});

describe("formatIsoDate and daysBetween", () => {
  it("formats in Polish order and leaves invalid input untouched", () => {
    expect(formatIsoDate("2026-10-16")).toBe("16.10.2026");
    expect(formatIsoDate("nie-data")).toBe("nie-data");
  });

  it("counts whole days, also across a DST change", () => {
    expect(daysBetween("2026-10-16", "2026-10-23")).toBe(7);
    expect(daysBetween("2026-10-16", "2026-10-15")).toBe(-1);
    expect(daysBetween("2026-10-20", "2026-10-30")).toBe(10);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("isoDate", () => {
  it("formats in UTC", () => {
    expect(isoDate(new Date("2026-10-16T23:30:00Z"))).toBe("2026-10-16");
  });
});
