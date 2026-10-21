import { z } from "zod";
import { isRealIsoDate } from "@/shared/dates";
import { emptyToNull, formAmountMinor, formText } from "@/shared/form";
import { msg } from "@/shared/i18n/messages";

export const PAYMENT_METHODS = ["cash", "transfer", "blik", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Gotówka",
  transfer: "Przelew",
  blik: "BLIK",
  card: "Karta",
  other: "Inne",
};

export type Payment = {
  id: string;
  clientId: string;
  amountMinor: number;
  currency: string;
  paidAt: Date;
  method: PaymentMethod;
  reference: string | null;
  /** Wpłata anulowana (storno); zostaje w historii, ale nie liczy się do salda. */
  voidedAt: Date | null;
};

export type Charge = {
  id: string;
  clientId: string;
  sourceType: "client_package" | "session" | "manual";
  sourceId: string | null;
  amountMinor: number;
  allocatedMinor: number;
  currency: string;
  dueDate: string;
  description: string;
  voidedAt: Date | null;
  createdAt: Date;
};

export type ClientBalance = {
  clientId: string;
  chargedMinor: number;
  allocatedMinor: number;
  paidMinor: number;
};

/** Do zapłaty: należności minus to, co na nie rozliczono. */
export function owedMinor(balance: ClientBalance): number {
  return Math.max(balance.chargedMinor - balance.allocatedMinor, 0);
}

/** Nadpłata: wpłaty, które nie pokryły żadnej należności. */
export function creditMinor(balance: ClientBalance): number {
  return Math.max(balance.paidMinor - balance.allocatedMinor, 0);
}

export const paymentInputSchema = z.object({
  clientId: z.uuid(),
  amount: formAmountMinor().refine((v) => v > 0, msg("validation.amount_positive")),
  method: z.enum(PAYMENT_METHODS, msg("validation.choose_payment_method")),
  paidAt: z.preprocess(
    emptyToNull,
    z.string().refine(isRealIsoDate, msg("validation.invalid_date")).nullable(),
  ),
  reference: formText(200).transform((v) => (v === "" ? null : v)),
  /** Gdy podane, wpłata trafia tylko na tę należność (reszta to nadpłata). */
  chargeId: z.preprocess(emptyToNull, z.uuid().nullable()),
});

export type PaymentInput = z.output<typeof paymentInputSchema>;

/** Data wpłaty (YYYY-MM-DD) jako moment w południe UTC, żeby nie przeskakiwała doby między strefami. */
export function paidAtFromDate(date: string): string {
  return `${date}T12:00:00.000Z`;
}
