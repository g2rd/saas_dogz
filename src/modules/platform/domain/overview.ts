/** Status szkoły ustawiany przez właściciela platformy. */
export const ORG_STATUSES = ["trial", "active", "read_only", "suspended"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number] | "archived";

export const STATUS_LABELS: Record<OrgStatus, string> = {
  trial: "Okres próbny",
  active: "Aktywna",
  read_only: "Tylko do odczytu",
  suspended: "Zawieszona",
  archived: "Zarchiwizowana",
};

export const STATUS_DESCRIPTIONS: Record<OrgStatus, string> = {
  trial: "Pełny dostęp na czas testów. Po terminie przechodzi w tryb tylko do odczytu.",
  active: "Pełny dostęp (opłacony lub przyznany).",
  read_only: "Trener widzi dane, ale nie może ich zmieniać. Klienci widzą panel bez możliwości zapisu.",
  suspended: "Brak dostępu dla trenerów i klientów. Dane zostają w bazie.",
  archived: "Szkoła wyłączona.",
};

/** Jedna szkoła w przeglądzie właściciela (metryki bez danych osobowych klientów). */
export type OrganizationOverview = {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  accessUntil: Date | null;
  statusReason: string | null;
  createdAt: Date;
  ownerEmail: string | null;
  ownerName: string | null;
  staffCount: number;
  activeStaff7d: number;
  clientsCount: number;
  newClients7d: number;
  portalClientsCount: number;
  sessions7d: number;
  sessions30d: number;
  lastSignInAt: Date | null;
  lastActivityAt: Date | null;
  notifications30d: number;
  pushDevices: number;
  notes: string | null;
};

export type ActivityLevel = "active" | "quiet" | "inactive" | "never";

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  active: "Aktywna",
  quiet: "Cicho (7-14 dni)",
  inactive: "Nieaktywna (ponad 14 dni)",
  never: "Nigdy się nie logowano",
};

const DAY_MS = 86_400_000;

/** Aktywność szkoły według ostatniego logowania personelu. */
export function activityLevel(lastSignInAt: Date | null, now: Date): ActivityLevel {
  if (!lastSignInAt) return "never";
  const days = (now.getTime() - lastSignInAt.getTime()) / DAY_MS;
  if (days <= 7) return "active";
  if (days <= 14) return "quiet";
  return "inactive";
}

export type PlatformSummary = {
  organizations: number;
  byStatus: Record<OrgStatus, number>;
  /** Szkoły, w których ktoś z personelu logował się w ostatnich 7 dniach. */
  activeOrganizations7d: number;
  /** Konta personelu (trenerzy, asystenci) łącznie i aktywne w ostatnich 7 dniach. */
  staffTotal: number;
  activeStaff7d: number;
  clientsTotal: number;
  portalClientsTotal: number;
  sessions7d: number;
  /** Szkoły z terminem dostępu, który mija w ciągu 7 dni (jeszcze nie zablokowane). */
  expiringSoon: number;
  /** Szkoły bez logowania od ponad 7 dni: kandydaci do przypomnienia. */
  needAttention: number;
};

export function summarize(rows: OrganizationOverview[], now: Date): PlatformSummary {
  const byStatus: Record<OrgStatus, number> = { trial: 0, active: 0, read_only: 0, suspended: 0, archived: 0 };
  let activeOrganizations7d = 0;
  let staffTotal = 0;
  let activeStaff7d = 0;
  let clientsTotal = 0;
  let portalClientsTotal = 0;
  let sessions7d = 0;
  let expiringSoon = 0;
  let needAttention = 0;

  for (const row of rows) {
    byStatus[row.status] += 1;
    const live = row.status === "trial" || row.status === "active";
    const level = activityLevel(row.lastSignInAt, now);
    if (level === "active") activeOrganizations7d += 1;
    if (live && level !== "active") needAttention += 1;
    staffTotal += row.staffCount;
    activeStaff7d += row.activeStaff7d;
    clientsTotal += row.clientsCount;
    portalClientsTotal += row.portalClientsCount;
    sessions7d += row.sessions7d;
    if (live && row.accessUntil) {
      const days = (row.accessUntil.getTime() - now.getTime()) / DAY_MS;
      if (days >= 0 && days <= 7) expiringSoon += 1;
    }
  }

  return {
    organizations: rows.length,
    byStatus,
    activeOrganizations7d,
    staffTotal,
    activeStaff7d,
    clientsTotal,
    portalClientsTotal,
    sessions7d,
    expiringSoon,
    needAttention,
  };
}

/** Kod beta w panelu właściciela (sam kod pokazujemy tylko raz, przy utworzeniu). */
export type BetaCodeRow = {
  id: string;
  label: string;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type BetaCodeState = "available" | "used" | "expired" | "revoked";

export const BETA_CODE_STATE_LABELS: Record<BetaCodeState, string> = {
  available: "Dostępny",
  used: "Wykorzystany",
  expired: "Wygasł",
  revoked: "Unieważniony",
};

export function betaCodeState(code: BetaCodeRow, now: Date): BetaCodeState {
  if (code.revokedAt) return "revoked";
  if (code.usedCount >= code.maxUses) return "used";
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) return "expired";
  return "available";
}

/** Wpis historii zmian szkoły (zmiany statusu, wygaśnięcie dostępu). */
export type StatusHistoryEntry = {
  id: string;
  action: string;
  at: Date;
  from: string | null;
  to: string | null;
  reason: string | null;
};
