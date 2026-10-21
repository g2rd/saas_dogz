import { beforeAll, describe, expect, it } from "vitest";
import { createOrganization } from "@/modules/core/application/create-organization";
import { adminClient, contextFor, createTestUser, type TestUser } from "@/shared/testing/supabase-test";
import { createClient, listClients } from "./clients";
import { importClients, previewClientImport } from "./import";

let owner: TestUser;
let assistant: TestUser;
let orgId: string;

function value<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value as T;
}

const CSV = [
  "Imię;Nazwisko;E-mail;Telefon;Pies;Rasa",
  "Anna;Kowalska;anna@example.pl;600 100 200;Burek;Labrador",
  "Jan;Nowak;;;;",
  ";Bez imienia;x@y.pl;;;",
  "Ola;Zła;nie-email;12;Reksio;",
  "Ania;Duplikat;ANNA@example.pl;;;",
].join("\n");

beforeAll(async () => {
  [owner, assistant] = await Promise.all([createTestUser("imp-owner"), createTestUser("imp-assistant")]);
  orgId = value(await createOrganization(owner.db, { name: "Szkoła Importu" }));
  await adminClient().from("organization_members").insert({ organization_id: orgId, user_id: assistant.id, role: "assistant" });
});

describe("import klientów z CSV", () => {
  it("podgląd pokazuje wiersze, problemy i psy, nic nie zapisując", async () => {
    const ctx = contextFor(owner, orgId, "owner");
    const preview = value(await previewClientImport(ctx, CSV));
    expect(preview.total).toBe(5);
    expect(preview.rows.map((row) => row.firstName)).toEqual(["Anna", "Jan", "Ola"]);
    expect(preview.dogsCount).toBe(2);
    expect(preview.issues.map((issue) => [issue.line, issue.code])).toEqual([
      [4, "first_name_required"],
      [5, "email_dropped"],
      [5, "phone_dropped"],
      [6, "duplicate_in_file"],
    ]);
    expect(value(await listClients(ctx))).toHaveLength(0);
  });

  it("zapisuje klientów i psy atomowo, bez zaproszeń i dostępów", async () => {
    const ctx = contextFor(owner, orgId, "owner");
    const result = value(await importClients(ctx, CSV));
    expect(result).toMatchObject({ clients: 3, dogs: 2, skipped: 0, ignored: 2 });

    const clients = value(await listClients(ctx));
    expect(clients.map((c) => c.firstName).sort()).toEqual(["Anna", "Jan", "Ola"]);
    const anna = clients.find((c) => c.firstName === "Anna");
    expect(anna).toMatchObject({ email: "anna@example.pl", phone: "+48600100200", status: "active" });

    const dogs = await adminClient().from("dogs").select("name, breed, approval_status").eq("organization_id", orgId).order("name");
    expect(dogs.data).toEqual([
      { name: "Burek", breed: "Labrador", approval_status: "approved" },
      { name: "Reksio", breed: null, approval_status: "approved" },
    ]);
    const access = await adminClient().from("client_access").select("client_id").eq("organization_id", orgId);
    expect(access.data).toEqual([]);
    const invitations = await adminClient().from("invitations").select("id").eq("organization_id", orgId);
    expect(invitations.data).toEqual([]);
  });

  it("ponowny import tego samego pliku niczego nie dubluje (e-mail i telefon już są w szkole)", async () => {
    const ctx = contextFor(owner, orgId, "owner");
    const preview = value(await previewClientImport(ctx, CSV));
    expect(preview.rows.map((row) => row.firstName)).toEqual(["Jan", "Ola"]);
    expect(preview.issues.some((issue) => issue.code === "already_exists" && issue.line === 2)).toBe(true);

    const again = value(await importClients(ctx, "Imię;E-mail\nAnna;anna@example.pl\nNowy;nowy@example.pl\n"));
    expect(again).toMatchObject({ clients: 1, skipped: 0, ignored: 1 });
    expect(value(await listClients(ctx))).toHaveLength(4);
  });

  it("klient dodany między podglądem a zapisem nie zostanie zdublowany (baza pomija ten e-mail)", async () => {
    const ctx = contextFor(owner, orgId, "owner");
    value(await createClient(ctx, { firstName: "Wyprzedził", lastName: "Podgląd", email: "race@example.pl", status: "active" }));
    // Zapis analizuje plik od nowa, więc wiersz jest odrzucony jako już istniejący
    const result = await importClients(ctx, "Imię;E-mail\nRace;race@example.pl\n");
    expect(result.ok).toBe(false);
  });

  it("błędne pliki: pusty, bez kolumny imienia, same błędy, za duży", async () => {
    const ctx = contextFor(owner, orgId, "owner");
    expect((await previewClientImport(ctx, "   ")).ok).toBe(false);
    expect((await previewClientImport(ctx, "Telefon\n600100200\n")).ok).toBe(false);
    expect((await importClients(ctx, "Imię\n\n ;\n")).ok).toBe(false);
    expect((await previewClientImport(ctx, "Imię\n" + "a".repeat(1_100_000))).ok).toBe(false);
  });

  it("asystent nie importuje (brak prawa clients.write)", async () => {
    const result = await importClients(contextFor(assistant, orgId, "assistant"), "Imię\nTajny\n");
    expect(result.ok).toBe(false);
    expect(value(await listClients(contextFor(owner, orgId, "owner"))).some((c) => c.firstName === "Tajny")).toBe(false);
  });
});
