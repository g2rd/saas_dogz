import { describe, expect, it } from "vitest";
import { roleCan } from "./permissions";

describe("roleCan", () => {
  it("only owner manages billing", () => {
    expect(roleCan("owner", "billing.manage")).toBe(true);
    expect(roleCan("admin", "billing.manage")).toBe(false);
    expect(roleCan("trainer", "billing.manage")).toBe(false);
  });

  it("assistant has no access to payments", () => {
    expect(roleCan("assistant", "payments.read")).toBe(false);
    expect(roleCan("assistant", "payments.write")).toBe(false);
    expect(roleCan("assistant", "sessions.write")).toBe(true);
  });

  it("assistant sees dogs but not their private notes", () => {
    expect(roleCan("assistant", "dogs.read")).toBe(true);
    expect(roleCan("assistant", "dogs.write")).toBe(false);
    expect(roleCan("assistant", "dog_notes.read")).toBe(false);
    expect(roleCan("trainer", "dog_notes.write")).toBe(true);
  });

  it("trainer works with clients and payments but cannot manage members", () => {
    expect(roleCan("trainer", "clients.write")).toBe(true);
    expect(roleCan("trainer", "payments.write")).toBe(true);
    expect(roleCan("trainer", "members.manage")).toBe(false);
  });
});
