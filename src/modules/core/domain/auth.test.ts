import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "./auth";

describe("signupSchema", () => {
  it("normalizes e-mail and treats an empty name as missing", () => {
    expect(signupSchema.parse({ fullName: "  ", email: " Anna@Example.PL ", password: "dlugie-haslo" })).toEqual({
      fullName: null,
      email: "anna@example.pl",
      password: "dlugie-haslo",
    });
  });

  it("rejects short and too long passwords", () => {
    const short = signupSchema.safeParse({ email: "a@b.pl", password: "krotkie" });
    expect(short.success).toBe(false);
    const long = signupSchema.safeParse({ email: "a@b.pl", password: "x".repeat(PASSWORD_MAX_LENGTH + 1) });
    expect(long.success).toBe(false);
  });

  it("rejects an invalid e-mail", () => {
    const result = signupSchema.safeParse({ email: "nie-email", password: "dlugie-haslo" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["email"]);
  });

  it("does not trim the password", () => {
    expect(signupSchema.parse({ email: "a@b.pl", password: "  spacje  " }).password).toBe("  spacje  ");
  });
});

describe("loginSchema", () => {
  it("requires some password but not a minimum length (old accounts)", () => {
    expect(loginSchema.safeParse({ email: "a@b.pl", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.pl", password: "" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts only a valid e-mail", () => {
    expect(forgotPasswordSchema.safeParse({ email: "x" }).success).toBe(false);
    expect(forgotPasswordSchema.parse({ email: "X@Y.pl" }).email).toBe("x@y.pl");
  });
});

describe("resetPasswordSchema", () => {
  it("requires matching passwords and reports the mismatch on confirmPassword", () => {
    const result = resetPasswordSchema.safeParse({ password: "dlugie-haslo", confirmPassword: "inne-haslo-1" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
  });

  it("accepts matching strong-enough passwords", () => {
    expect(resetPasswordSchema.safeParse({ password: "dlugie-haslo", confirmPassword: "dlugie-haslo" }).success).toBe(true);
  });
});
