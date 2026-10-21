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
    .min(PASSWORD_MIN_LENGTH, msg("validation.password_min", { min: PASSWORD_MIN_LENGTH }))
    .max(PASSWORD_MAX_LENGTH, msg("validation.password_max", { max: PASSWORD_MAX_LENGTH })),
);

export const loginSchema = z.object({
  email,
  password: z.preprocess((v) => (v == null ? "" : v), z.string().min(1, msg("validation.password_required"))),
});

/** Pole wyboru z formularza (`on` po zaznaczeniu): zgoda na regulamin testów i politykę prywatności jest wymagana do rejestracji. */
const acceptTerms = z.preprocess(
  (v) => v === "on" || v === "true" || v === true,
  z.literal(true, { error: msg("validation.accept_terms") }),
);

export const signupSchema = z.object({
  fullName: formText(100).transform((v) => (v === "" ? null : v)),
  email,
  password: newPassword,
  acceptTerms,
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
