import { z } from "zod";
import { formText } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt (używany przez Supabase Auth) ignoruje bajty powyżej 72.
export const PASSWORD_MAX_LENGTH = 72;

const email = formText(254)
  .transform((v) => v.toLowerCase())
  .pipe(z.email(msg("validation.email")));

const newPassword = z.preprocess(
  (v) => (v == null ? "" : v),
  z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków`)
    .max(PASSWORD_MAX_LENGTH, `Hasło może mieć najwyżej ${PASSWORD_MAX_LENGTH} znaków`),
);

export const loginSchema = z.object({
  email,
  password: z.preprocess((v) => (v == null ? "" : v), z.string().min(1, msg("validation.password_required"))),
});

export const signupSchema = z.object({
  fullName: formText(100).transform((v) => (v === "" ? null : v)),
  email,
  password: newPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.preprocess((v) => (v == null ? "" : v), z.string()),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: msg("validation.password_mismatch"),
    path: ["confirmPassword"],
  });

export type LoginInput = z.output<typeof loginSchema>;
export type SignupInput = z.output<typeof signupSchema>;
