import { describe, expect, it } from "vitest";
import { ageInMonths, dogInputSchema, dogNoteInputSchema, formatDogAge } from "./dog";

const now = new Date("2026-10-16T12:00:00Z");

describe("ageInMonths", () => {
  it("counts full months", () => {
    expect(ageInMonths("2026-09-16", now)).toBe(1);
    expect(ageInMonths("2026-09-17", now)).toBe(0);
    expect(ageInMonths("2024-10-16", now)).toBe(24);
  });

  it("is null for missing, invalid or future dates", () => {
    expect(ageInMonths(null, now)).toBeNull();
    expect(ageInMonths("2026-02-31", now)).toBeNull();
    expect(ageInMonths("2027-01-01", now)).toBeNull();
  });
});

describe("formatDogAge", () => {
  it("formats puppies in months and adults in years", () => {
    expect(formatDogAge("2026-10-10", now)).toBe("poniżej miesiąca");
    expect(formatDogAge("2026-04-16", now)).toBe("6 mies.");
    expect(formatDogAge("2024-10-16", now)).toBe("2 l.");
    expect(formatDogAge("2023-07-01", now)).toBe("3 l. 3 mies.");
    expect(formatDogAge(null, now)).toBeNull();
  });
});

describe("dogInputSchema", () => {
  it("accepts a name only and applies defaults", () => {
    expect(dogInputSchema.parse({ name: " Burek " })).toEqual({
      name: "Burek",
      breed: null,
      birthDate: null,
      sex: "unknown",
    });
  });

  it("parses breed, birth date and sex from form strings", () => {
    expect(
      dogInputSchema.parse({ name: "Luna", breed: "Border collie", birthDate: "2022-05-01", sex: "female" }),
    ).toMatchObject({ breed: "Border collie", birthDate: "2022-05-01", sex: "female" });
  });

  it("treats an empty birth date as missing and rejects an impossible one", () => {
    expect(dogInputSchema.parse({ name: "Rex", birthDate: "" }).birthDate).toBeNull();
    expect(dogInputSchema.safeParse({ name: "Rex", birthDate: "2022-13-40" }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(dogInputSchema.safeParse({ name: "  " }).success).toBe(false);
  });
});

describe("dogNoteInputSchema", () => {
  it("is private by default and reads checkbox values", () => {
    expect(dogNoteInputSchema.parse({ content: "Lęk przed hałasem" }).visibleToClient).toBe(false);
    expect(dogNoteInputSchema.parse({ content: "Szczepienie", visibleToClient: "on" }).visibleToClient).toBe(true);
  });

  it("requires content", () => {
    expect(dogNoteInputSchema.safeParse({ content: "" }).success).toBe(false);
  });
});
