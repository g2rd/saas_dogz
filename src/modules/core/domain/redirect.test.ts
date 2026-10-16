import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("keeps paths inside /app, including the query string", () => {
    expect(safeNextPath("/app")).toBe("/app");
    expect(safeNextPath("/app/clients")).toBe("/app/clients");
    expect(safeNextPath("/app/clients?q=anna&archived=1")).toBe("/app/clients?q=anna&archived=1");
  });

  it("drops the fragment", () => {
    expect(safeNextPath("/app/clients#top")).toBe("/app/clients");
  });

  it("falls back for missing or non-string input", () => {
    expect(safeNextPath(undefined)).toBe("/app");
    expect(safeNextPath(null)).toBe("/app");
    expect(safeNextPath("")).toBe("/app");
    expect(safeNextPath(["/app/clients"])).toBe("/app");
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example/app")).toBe("/app");
    expect(safeNextPath("//evil.example")).toBe("/app");
    expect(safeNextPath("//evil.example/app")).toBe("/app");
    expect(safeNextPath("javascript:alert(1)")).toBe("/app");
  });

  it("rejects backslash and whitespace tricks", () => {
    expect(safeNextPath("/\\evil.example")).toBe("/app");
    expect(safeNextPath("/app\\..\\admin")).toBe("/app");
    expect(safeNextPath("/ /evil")).toBe("/app");
    expect(safeNextPath("/app/\tclients")).toBe("/app");
    expect(safeNextPath("/app/\nclients")).toBe("/app");
  });

  it("rejects paths outside the allowed prefix, including traversal", () => {
    expect(safeNextPath("/login")).toBe("/app");
    expect(safeNextPath("/apple")).toBe("/app");
    expect(safeNextPath("/app/../login")).toBe("/app");
    expect(safeNextPath("/app/%2e%2e/login")).toBe("/app");
  });

  it("honors custom prefixes and fallback", () => {
    expect(safeNextPath("/reset-password", ["/app", "/reset-password"])).toBe("/reset-password");
    expect(safeNextPath("/other", ["/app", "/reset-password"], "/")).toBe("/");
  });

  it("rejects overly long input", () => {
    expect(safeNextPath(`/app/${"a".repeat(600)}`)).toBe("/app");
  });
});
