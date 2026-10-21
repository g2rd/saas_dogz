import { z } from "zod";
import { msg } from "@/shared/i18n/messages";

export const FEEDBACK_KINDS = ["problem", "idea", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_MAX_LENGTH = 2000;

/** Ekran, z którego wysłano zgłoszenie: tylko ścieżka (bez zapytania i fragmentu, które mogłyby nieść dane osobowe). */
export function sanitizePage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.trim().split(/[?#]/)[0];
  return path.startsWith("/") && !path.startsWith("//") ? path.slice(0, 200) : null;
}

export const feedbackInputSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS, { error: msg("validation.choose_answer") }),
  message: z.preprocess(
    (v) => (v == null ? "" : v),
    z
      .string()
      .trim()
      .min(1, msg("validation.message_required"))
      .max(FEEDBACK_MAX_LENGTH, msg("validation.max_length", { max: FEEDBACK_MAX_LENGTH })),
  ),
  page: z.preprocess(sanitizePage, z.string().nullable()),
});
export type FeedbackInput = z.output<typeof feedbackInputSchema>;

/** Kto wysyła: personel szkoły albo klient w panelu klienta. */
export type FeedbackAudience = "staff" | "client";
