import { beforeAll, describe, expect, it } from "vitest";
import { createClient, archiveClient } from "@/modules/clients/application/clients";
import { createOrganization } from "@/modules/core/application/create-organization";
import {
  getClientBalance,
  listClientCharges,
  listClientPayments,
  listOverdueCharges,
  recordPayment,
  voidCharge,
} from "@/modules/payments/application/payments";
import { addDaysIso, isoDate } from "@/shared/dates";
import { adminClient, contextFor, createTestUser, type TestUser } from "@/shared/testing/supabase-test";
import type { RequestContext } from "@/shared/context";
import {
  adjustPackage,
  archiveTemplate,
  createTemplate,
  listClientPackages,
  listLowBalancePackages,
  listPackageLedger,
  listTemplates,
  sellPackage,
  updateTemplate,
} from "./packages";

const today = isoDate(new Date());

let owner: TestUser;
let other: TestUser;
let assistant: TestUser;
let clientUser: TestUser;
let orgA: string;
let ctx: RequestContext;
let clientId: string;
let otherClientId: string;
let templateId: string;
let packageId: string;
let chargeId: string;

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

beforeAll(async () => {
  [owner, other, assistant, clientUser] = await Promise.all([
    createTestUser("pk-owner"),
    createTestUser("pk-other"),
    createTestUser("pk-assistant"),
    createTestUser("pk-client"),
  ]);
  orgA = value(await createOrganization(owner.db, { name: "Szkoła Pakietów" }));
  ctx = contextFor(owner, orgA, "owner");

  clientId = value(await createClient(ctx, { firstName: "Anna", lastName: "Kowalska" })).id;
  otherClientId = value(await createClient(ctx, { firstName: "Piotr", lastName: "Nowak" })).id;

  const admin = adminClient();
  await admin.from("organization_members").insert({ organization_id: orgA, user_id: assistant.id, role: "assistant" });
  await admin
    .from("client_access")
    .insert({ organization_id: orgA, client_id: clientId, user_id: clientUser.id, relation: "owner" });
});

describe("package templates", () => {
  it("creates, lists and updates a template from form strings", async () => {
    const created = await createTemplate(ctx, { name: "Pakiet 10 zajęć", sessionsCount: "10", validityDays: "90", price: "800" });
    templateId = value(created).id;
    expect(value(created)).toMatchObject({ sessionsCount: 10, validityDays: 90, priceMinor: 80000, currency: "PLN" });

    const updated = await updateTemplate(ctx, templateId, { name: "Pakiet 10 zajęć", sessionsCount: "10", validityDays: "120", price: "800,00" });
    expect(value(updated).validityDays).toBe(120);

    expect(value(await listTemplates(ctx)).map((t) => t.id)).toContain(templateId);
  });

  it("returns field errors for invalid templates", async () => {
    const result = await createTemplate(ctx, { name: "", sessionsCount: "0", price: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation");
      expect(result.error.details).toMatchObject({ name: expect.any(Array), sessionsCount: expect.any(Array), price: expect.any(Array) });
    }
  });
});

describe("selling a package", () => {
  it("creates the package, ledger purchase entry and charge atomically", async () => {
    packageId = value(await sellPackage(ctx, { clientId, templateId }));

    const packages = value(await listClientPackages(ctx, clientId));
    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({
      id: packageId,
      name: "Pakiet 10 zajęć",
      sessionsTotal: 10,
      balance: 10,
      status: "active",
      validFrom: today,
      validUntil: addDaysIso(today, 120),
      priceMinor: 80000,
    });

    const ledger = value(await listPackageLedger(ctx, packageId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ delta: 10, reason: "purchase" });

    const charges = value(await listClientCharges(ctx, clientId));
    expect(charges).toHaveLength(1);
    chargeId = charges[0].id;
    expect(charges[0]).toMatchObject({
      amountMinor: 80000,
      remainingMinor: 80000,
      status: "unpaid",
      dueDate: addDaysIso(today, 7),
      sourceType: "client_package",
      sourceId: packageId,
    });
  });

  it("sells a free custom package without creating a charge", async () => {
    const before = value(await listClientCharges(ctx, clientId)).length;
    value(await sellPackage(ctx, { clientId, name: "Zajęcia próbne", sessionsCount: "1", price: "0" }));
    expect(value(await listClientCharges(ctx, clientId))).toHaveLength(before);
    expect(value(await listClientPackages(ctx, clientId))).toHaveLength(2);
  });

  it("validates custom packages and unknown templates", async () => {
    const custom = await sellPackage(ctx, { clientId });
    expect(custom.ok).toBe(false);
    if (!custom.ok) expect(custom.error.details).toMatchObject({ name: expect.any(Array), price: expect.any(Array) });

    const unknown = await sellPackage(ctx, { clientId, templateId: "30000000-0000-4000-8000-000000000001" });
    expect(unknown.ok).toBe(false);
  });

  it("refuses archived templates and archived clients", async () => {
    const tmp = value(await createTemplate(ctx, { name: "Stary", sessionsCount: "5", price: "100" }));
    value(await archiveTemplate(ctx, tmp.id));
    expect(value(await listTemplates(ctx)).some((t) => t.id === tmp.id)).toBe(false);
    expect((await sellPackage(ctx, { clientId, templateId: tmp.id })).ok).toBe(false);

    const gone = value(await createClient(ctx, { firstName: "Archiwalny" }));
    value(await archiveClient(ctx, gone.id));
    const result = await sellPackage(ctx, { clientId: gone.id, name: "X", sessionsCount: "1", price: "10" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_found");
  });
});

describe("recording payments", () => {
  it("allocates a partial payment to the charge", async () => {
    const result = value(await recordPayment(ctx, { clientId, amount: "300", method: "cash" }));
    expect(result).toMatchObject({ allocatedMinor: 30000, unallocatedMinor: 0 });

    const [charge] = value(await listClientCharges(ctx, clientId));
    expect(charge).toMatchObject({ allocatedMinor: 30000, remainingMinor: 50000, status: "partial" });
  });

  it("keeps an overpayment as client credit", async () => {
    const result = value(await recordPayment(ctx, { clientId, amount: "600", method: "transfer", reference: "przelew 16.10" }));
    expect(result).toMatchObject({ allocatedMinor: 50000, unallocatedMinor: 10000 });

    const [charge] = value(await listClientCharges(ctx, clientId));
    expect(charge.status).toBe("paid");

    const balance = value(await getClientBalance(ctx, clientId));
    expect(balance).toMatchObject({ chargedMinor: 80000, allocatedMinor: 80000, paidMinor: 90000 });

    const payments = value(await listClientPayments(ctx, clientId));
    expect(payments).toHaveLength(2);
    expect(payments.find((p) => p.method === "transfer")?.reference).toBe("przelew 16.10");
  });

  it("rejects a payment aimed at a settled charge", async () => {
    const result = await recordPayment(ctx, { clientId, amount: "10", method: "cash", chargeId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details).toMatchObject({ chargeId: expect.any(Array) });
  });

  it("pays the earliest due date first across several charges", async () => {
    // Pakiet 1 (do 800 zł, termin +7) jest opłacony; dwa nowe: późniejszy i wcześniejszy termin.
    value(await sellPackage(ctx, { clientId, name: "Późny", sessionsCount: "4", price: "400", dueDate: addDaysIso(today, 30) }));
    value(await sellPackage(ctx, { clientId, name: "Wczesny", sessionsCount: "4", price: "500", dueDate: addDaysIso(today, 3) }));

    const result = value(await recordPayment(ctx, { clientId, amount: "600", method: "blik" }));
    const charges = value(await listClientCharges(ctx, clientId));
    const early = charges.find((c) => c.description === "Wczesny")!;
    const late = charges.find((c) => c.description === "Późny")!;

    expect(result.allocations).toEqual([
      { chargeId: early.id, amountMinor: 50000 },
      { chargeId: late.id, amountMinor: 10000 },
    ]);
    expect(early.status).toBe("paid");
  });

  it("never over-allocates when many payments race for the same charge", async () => {
    value(await sellPackage(ctx, { clientId: otherClientId, name: "Wyścig", sessionsCount: "2", price: "300" }));
    const target = value(await listClientCharges(ctx, otherClientId)).find((c) => c.description === "Wyścig")!;

    // Sześć równoległych wpłat po 100 zł na należność 300 zł: przejść mogą tylko trzy.
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        recordPayment(ctx, {
          clientId: otherClientId,
          amount: "100",
          method: i % 2 === 0 ? "cash" : "blik",
          chargeId: target.id,
        }),
      ),
    );

    const succeeded = results.filter((r) => r.ok);
    expect(succeeded).toHaveLength(3);
    for (const failed of results.filter((r) => !r.ok)) {
      if (!failed.ok) expect(["conflict", "validation"]).toContain(failed.error.code);
    }

    const after = value(await listClientCharges(ctx, otherClientId)).find((c) => c.id === target.id)!;
    expect(after).toMatchObject({ allocatedMinor: 30000, remainingMinor: 0, status: "paid" });
  });
});

describe("voiding charges", () => {
  it("voids an unpaid charge and drops it from the balance", async () => {
    value(await sellPackage(ctx, { clientId: otherClientId, name: "Pomyłka", sessionsCount: "1", price: "70" }));
    const charges = value(await listClientCharges(ctx, otherClientId));
    const mistake = charges.find((c) => c.description === "Pomyłka")!;

    value(await voidCharge(ctx, mistake.id));
    const after = value(await listClientCharges(ctx, otherClientId)).find((c) => c.id === mistake.id)!;
    expect(after).toMatchObject({ status: "void", remainingMinor: 0 });

    const balance = value(await getClientBalance(ctx, otherClientId));
    // Zostaje tylko należność z testu wyścigu (300 zł); anulowana pomyłka nie wlicza się do salda.
    expect(balance.chargedMinor).toBe(30000);
  });

  it("refuses to void a charge that already has payments", async () => {
    const result = await voidCharge(ctx, chargeId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("conflict");
  });
});

describe("adjustments and reminders", () => {
  it("adjusts the balance through the ledger and refuses to go below zero", async () => {
    value(await adjustPackage(ctx, packageId, { delta: "-1", note: "Zajęcia poza aplikacją" }));
    const [pkg] = value(await listClientPackages(ctx, clientId)).filter((p) => p.id === packageId);
    expect(pkg.balance).toBe(9);

    const ledger = value(await listPackageLedger(ctx, packageId));
    expect(ledger.find((e) => e.reason === "adjustment")).toMatchObject({ delta: -1, note: "Zajęcia poza aplikacją" });

    const tooMuch = await adjustPackage(ctx, packageId, { delta: "-50" });
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.error.details).toMatchObject({ delta: expect.any(Array) });

    expect((await adjustPackage(ctx, packageId, { delta: "0" })).ok).toBe(false);
  });

  it("lists packages that are running out", async () => {
    expect(value(await listLowBalancePackages(ctx)).some((p) => p.id === packageId)).toBe(false);

    value(await adjustPackage(ctx, packageId, { delta: "-7", note: "Zużyto" }));
    const low = value(await listLowBalancePackages(ctx));
    expect(low.find((p) => p.id === packageId)).toMatchObject({ balance: 2, status: "active" });
  });

  it("lists overdue charges", async () => {
    value(await sellPackage(ctx, { clientId: otherClientId, name: "Zaległy", sessionsCount: "1", price: "90", dueDate: addDaysIso(today, -5) }));
    const overdue = value(await listOverdueCharges(ctx));
    expect(overdue.find((c) => c.description === "Zaległy")).toMatchObject({ status: "overdue", remainingMinor: 9000 });
    expect(overdue.some((c) => c.description === "Wczesny")).toBe(false);
  });
});

describe("access control", () => {
  it("lets the assistant see packages but not payments, and not sell", async () => {
    const asCtx = contextFor(assistant, orgA, "assistant");
    expect((await listClientPackages(asCtx, clientId)).ok).toBe(true);
    expect((await listClientCharges(asCtx, clientId)).ok).toBe(false);
    expect((await sellPackage(asCtx, { clientId, name: "X", sessionsCount: "1", price: "1" })).ok).toBe(false);

    // Druga linia obrony: surowe zapytania asystenta do tabel płatności nic nie zwracają.
    expect((await assistant.db.from("charges").select("id")).data ?? []).toHaveLength(0);
    expect((await assistant.db.from("payments").select("id")).data ?? []).toHaveLength(0);
  });

  it("keeps other organizations out, even with a tampered organization id", async () => {
    const tampered = contextFor(other, orgA, "owner");
    expect(value(await listClientPackages(tampered, clientId))).toHaveLength(0);

    const sale = await sellPackage(tampered, { clientId, name: "Włamanie", sessionsCount: "1", price: "1" });
    expect(sale.ok).toBe(false);
    if (!sale.ok) expect(sale.error.code).toBe("forbidden");

    const payment = await recordPayment(tampered, { clientId, amount: "10", method: "cash" });
    expect(payment.ok).toBe(false);

    expect(value(await listClientCharges(tampered, clientId))).toHaveLength(0);
  });

  it("shows a client only their own packages, charges and ledger, and lets them change nothing", async () => {
    const pkgs = await clientUser.db.from("v_client_package_balance").select("id, client_id");
    expect(new Set(pkgs.data?.map((p) => p.client_id))).toEqual(new Set([clientId]));

    const charges = await clientUser.db.from("v_charge_balance").select("client_id");
    expect(new Set(charges.data?.map((c) => c.client_id))).toEqual(new Set([clientId]));

    const ledger = await clientUser.db.from("package_ledger").select("client_package_id");
    expect(ledger.data?.length).toBeGreaterThan(0);

    const balance = await clientUser.db.from("v_client_balance").select("client_id");
    expect(balance.data?.map((b) => b.client_id)).toEqual([clientId]);

    const forge = await clientUser.db.rpc("sell_package", {
      p_org: orgA,
      p_client: clientId,
      p_dog: null,
      p_template: null,
      p_name: "Darmowy",
      p_sessions: 100,
      p_price_minor: 0,
      p_currency: "PLN",
      p_valid_from: null,
      p_valid_until: null,
      p_due_date: null,
    });
    expect(forge.error?.code).toBe("42501");
  });
});
