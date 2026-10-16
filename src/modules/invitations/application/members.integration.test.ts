import { beforeAll, describe, expect, it } from "vitest";
import { createOrganization } from "@/modules/core/application/create-organization";
import type { EmailMessage } from "@/modules/notifications";
import type { RequestContext } from "@/shared/context";
import { adminClient, contextFor, createTestUser, type TestUser } from "@/shared/testing/supabase-test";
import {
  acceptMemberInvitation,
  createMemberInvitation,
  getTeam,
  lookupMemberInvitation,
  revokeMemberInvitation,
} from "./members";

let owner: TestUser;
let admin: TestUser;
let assistant: TestUser;
let newTrainer: TestUser;
let wrongPerson: TestUser;
let otherOwner: TestUser;
let orgA: string;
let orgB: string;
let ownerCtx: RequestContext;

const sent: EmailMessage[] = [];
const okEmail = {
  send: async (message: EmailMessage) => {
    sent.push(message);
    return { status: "sent" as const };
  },
};
const brokenEmail = {
  send: async () => {
    throw new Error("smtp down");
  },
};

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

const tokenFrom = (link: string) => link.split("/join/")[1];

beforeAll(async () => {
  [owner, admin, assistant, newTrainer, wrongPerson, otherOwner] = await Promise.all([
    createTestUser("mb-owner"),
    createTestUser("mb-admin"),
    createTestUser("mb-assistant"),
    createTestUser("mb-new"),
    createTestUser("mb-wrong"),
    createTestUser("mb-other"),
  ]);
  orgA = value(await createOrganization(owner.db, { name: "Szkoła Zespołu" }));
  orgB = value(await createOrganization(otherOwner.db, { name: "Inna Szkoła" }));
  ownerCtx = contextFor(owner, orgA, "owner");

  await adminClient().from("organization_members").insert([
    { organization_id: orgA, user_id: admin.id, role: "admin" },
    { organization_id: orgA, user_id: assistant.id, role: "assistant" },
  ]);
});

describe("zaproszenia do zespołu", () => {
  let token: string;

  it("właściciel zaprasza trenera: link /join, e-mail wysłany, w bazie tylko skrót", async () => {
    const created = value(await createMemberInvitation(ownerCtx, { email: ` ${newTrainer.email.toUpperCase()} `, role: "trainer" }, okEmail));

    expect(created.link).toMatch(/^http:\/\/localhost:3000\/join\/[A-Za-z0-9_-]{43}$/);
    expect(created.emailSent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(newTrainer.email.toLowerCase());
    expect(sent[0].text).toContain(created.link);
    expect(sent[0].subject).toContain("Szkoła Zespołu");

    token = tokenFrom(created.link);
    const row = await adminClient().from("invitations").select("token_hash, email, role, code_hash").eq("id", created.invitationId).single();
    expect(row.data).toMatchObject({ email: newTrainer.email.toLowerCase(), role: "trainer", code_hash: null });
    expect(JSON.stringify(row.data)).not.toContain(token);
  });

  it("niepowodzenie wysyłki e-maila nie psuje zaproszenia", async () => {
    const created = value(await createMemberInvitation(ownerCtx, { email: "ktos@example.test", role: "assistant" }, brokenEmail));
    expect(created.emailSent).toBe(false);
    expect(created.link).toContain("/join/");
  });

  it("walidacja i uprawnienia: rola właściciela, zły e-mail, administrator nie nadaje administratora, asystent nie zaprasza", async () => {
    const owners = await createMemberInvitation(ownerCtx, { email: "x@example.test", role: "owner" }, okEmail);
    expect(owners.ok).toBe(false);

    const badMail = await createMemberInvitation(ownerCtx, { email: "nie-email", role: "trainer" }, okEmail);
    expect(badMail.ok).toBe(false);
    if (!badMail.ok) expect(badMail.error.details).toMatchObject({ email: expect.any(Array) });

    const adminCtx = contextFor(admin, orgA, "admin");
    expect((await createMemberInvitation(adminCtx, { email: "a@example.test", role: "trainer" }, okEmail)).ok).toBe(true);
    const adminInvitesAdmin = await createMemberInvitation(adminCtx, { email: "b@example.test", role: "admin" }, okEmail);
    expect(adminInvitesAdmin.ok).toBe(false);
    if (!adminInvitesAdmin.ok) expect(adminInvitesAdmin.error.code).toBe("forbidden");

    const asAssistant = await createMemberInvitation(contextFor(assistant, orgA, "assistant"), { email: "c@example.test", role: "assistant" }, okEmail);
    expect(asAssistant.ok).toBe(false);
    if (!asAssistant.ok) expect(asAssistant.error.code).toBe("forbidden");

    const existing = await createMemberInvitation(ownerCtx, { email: admin.email, role: "trainer" }, okEmail);
    expect(existing.ok).toBe(false);
    if (!existing.ok) expect(existing.error.details).toMatchObject({ reason: "already_member" });
  });

  it("publiczny podgląd pokazuje organizację i rolę, ale tylko zamaskowany adres", async () => {
    const preview = value(await lookupMemberInvitation(wrongPerson.db, token, newTrainer.email));
    expect(preview).toMatchObject({ status: "valid", organizationName: "Szkoła Zespołu", role: "trainer", emailMatches: true });
    if (preview.status === "valid") expect(preview.emailHint).toMatch(/^m\*\*\*@example\.test$/);

    const mismatch = value(await lookupMemberInvitation(wrongPerson.db, token, "inny@example.test"));
    expect(mismatch).toMatchObject({ status: "valid", emailMatches: false });

    expect(value(await lookupMemberInvitation(wrongPerson.db, "a".repeat(43)))).toEqual({ status: "not_found" });
    expect((await lookupMemberInvitation(wrongPerson.db, "krótki")).ok).toBe(false);
  });

  it("tylko konto z właściwym adresem przyjmuje zaproszenie, i to raz", async () => {
    const wrong = await acceptMemberInvitation(wrongPerson.db, token);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.details).toMatchObject({ reason: "email_mismatch" });

    expect(value(await acceptMemberInvitation(newTrainer.db, token))).toMatchObject({ organizationId: orgA, role: "trainer" });

    const { data } = await adminClient().from("organization_members").select("role, status").eq("organization_id", orgA).eq("user_id", newTrainer.id).single();
    expect(data).toEqual({ role: "trainer", status: "active" });

    const again = await acceptMemberInvitation(newTrainer.db, token);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.details).toMatchObject({ reason: "invitation_unusable" });
    expect(value(await lookupMemberInvitation(newTrainer.db, token))).toEqual({ status: "used" });
  });

  it("nowy trener widzi zespół, ale nie zaproszenia i nie może zapraszać", async () => {
    const trainerCtx = contextFor(newTrainer, orgA, "trainer");
    const team = value(await getTeam(trainerCtx));
    expect(team.members.map((m) => m.role).sort()).toEqual(["admin", "assistant", "owner", "trainer"]);
    expect(team.members.find((m) => m.isYou)?.role).toBe("trainer");
    expect(team.pending).toEqual([]);

    const invite = await createMemberInvitation(trainerCtx, { email: "d@example.test", role: "assistant" }, okEmail);
    expect(invite.ok).toBe(false);
  });

  it("właściciel widzi oczekujące zaproszenia i je odwołuje; obca organizacja nie może", async () => {
    const team = value(await getTeam(ownerCtx));
    const pending = team.pending.find((p) => p.email === "ktos@example.test");
    expect(pending).toMatchObject({ role: "assistant", expired: false });

    const foreign = await revokeMemberInvitation(contextFor(otherOwner, orgB, "owner"), pending!.id);
    expect(foreign.ok).toBe(false);

    value(await revokeMemberInvitation(ownerCtx, pending!.id));
    expect(value(await getTeam(ownerCtx)).pending.find((p) => p.email === "ktos@example.test")).toBeUndefined();

    const again = await revokeMemberInvitation(ownerCtx, pending!.id);
    expect(again.ok).toBe(false);
  });

  it("nowe zaproszenie na ten sam adres unieważnia poprzednie", async () => {
    const first = value(await createMemberInvitation(ownerCtx, { email: "powtorka@example.test", role: "assistant" }, okEmail));
    const second = value(await createMemberInvitation(ownerCtx, { email: "powtorka@example.test", role: "trainer" }, okEmail));

    expect(value(await lookupMemberInvitation(wrongPerson.db, tokenFrom(first.link)))).toEqual({ status: "revoked" });
    expect(value(await lookupMemberInvitation(wrongPerson.db, tokenFrom(second.link)))).toMatchObject({ status: "valid", role: "trainer" });
  });
});
