import { z } from "zod";
import { formInt, formText } from "@/shared/form";
import { isRealIsoDate } from "@/shared/dates";
import { ORG_STATUSES } from "./overview";
import { msg } from "@/shared/i18n/messages";

/** Data (RRRR-MM-DD) z formularza; pusty ciąg oznacza brak terminu. */
const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .refine((value) => isRealIsoDate(value), msg("validation.enter_valid_date"))
    .nullable(),
);

export const setStatusSchema = z.object({
  status: z.enum(ORG_STATUSES, { error: msg("validation.choose_status") }),
  reason: formText(500).transform((v) => (v === "" ? null : v)),
  accessUntil: optionalDate,
});
export type SetStatusInput = z.output<typeof setStatusSchema>;

export const extendAccessSchema = z.object({
  days: formInt(1, 365, msg("validation.days_range_365")),
});

export const notesSchema = z.object({ notes: formText(4000) });

export const createBetaCodeSchema = z.object({
  label: formText(120).refine((v) => v !== "", msg("validation.beta_label")),
  maxUses: formInt(1, 100, msg("validation.beta_uses")),
  validDays: formInt(1, 365, msg("validation.beta_valid_days")),
});
export type CreateBetaCodeInput = z.output<typeof createBetaCodeSchema>;

export const signupModeSchema = z.object({ mode: z.enum(["open", "closed"], { error: msg("validation.choose_mode") }) });
