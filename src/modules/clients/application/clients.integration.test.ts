import { beforeAll, describe, expect, it } from "vitest";
import { createOrganization } from "@/modules/core/application/create-organization";
import {
  addDog,
  addDogNote,
  listDogNotes,
  listDogs,
} from "@/modules/dogs/application/dogs";
import {
  adminClient,
  contextFor,
  createTestUser,
  type TestUser,
} from "@/shared/testing/supabase-test";
import {
  archiveClient,
  createClient,
  getClient,
  listClients,
  restoreClient,
  updateClient,
} from "./clients";

let ownerA: TestUser;
let ownerB: TestUser;
let clientUser: TestUser;
let assistant: TestUser;
let orgA: string;
let orgB: string;
let clientId: string;
let dogId: string;

beforeAll(async () => {
  [ownerA, ownerB, clientUser, assistant] = await Promise.all([
    createTestUser("owner-a"),
    createTestUser("owner-b"),
    createTestUser("client"),
    createTestUser("assistant"),
  ]);

  const a = await createOrganization(ownerA.db, { name: "Szkoła Łapa" });
  const b = await createOrganization(ownerB.db, { name: "Pies i Ja" });
  if (!a.ok || !b.ok) throw new Error("organization setup failed");
  orgA = a.value;
  orgB = b.value;

  // Asystent w organizacji A (dodany przez service_role jak przy zaproszeniu).
  const added = await adminClient()
    .from("organization_members")
    .insert({ organization_id: orgA, user_id: assistant.id, role: "assistant" });
  if (added.error) throw new Error(added.error.message);
});

describe("clients and dogs against a real database", () => {
  it("creates a client with normalized contact data", async () => {
    const ctx = contextFor(ownerA, orgA, "owner");
    const result = await createClient(ctx, {
      firstName: "Anna",
      lastName: "Kowalska",
      email: "ANNA@Example.PL",
      phone: "600 100 200",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    clientId = result.value.id;
    expect(result.value.email).toBe("anna@example.pl");
    expect(result.value.phone).toBe("+48600100200");
    expect(result.value.organizationId).toBe(orgA);
  });

  it("returns field errors for invalid input", async () => {
    const ctx = contextFor(ownerA, orgA, "owner");
    const result = await createClient(ctx, { firstName: "", email: "x" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("validation");
    expect(result.error.details).toMatchObject({ firstName: expect.any(Array), email: expect.any(Array) });
  });

  it("searches by name and survives filter control characters", async () => {
    const ctx = contextFor(ownerA, orgA, "owner");
    const found = await listClients(ctx, { search: "kowal" });
    expect(found.ok && found.value.map((c) => c.id)).toEqual([clientId]);

    const hostile = await listClients(ctx, { search: 'x,id.eq.1),(first_name.ilike.%' });
    expect(hostile.ok).toBe(true);
    if (hostile.ok) expect(hostile.value).toHaveLength(0);
  });

  it("adds a dog and notes, rejects a future birth date", async () => {
    const ctx = contextFor(ownerA, orgA, "owner");

    const future = await addDog(ctx, clientId, { name: "Burek", birthDate: "2999-01-01" });
    expect(future.ok).toBe(false);

    const dog = await addDog(ctx, clientId, { name: "Burek", breed: "Mieszaniec", birthDate: "2023-03-01", sex: "male" });
    expect(dog.ok).toBe(true);
    if (!dog.ok) return;
    dogId = dog.value.id;
    expect(dog.value.birthDate).toBe("2023-03-01");

    const priv = await addDogNote(ctx, dogId, { kind: "behavior", content: "Lęk przed hałasem" });
    const shared = await addDogNote(ctx, dogId, { kind: "health", content: "Szczepienie ważne", visibleToClient: "on" });
    expect(priv.ok && shared.ok).toBe(true);

    const notes = await listDogNotes(ctx, dogId);
    expect(notes.ok && notes.value).toHaveLength(2);
  });

  it("updates, archives and restores a client", async () => {
    const ctx = contextFor(ownerA, orgA, "owner");

    const updated = await updateClient(ctx, clientId, { firstName: "Anna", lastName: "Nowak", status: "active" });
    expect(updated.ok && updated.value.lastName).toBe("Nowak");

    const archived = await archiveClient(ctx, clientId);
    expect(archived.ok && archived.value.archivedAt).toBeInstanceOf(Date);

    const hidden = await listClients(ctx);
    expect(hidden.ok && hidden.value.some((c) => c.id === clientId)).toBe(false);
    const withArchived = await listClients(ctx, { includeArchived: true });
    expect(withArchived.ok && withArchived.value.some((c) => c.id === clientId)).toBe(true);

    const restored = await restoreClient(ctx, clientId);
    expect(restored.ok && restored.value.archivedAt).toBeNull();
  });

  it("isolates organizations, even with a tampered organization id", async () => {
    const ownCtx = contextFor(ownerB, orgB, "owner");
    const own = await listClients(ownCtx);
    expect(own.ok && own.value).toHaveLength(0);

    const tampered = contextFor(ownerB, orgA, "owner");
    const list = await listClients(tampered);
    expect(list.ok && list.value).toHaveLength(0);

    const direct = await getClient(tampered, clientId);
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.error.code).toBe("not_found");

    const write = await createClient(tampered, { firstName: "Intruz" });
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.error.code).toBe("forbidden");

    const dogs = await listDogs(tampered, clientId);
    expect(dogs.ok && dogs.value).toHaveLength(0);
  });

  it("lets a client with access see only own data and visible notes", async () => {
    const granted = await adminClient()
      .from("client_access")
      .insert({ organization_id: orgA, client_id: clientId, user_id: clientUser.id, relation: "owner" });
    expect(granted.error).toBeNull();

    const clients = await clientUser.db.from("clients").select("id");
    expect(clients.data?.map((c) => c.id)).toEqual([clientId]);

    const dogs = await clientUser.db.from("dogs").select("id");
    expect(dogs.data?.map((d) => d.id)).toEqual([dogId]);

    const notes = await clientUser.db.from("dog_notes").select("content, visible_to_client");
    expect(notes.data).toEqual([{ content: "Szczepienie ważne", visible_to_client: true }]);

    const write = await clientUser.db.from("clients").update({ first_name: "Hack" }).eq("id", clientId).select();
    expect(write.data ?? []).toHaveLength(0);
  });

  it("restricts the assistant role", async () => {
    const ctx = contextFor(assistant, orgA, "assistant");

    const list = await listClients(ctx);
    expect(list.ok && list.value.length).toBeGreaterThan(0);

    const create = await createClient(ctx, { firstName: "Nie" });
    expect(create.ok).toBe(false);
    if (!create.ok) expect(create.error.code).toBe("forbidden");

    const notes = await listDogNotes(ctx, dogId);
    expect(notes.ok).toBe(false);

    // Druga linia obrony: nawet z pominięciem use case RLS nie pokaże notatek asystentowi.
    const raw = await assistant.db.from("dog_notes").select("id");
    expect(raw.data ?? []).toHaveLength(0);
  });
});
