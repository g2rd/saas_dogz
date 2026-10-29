import { z } from "zod";
import { emptyToNull, formText } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";
import { isValidPhone, normalizePhone } from "@/shared/phone";

export const CLIENT_STATUSES = ["lead", "active", "inactive"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  lead: "Zainteresowany",
  active: "Aktywny",
  inactive: "Nieaktywny",
};

export type Client = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  assignedTrainerId: string | null;
  status: ClientStatus;
  archivedAt: Date | null;
  createdAt: Date;
};

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email === "" ? null : email;
}

export { isValidPhone, normalizePhone };

export function clientFullName(client: Pick<Client, "firstName" | "lastName">): string {
  return [client.firstName, client.lastName].filter(Boolean).join(" ");
}

/**
 * Usuwa znaki specjalne filtrów PostgREST (`,` `(` `)` `%` `*` `\` `"`),
 * żeby wyszukiwana fraza nie mogła zmienić struktury zapytania.
 */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Schemat danych klienta; numer bez prefiksu kraju jest liczony jako numer z kraju `phoneCountry` (region użytkownika). */
export const clientInputSchemaFor = (phoneCountry?: string | null) =>
  z.object({
  firstName: z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().min(1, msg("validation.first_name_required")).max(100, msg("validation.max_length", { max: 100 })),
  ),
  lastName: formText(100),
  email: formText(254)
    .transform(normalizeEmail)
    .refine((v) => v === null || z.email().safeParse(v).success, "Niepoprawny adres e-mail"),
  phone: formText(30)
    .transform((v) => normalizePhone(v, phoneCountry))
    .refine((v) => v === null || isValidPhone(v), "Niepoprawny numer telefonu"),
  status: z.enum(CLIENT_STATUSES).default("active"),
  assignedTrainerId: z.preprocess(emptyToNull, z.uuid().nullable()).default(null),
});

export const clientInputSchema = clientInputSchemaFor();

export type ClientInput = z.output<typeof clientInputSchema>;
