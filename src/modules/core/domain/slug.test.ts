import { describe, expect, it } from "vitest";
import { slugify, withSuffix } from "./slug";

const VALID = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

describe("slugify", () => {
  it("strips Polish diacritics and punctuation", () => {
    expect(slugify("Szkoła Psów „Łapa”")).toBe("szkola-psow-lapa");
  });

  it("collapses separators and trims dashes", () => {
    expect(slugify("  --Dobry   Pies!! ")).toBe("dobry-pies");
  });

  it("pads names that are too short", () => {
    expect(slugify("A")).toMatch(VALID);
    expect(slugify("!!")).toMatch(VALID);
  });

  it("limits length and stays valid", () => {
    const slug = slugify("x".repeat(100));
    expect(slug).toHaveLength(40);
    expect(slug).toMatch(VALID);
  });
});

describe("withSuffix", () => {
  it("appends a suffix without exceeding the limit", () => {
    const result = withSuffix("x".repeat(40), "ab12");
    expect(result).toHaveLength(40);
    expect(result.endsWith("-ab12")).toBe(true);
    expect(result).toMatch(VALID);
  });
});
