import { z } from "zod";
import { emptyToNull, formText } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";

/** Token stałego linku szkoły: 256 bitów w base64url (43 znaki); krótsze lub z innymi znakami to na pewno nie nasz link. */
export const SCHOOL_JOIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

export const JOIN_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUSES)[number];

/** Dane z formularza prośby o dołączenie (osoba jest już zalogowana; e-mail bierze baza z konta). */
export const joinRequestInputSchema = z.object({
  token: z.string().regex(SCHOOL_JOIN_TOKEN_PATTERN, msg("errors.db.not_found")),
  firstName: z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().min(1, msg("validation.first_name_required")).max(100, msg("validation.max_length", { max: 100 })),
  ),
  lastName: formText(100),
  phone: formText(40),
  note: formText(500).transform((v) => v || null),
});

export type JoinRequestInput = z.output<typeof joinRequestInputSchema>;

/** Decyzja trenera: akceptacja (nowa kartoteka albo istniejąca) lub odrzucenie. */
export const decideJoinRequestInputSchema = z.object({
  requestId: z.uuid(),
  approve: z.boolean(),
  clientId: z.preprocess(emptyToNull, z.uuid().nullable()).default(null),
});

export type JoinRequest = {
  id: string;
  organizationName: string;
  status: JoinRequestStatus;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  clientId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

/** Stały link szkoły: adres do wydruku i kod QR (SVG). */
export type SchoolJoinLink = { link: string; qrSvg: string };
