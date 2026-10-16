import type { ApprovalStatus, DogSex } from "@/modules/dogs";
import type { PackageStatus } from "@/modules/packages";
import type { ChargeStatus, PaymentMethod } from "@/modules/payments";
import type { SessionStatus } from "@/modules/scheduling";

/** Widoki danych klienta w panelu `/portal` (model do odczytu, bez uprawnień personelu). */
export type PortalPackage = {
  id: string;
  name: string;
  sessionsTotal: number;
  balance: number;
  validUntil: string | null;
  priceMinor: number;
  currency: string;
  status: PackageStatus;
  /** Zostały 1-2 zajęcia z aktywnego pakietu. */
  low: boolean;
};

export type PortalCharge = {
  id: string;
  description: string;
  amountMinor: number;
  remainingMinor: number;
  currency: string;
  dueDate: string;
  status: ChargeStatus;
};

export type PortalPayment = {
  id: string;
  amountMinor: number;
  currency: string;
  paidAt: Date;
  method: PaymentMethod;
};

export type PortalSession = {
  id: string;
  typeName: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  dogName: string | null;
  status: SessionStatus;
};

export type PortalDog = {
  id: string;
  name: string;
  breed: string | null;
  birthDate: string | null;
  sex: DogSex;
  approvalStatus: ApprovalStatus;
};

export type PortalOverview = {
  organizationName: string;
  clientFirstName: string;
  timezone: string;
  /** Dzisiejsza data w strefie organizacji (YYYY-MM-DD). */
  today: string;
  packages: PortalPackage[];
  /** Pakiety z 1-2 pozostałymi zajęciami. */
  lowBalance: PortalPackage[];
  /** Najpilniejsza otwarta należność: po terminie najpierw, potem najbliższy termin. */
  nextCharge: PortalCharge | null;
  owedMinor: number;
  currency: string;
  upcoming: PortalSession[];
  pendingDogs: number;
};

/** Najpilniejsza otwarta należność: zaległe przed bieżącymi, w obrębie grupy najwcześniejszy termin. */
export function pickNextCharge(charges: readonly PortalCharge[]): PortalCharge | null {
  const open = charges.filter((c) => c.remainingMinor > 0 && c.status !== "void" && c.status !== "paid");
  if (open.length === 0) return null;
  const rank = (c: PortalCharge) => (c.status === "overdue" ? 0 : 1);
  return [...open].sort((a, b) => rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate))[0];
}
