import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@/modules/clients/application/clients";
import { resolveLandingPath } from "@/modules/core/application/landing";
import { createOrganization } from "@/modules/core/application/create-organization";
import { approveDog, addDog, listOrganizationDogs, listPendingDogs, rejectDog } from "@/modules/dogs/application/dogs";
import { adjustPackage, sellPackage } from "@/modules/packages/application/packages";
import { recordPayment } from "@/modules/payments/application/payments";
import {
  addMyDog,
  getPortalOverview,
  listPortalDogs,
  listPortalPayments,
  listPortalSessions,
} from "@/modules/portal/application/portal";
import { scheduleSession, createSessionType } from "@/modules/scheduling/application/scheduling";
import { systemClock } from "@/shared/clock";
import type { ClientRequestContext, RequestContext } from "@/shared/context";
import { addDaysIso, isoDate } from "@/shared/dates";
import {
  adminClient,
  anonClient,
  contextFor,
  createTestUser,
  type TestUser,
} from "@/shared/testing/supabase-test";
import {
  acceptInvitation,
  createClientInvitation,
  getClientAccessInfo,
  lookupInvitation,
  revokeClientAccess,
} from "./invitations";

let owner: TestUser;
let assistant: TestUser;
let invitee: TestUser;
let stranger: TestUser;
let other: TestUser;
let orgA: string;
let ctx: RequestContext;
let annaId: string;
let piotrId: string;
let dogId: string;
let packageId: string;
let sessionTypeId: string;

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

const portalCtx = (user: TestUser): ClientRequestContext => ({
  userId: user.id,
  organizationId: orgA,
  clientId: annaId,
  db: user.db,
  clock: systemClock,
});

const secretsFromLink = (link: string) => link.split("/invite/")[1];

beforeAll(async () => {
  [owner, assistant, invitee, stranger, other] = await Promise.all([
    createTestUser("iv-owner"),
    createTestUser("iv-assistant"),
    createTestUser("iv-invitee"),
    createTestUser("iv-stranger"),
    createTestUser("iv-other"),
  ]);
  orgA = value(await createOrganization(owner.db, { name: "Szkoła Zaproszeń" }));
  ctx = contextFor(owner, orgA, "owner");

  await adminClient().from("organization_members").insert({ organization_id: orgA, user_id: assistant.id, role: "assistant" });

  annaId = value(await createClient(ctx, { firstName: "Anna", lastName: "Kowalska" })).id;
  piotrId = value(await createClient(ctx, { firstName: "Piotr", lastName: "Nowak" })).id;
  dogId = value(await addDog(ctx, annaId, { name: "Burek" })).id;
  packageId = value(await sellPackage(ctx, { clientId: annaId, name: "Pakiet 5", sessionsCount: "5", price: "400", dueDate: addDaysIso(isoDate(new Date()), 7) }));
  sessionTypeId = value(await createSessionType(ctx, { name: "Trening", durationMinutes: "60", defaultPrice: "100" })).id;
});

describe("creating invitations", () => {
  it("returns a link, a short code and a QR, and stores only hashes", async () => {
    const created = value(await createClientInvitation(ctx, { clientId: annaId, packageId, email: "" }));

    expect(created.link).toMatch(/^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(created.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(created.qrSvg.startsWith("<svg")).toBe(true);
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);

    const row = await adminClient().from("invitations").select("token_hash, code_hash, email").eq("id", created.invitationId).single();
    const token = secretsFromLink(created.link);
    const code = created.code.replace("-", "");
    expect(row.data?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.data?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row.data)).not.toContain(token);
    expect(JSON.stringify(row.data)).not.toContain(code);
    expect(row.data?.email).toBeNull();
  });

  it("shows the pending invitation to the trainer", async () => {
    const info = value(await getClientAccessInfo(ctx, annaId));
    expect(info.accounts).toHaveLength(0);
    expect(info.pending).toMatchObject({ email: null, packageName: "Pakiet 5", expired: false });
  });

  it("is forbidden for the assistant and for other organizations", async () => {
    const asAssistant = await createClientInvitation(contextFor(assistant, orgA, "assistant"), { clientId: annaId });
    expect(asAssistant.ok).toBe(false);
    if (!asAssistant.ok) expect(asAssistant.error.code).toBe("forbidden");

    const tampered = await createClientInvitation(contextFor(other, orgA, "owner"), { clientId: annaId });
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.error.code).toBe("forbidden");
  });

  it("validates the e-mail and rejects an unknown client", async () => {
    const bad = await createClientInvitation(ctx, { clientId: annaId, email: "nie-email" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.details).toMatchObject({ email: expect.any(Array) });

    const unknown = await createClientInvitation(ctx, { clientId: "30000000-0000-4000-8000-000000000001" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("not_found");
  });
});

describe("public lookup", () => {
  it("resolves a token and a code (any case, with or without the hyphen) to the same preview", async () => {
    const created = value(await createClientInvitation(ctx, { clientId: piotrId }));
    const anon = anonClient();

    const byToken = value(await lookupInvitation(anon, secretsFromLink(created.link)));
    expect(byToken).toMatchObject({
      status: "valid",
      organizationName: "Szkoła Zaproszeń",
      clientFirstName: "Piotr",
      emailRequired: true,
      package: null,
    });

    const byCode = value(await lookupInvitation(anon, created.code.toLowerCase()));
    expect(byCode.status).toBe("valid");
    expect((await lookupInvitation(anon, created.code.replace("-", " "))).ok).toBe(true);
  });

  it("rejects malformed secrets without touching the database and reports unknown ones", async () => {
    const anon = anonClient();
    const malformed = await lookupInvitation(anon, "krotki");
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error.code).toBe("validation");

    expect(value(await lookupInvitation(anon, "ABCDE-FGHJK"))).toEqual({ status: "not_found" });
  });

  it("throttles lookups after many failed attempts", async () => {
    const admin = adminClient();
    const marker = new Date().toISOString();
    await admin.from("invitation_lookup_failures").insert(Array.from({ length: 100 }, () => ({})));
    try {
      const result = await lookupInvitation(anonClient(), "ABCDE-FGHJK");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.details).toMatchObject({ reason: "throttled" });
    } finally {
      await admin.from("invitation_lookup_failures").delete().gte("created_at", marker);
    }
  });
});

describe("accepting invitations", () => {
  let link: string;
  let code: string;

  it("binds an invitation to an e-mail and refuses other accounts", async () => {
    const created = value(await createClientInvitation(ctx, { clientId: annaId, packageId, email: invitee.email.toUpperCase() }));
    link = created.link;
    code = created.code;

    const preview = value(await lookupInvitation(anonClient(), code, invitee.email));
    expect(preview).toMatchObject({ status: "valid", emailRequired: false, emailMatches: true });
    if (preview.status === "valid") expect(preview.emailHint).toMatch(/^.\*\*\*@/);

    const wrong = value(await lookupInvitation(anonClient(), code, "ktos-inny@example.test"));
    expect(wrong).toMatchObject({ emailMatches: false });

    const refused = await acceptInvitation(stranger.db, secretsFromLink(link));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.details).toMatchObject({ reason: "email_mismatch" });
  });

  it("gives the right account access to the client's panel, once", async () => {
    const accepted = value(await acceptInvitation(invitee.db, code));
    expect(accepted).toEqual({ clientId: annaId, organizationId: orgA });

    const info = value(await getClientAccessInfo(ctx, annaId));
    expect(info.accounts).toEqual([expect.objectContaining({ userId: invitee.id, relation: "owner" })]);
    expect(info.pending).toBeNull();

    const again = await acceptInvitation(invitee.db, secretsFromLink(link));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.details).toMatchObject({ reason: "invitation_unusable" });

    expect(value(await lookupInvitation(anonClient(), code))).toEqual({ status: "used" });
  });

  it("requires a signed-in user", async () => {
    const result = await acceptInvitation(anonClient(), "ABCDE-FGHJK");
    expect(result.ok).toBe(false);
  });

  it("lets a newer invitation revoke the previous pending one", async () => {
    const first = value(await createClientInvitation(ctx, { clientId: piotrId }));
    const second = value(await createClientInvitation(ctx, { clientId: piotrId }));
    expect(value(await lookupInvitation(anonClient(), first.code))).toEqual({ status: "revoked" });
    expect(value(await lookupInvitation(anonClient(), second.code)).status).toBe("valid");
  });
});

describe("login landing", () => {
  it("sends staff to /app, clients to /portal and brand-new accounts to /app", async () => {
    expect(await resolveLandingPath(owner.db)).toBe("/app");
    expect(await resolveLandingPath(invitee.db)).toBe("/portal");
    expect(await resolveLandingPath(other.db)).toBe("/app");
  });
});

describe("client portal", () => {
  it("shows the package balance, the next payment and upcoming sessions", async () => {
    value(await scheduleSession(ctx, { clientId: annaId, dogId, sessionTypeId, date: addDaysIso(isoDate(new Date()), 3), time: "10:00" }));

    const overview = value(await getPortalOverview(portalCtx(invitee)));
    expect(overview).toMatchObject({
      organizationName: "Szkoła Zaproszeń",
      clientFirstName: "Anna",
      owedMinor: 40000,
      pendingDogs: 0,
    });
    expect(overview.packages).toHaveLength(1);
    expect(overview.packages[0]).toMatchObject({ name: "Pakiet 5", balance: 5, sessionsTotal: 5, status: "active", low: false });
    expect(overview.nextCharge).toMatchObject({ description: "Pakiet 5", remainingMinor: 40000, status: "unpaid" });
    expect(overview.upcoming).toHaveLength(1);
    expect(overview.upcoming[0]).toMatchObject({ typeName: "Trening", dogName: "Burek" });
  });

  it("warns when only the last sessions are left", async () => {
    value(await adjustPackage(ctx, packageId, { delta: "-3", note: "Zajęcia przed aplikacją" }));
    const overview = value(await getPortalOverview(portalCtx(invitee)));
    expect(overview.lowBalance.map((p) => p.balance)).toEqual([2]);
    expect(overview.packages[0].low).toBe(true);
  });

  it("lists payments with status and the history of bookings", async () => {
    value(await recordPayment(ctx, { clientId: annaId, amount: "150", method: "transfer", reference: "zaliczka" }));
    const payments = value(await listPortalPayments(portalCtx(invitee)));
    expect(payments).toMatchObject({ owedMinor: 25000, creditMinor: 0, currency: "PLN" });
    expect(payments.charges[0]).toMatchObject({ amountMinor: 40000, remainingMinor: 25000, status: "partial" });
    expect(payments.payments).toHaveLength(1);
    expect(payments.payments[0]).toMatchObject({ amountMinor: 15000, method: "transfer" });
  });

  it("lists upcoming sessions", async () => {
    const sessions = value(await listPortalSessions(portalCtx(invitee)));
    expect(sessions.timezone).toBe("Europe/Warsaw");
    expect(sessions.upcoming).toHaveLength(1);
    expect(sessions.recent).toHaveLength(0);
  });

  it("never exposes another client's data to this account", async () => {
    const piotr = await invitee.db.from("v_client_package_balance").select("client_id").eq("client_id", piotrId);
    expect(piotr.data ?? []).toHaveLength(0);
    const sessions = await invitee.db.from("v_session_details").select("client_id");
    expect(new Set(sessions.data?.map((s) => s.client_id))).toEqual(new Set([annaId]));
  });
});

describe("dogs added by the client", () => {
  let proposedId: string;

  it("start as pending and are visible to the client and to the trainer's inbox", async () => {
    const dog = value(await addMyDog(portalCtx(invitee), { name: "Rex", breed: "Owczarek", birthDate: "2024-05-01", sex: "male" }));
    proposedId = dog.id;
    expect(dog).toMatchObject({ name: "Rex", approvalStatus: "pending" });

    const mine = value(await listPortalDogs(portalCtx(invitee)));
    expect(mine.map((d) => [d.name, d.approvalStatus])).toEqual([
      ["Burek", "approved"],
      ["Rex", "pending"],
    ]);
    expect(value(await getPortalOverview(portalCtx(invitee))).pendingDogs).toBe(1);

    const pending = value(await listPendingDogs(ctx));
    expect(pending.map((d) => d.id)).toContain(proposedId);
    expect(value(await listOrganizationDogs(ctx)).map((d) => d.id)).not.toContain(proposedId);
  });

  it("cannot be used in sessions until the trainer approves them", async () => {
    const blocked = await scheduleSession(ctx, { clientId: annaId, dogId: proposedId, sessionTypeId, date: addDaysIso(isoDate(new Date()), 5), time: "12:00" });
    expect(blocked.ok).toBe(false);

    value(await approveDog(ctx, proposedId));
    expect(value(await listOrganizationDogs(ctx)).map((d) => d.id)).toContain(proposedId);
    expect(value(await scheduleSession(ctx, { clientId: annaId, dogId: proposedId, sessionTypeId, date: addDaysIso(isoDate(new Date()), 5), time: "12:00" }))).toBeTruthy();
  });

  it("can be rejected once, and a decided dog cannot be reviewed again", async () => {
    const dog = value(await addMyDog(portalCtx(invitee), { name: "Intruz" }));
    expect(value(await rejectDog(ctx, dog.id)).approvalStatus).toBe("rejected");
    const again = await approveDog(ctx, dog.id);
    expect(again.ok).toBe(false);
  });

  it("are validated and cannot be forged for another client or as approved", async () => {
    const invalid = await addMyDog(portalCtx(invitee), { name: "", birthDate: "2999-01-01" });
    expect(invalid.ok).toBe(false);

    const forgedClient = await invitee.db.from("dogs").insert({
      organization_id: orgA,
      client_id: piotrId,
      name: "Cudzy",
      approval_status: "pending",
      created_by_client: true,
      created_by: invitee.id,
    });
    expect(forgedClient.error?.code).toBe("42501");

    const forgedApproved = await invitee.db.from("dogs").insert({
      organization_id: orgA,
      client_id: annaId,
      name: "Zatwierdzony",
      approval_status: "approved",
      created_by_client: true,
      created_by: invitee.id,
    });
    expect(forgedApproved.error?.code).toBe("42501");
  });
});

describe("revoking access", () => {
  it("cuts the account off from the client's data", async () => {
    value(await revokeClientAccess(ctx, annaId, invitee.id));

    const overview = await getPortalOverview(portalCtx(invitee));
    expect(overview.ok).toBe(false);
    expect(await resolveLandingPath(invitee.db)).toBe("/app");

    const info = value(await getClientAccessInfo(ctx, annaId));
    expect(info.accounts).toHaveLength(0);
  });
});
