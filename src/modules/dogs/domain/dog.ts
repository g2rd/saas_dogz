import { z } from "zod";
import { isRealIsoDate } from "@/shared/dates";
import { emptyToNull, formText } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";

export const DOG_SEXES = ["male", "female", "unknown"] as const;
export type DogSex = (typeof DOG_SEXES)[number];

export const DOG_SEX_LABELS: Record<DogSex, string> = {
  male: "Samiec",
  female: "Suka",
  unknown: "Nie podano",
};

export const NOTE_KINDS = ["health", "behavior", "vaccination", "other"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  health: "Zdrowie",
  behavior: "Zachowanie",
  vaccination: "Szczepienie",
  other: "Inne",
};

export type ApprovalStatus = "pending" | "approved" | "rejected";

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "Czeka na zatwierdzenie",
  approved: "Zatwierdzony",
  rejected: "Odrzucony",
};

export type Dog = {
  id: string;
  organizationId: string;
  clientId: string;
  name: string;
  breed: string | null;
  /** Data w formacie YYYY-MM-DD. */
  birthDate: string | null;
  sex: DogSex;
  /** Psy dodane przez klienta czekają na zatwierdzenie trenera i nie wchodzą do pakietów ani zajęć. */
  approvalStatus: ApprovalStatus;
  createdByClient: boolean;
  archivedAt: Date | null;
  createdAt: Date;
};

export type DogNote = {
  id: string;
  dogId: string;
  kind: NoteKind;
  content: string;
  visibleToClient: boolean;
  validUntil: string | null;
  createdAt: Date;
};

/** Wiek w pełnych miesiącach; null, gdy brak daty lub data z przyszłości. */
export function ageInMonths(birthDate: string | null, now: Date): number | null {
  if (!birthDate || !isRealIsoDate(birthDate)) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  let months = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
  if (now.getUTCDate() < d) months -= 1;
  return months < 0 ? null : months;
}

export function formatDogAge(birthDate: string | null, now: Date): string | null {
  const months = ageInMonths(birthDate, now);
  if (months === null) return null;
  if (months < 1) return "poniżej miesiąca";
  if (months < 24) return `${months} mies.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} l.` : `${years} l. ${rest} mies.`;
}

const optionalIsoDate = z.preprocess(
  emptyToNull,
  z.string().refine(isRealIsoDate, msg("validation.invalid_date")).nullable(),
);

export const dogInputSchema = z.object({
  name: z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().min(1, msg("validation.dog_name_required")).max(100, msg("validation.max_length", { max: 100 })),
  ),
  breed: formText(100).transform((v) => (v === "" ? null : v)),
  birthDate: optionalIsoDate.default(null),
  sex: z.enum(DOG_SEXES).default("unknown"),
});

export type DogInput = z.output<typeof dogInputSchema>;

export const dogNoteInputSchema = z.object({
  kind: z.enum(NOTE_KINDS).default("other"),
  content: z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().min(1, msg("validation.note_required")).max(2000, msg("validation.max_length", { max: 2000 })),
  ),
  visibleToClient: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.boolean(),
  ),
  validUntil: optionalIsoDate.default(null),
});

export type DogNoteInput = z.output<typeof dogNoteInputSchema>;
