import { z } from "zod";
import { emptyToNull, formText } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";

export const createInvitationInputSchema = z.object({
  clientId: z.uuid(),
  /** Adres, na który konto musi być założone; puste = zaproszenie przekazane osobiście (QR lub kod). */
  email: formText(254)
    .transform((v) => v.toLowerCase())
    .refine((v) => v === "" || z.email().safeParse(v).success, "Niepoprawny adres e-mail")
    .transform((v) => (v === "" ? null : v)),
  /** Pakiet, który klient potwierdza przyjmując zaproszenie. */
  packageId: z.preprocess(emptyToNull, z.uuid().nullable()),
});

export type CreateInvitationInput = z.output<typeof createInvitationInputSchema>;

export type InvitationPackagePreview = {
  name: string;
  sessionsTotal: number;
  priceMinor: number;
  currency: string;
};

/** Publiczny podgląd zaproszenia: dla nieważnego tylko status. */
export type InvitationPreview =
  | {
      status: "valid";
      organizationName: string;
      clientFirstName: string;
      emailRequired: boolean;
      emailHint: string | null;
      /** Wynik porównania z podanym adresem; null, gdy nie podano adresu lub zaproszenie nie ma adresu. */
      emailMatches: boolean | null;
      package: InvitationPackagePreview | null;
      expiresAt: Date;
    }
  | { status: "not_found" | "used" | "revoked" | "expired" };

export type CreatedInvitation = {
  invitationId: string;
  /** Link do wysłania lub zakodowania w QR. */
  link: string;
  /** Krótki kod w formacie `ABCDE-FGHJK`. */
  code: string;
  /** Kod QR jako SVG (zawartość pochodzi z biblioteki, nie od użytkownika). */
  qrSvg: string;
  expiresAt: Date;
};

export type ClientAccessInfo = {
  /** Konta z aktywnym dostępem do panelu tego klienta. */
  accounts: { userId: string; relation: "owner" | "family"; since: Date }[];
  /** Ostatnie zaproszenie, które nie zostało przyjęte ani unieważnione. */
  pending: {
    id: string;
    email: string | null;
    packageName: string | null;
    createdAt: Date;
    expiresAt: Date;
    expired: boolean;
  } | null;
};

export const MEMBER_ROLES = ["admin", "trainer", "assistant"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_ROLE_LABELS: Record<MemberRole | "owner", string> = {
  owner: "Właściciel",
  admin: "Administrator",
  trainer: "Trener",
  assistant: "Asystent",
};

export const createMemberInvitationSchema = z.object({
  email: formText(254)
    .transform((v) => v.toLowerCase())
    .refine((v) => z.email().safeParse(v).success, msg("validation.email")),
  role: z.enum(MEMBER_ROLES, { error: msg("validation.choose_role") }),
});

export type CreatedMemberInvitation = {
  invitationId: string;
  link: string;
  expiresAt: Date;
  /** Czy wiadomość z zaproszeniem została wysłana na podany adres. */
  emailSent: boolean;
};

export type MemberInvitationPreview =
  | {
      status: "valid";
      organizationName: string;
      role: MemberRole;
      emailHint: string;
      emailMatches: boolean | null;
      expiresAt: Date;
    }
  | { status: "not_found" | "used" | "revoked" | "expired" };

export type TeamOverview = {
  members: { userId: string; /** Imię i nazwisko; `null`, gdy osoba go nie podała (UI pokazuje wtedy „Ty” albo „Użytkownik bez imienia”). */ name: string | null; role: MemberRole | "owner"; status: "active" | "suspended"; isYou: boolean }[];
  pending: { id: string; email: string; role: MemberRole; expiresAt: Date; expired: boolean }[];
};
