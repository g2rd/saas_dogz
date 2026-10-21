import { describe, expect, it } from "vitest";
import {
  activityLevel,
  betaCodeState,
  summarize,
  type BetaCodeRow,
  type OrganizationOverview,
} from "./overview";

const now = new Date("2026-11-10T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

function org(overrides: Partial<OrganizationOverview> = {}): OrganizationOverview {
  return {
    id: "o1",
    name: "Szkoła",
    slug: "szkola",
    status: "trial",
    accessUntil: null,
    statusReason: null,
    createdAt: daysAgo(30),
    ownerEmail: "a@example.pl",
    ownerName: "Anna",
    staffCount: 1,
    activeStaff7d: 1,
    clientsCount: 10,
    newClients7d: 2,
    portalClientsCount: 4,
    sessions7d: 6,
    sessions30d: 20,
    lastSignInAt: daysAgo(1),
    lastActivityAt: daysAgo(1),
    notifications30d: 12,
    pushDevices: 1,
    notes: null,
    ...overrides,
  };
}

describe("activityLevel", () => {
  it("rozróżnia aktywną, cichą i nieaktywną szkołę oraz brak logowań", () => {
    expect(activityLevel(daysAgo(2), now)).toBe("active");
    expect(activityLevel(daysAgo(7), now)).toBe("active");
    expect(activityLevel(daysAgo(10), now)).toBe("quiet");
    expect(activityLevel(daysAgo(20), now)).toBe("inactive");
    expect(activityLevel(null, now)).toBe("never");
  });
});

describe("summarize", () => {
  it("sumuje metryki, liczy statusy i szkoły wymagające uwagi", () => {
    const summary = summarize(
      [
        org({ id: "a" }),
        org({ id: "b", status: "active", staffCount: 3, activeStaff7d: 2, lastSignInAt: daysAgo(10), accessUntil: inDays(3) }),
        org({ id: "c", status: "suspended", lastSignInAt: daysAgo(40), accessUntil: inDays(2) }),
        org({ id: "d", status: "read_only", lastSignInAt: null }),
      ],
      now,
    );
    expect(summary.organizations).toBe(4);
    expect(summary.byStatus).toMatchObject({ trial: 1, active: 1, suspended: 1, read_only: 1 });
    expect(summary.activeOrganizations7d).toBe(1);
    expect(summary.staffTotal).toBe(6);
    expect(summary.activeStaff7d).toBe(5);
    expect(summary.clientsTotal).toBe(40);
    expect(summary.sessions7d).toBe(24);
    // Termin mija tylko w szkole „b” (zawieszona „c” już nie jest zagrożona wygaśnięciem)
    expect(summary.expiringSoon).toBe(1);
    // Do przypomnienia: tylko szkoły z dostępem, które nie logowały się od ponad 7 dni
    expect(summary.needAttention).toBe(1);
  });

  it("dla pustej listy zwraca zera", () => {
    expect(summarize([], now)).toMatchObject({ organizations: 0, staffTotal: 0, needAttention: 0 });
  });
});

describe("betaCodeState", () => {
  const base: BetaCodeRow = {
    id: "c1",
    label: "Anna K.",
    maxUses: 1,
    usedCount: 0,
    expiresAt: null,
    revokedAt: null,
    createdAt: now,
  };

  it("rozpoznaje stan kodu", () => {
    expect(betaCodeState(base, now)).toBe("available");
    expect(betaCodeState({ ...base, usedCount: 1 }, now)).toBe("used");
    expect(betaCodeState({ ...base, expiresAt: daysAgo(1) }, now)).toBe("expired");
    expect(betaCodeState({ ...base, expiresAt: inDays(1) }, now)).toBe("available");
    expect(betaCodeState({ ...base, revokedAt: daysAgo(1), usedCount: 1 }, now)).toBe("revoked");
  });
});
