import { z } from "zod";
import { isRealIsoDate } from "@/shared/dates";
import { emptyToNull, formText } from "@/shared/form";
import { timeInZone } from "@/shared/time";

export type SessionStatus = "scheduled" | "completed" | "canceled";
export type AttendanceStatus = "planned" | "attended" | "canceled" | "late_canceled" | "no_show";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: "Zaplanowane",
  completed: "Odbyte",
  canceled: "Odwołane",
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  planned: "Zaplanowane",
  attended: "Obecny",
  canceled: "Odwołane",
  late_canceled: "Późno odwołane",
  no_show: "Nieobecność",
};

export type Session = {
  id: string;
  sessionTypeId: string;
  typeName: string;
  durationMinutes: number;
  defaultPriceMinor: number;
  currency: string;
  trainerId: string;
  trainerName: string | null;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  status: SessionStatus;
  clientSummary: string | null;
  attendeeId: string | null;
  clientId: string | null;
  clientName: string;
  dogId: string | null;
  dogName: string | null;
  attendance: AttendanceStatus | null;
  clientPackageId: string | null;
};

/** „10:00-11:00” w strefie organizacji. */
export function formatSessionRange(session: Pick<Session, "startsAt" | "endsAt">, timeZone: string): string {
  return `${timeInZone(session.startsAt, timeZone)}–${timeInZone(session.endsAt, timeZone)}`;
}

export const scheduleInputSchema = z.object({
  clientId: z.uuid({ error: "Wybierz klienta" }),
  dogId: z.preprocess(emptyToNull, z.uuid().nullable()),
  sessionTypeId: z.uuid({ error: "Wybierz rodzaj zajęć" }),
  date: z.string({ error: "Podaj datę" }).refine(isRealIsoDate, "Podaj poprawną datę"),
  time: z
    .string({ error: "Podaj godzinę" })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Podaj godzinę w formacie GG:MM"),
  location: formText(200).transform((v) => (v === "" ? null : v)),
  /** Domyślnie zalogowany trener; wskazanie innego jest dla właściciela i administratora. */
  trainerId: z.preprocess(emptyToNull, z.uuid().nullable()),
});

export type ScheduleInput = z.output<typeof scheduleInputSchema>;

const flag = z.preprocess((v) => v === "1" || v === "on" || v === "true" || v === true, z.boolean());

export const completeInputSchema = z.object({
  note: formText(500).transform((v) => (v === "" ? null : v)),
  packageId: z.preprocess(emptyToNull, z.uuid().nullable()),
  /** Rozliczenie bez pakietu: tworzy należność za pojedyncze zajęcia. */
  withoutPackage: flag,
});

export type CompleteInput = z.output<typeof completeInputSchema>;

/** `consume`: "1" nalicza zajęcie, "0" nie; brak wartości oznacza decyzję według polityki organizacji. */
export const cancelInputSchema = z.object({
  consume: z.preprocess(
    (v) => (v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : null),
    z.boolean().nullable(),
  ),
});

export type CancelInput = z.output<typeof cancelInputSchema>;
