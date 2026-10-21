import { z } from "zod";
import { formInt, formText } from "@/shared/form";
import { isRealIsoDate } from "@/shared/dates";
import { ORG_STATUSES } from "./overview";

/** Data (RRRR-MM-DD) z formularza; pusty ciąg oznacza brak terminu. */
const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .refine((value) => isRealIsoDate(value), "Podaj poprawną datę")
    .nullable(),
);

export const setStatusSchema = z.object({
  status: z.enum(ORG_STATUSES, { error: "Wybierz status" }),
  reason: formText(500).transform((v) => (v === "" ? null : v)),
  accessUntil: optionalDate,
});
export type SetStatusInput = z.output<typeof setStatusSchema>;

export const extendAccessSchema = z.object({
  days: formInt(1, 365, "Podaj liczbę dni od 1 do 365"),
});

export const notesSchema = z.object({ notes: formText(4000) });

export const createBetaCodeSchema = z.object({
  label: formText(120).refine((v) => v !== "", "Podaj, dla kogo jest kod (np. imię i szkoła)"),
  maxUses: formInt(1, 100, "Liczba użyć od 1 do 100"),
  validDays: formInt(1, 365, "Ważność od 1 do 365 dni"),
});
export type CreateBetaCodeInput = z.output<typeof createBetaCodeSchema>;

export const signupModeSchema = z.object({ mode: z.enum(["open", "closed"], { error: "Wybierz tryb" }) });
