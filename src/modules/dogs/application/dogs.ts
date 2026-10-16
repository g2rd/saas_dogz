import { authorize } from "@/modules/core";
import { isoDate } from "@/shared/dates";
import { appError } from "@/shared/errors";
import { parseInput } from "@/shared/form";
import type { ClientRequestContext, RequestContext } from "@/shared/context";
import { err, type Result } from "@/shared/result";
import {
  dogInputSchema,
  dogNoteInputSchema,
  type Dog,
  type DogInput,
  type DogNote,
} from "../domain/dog";
import { dogsRepository } from "../infrastructure/dogs-repository";

function birthDateInFuture(ctx: RequestContext, input: DogInput) {
  if (input.birthDate && input.birthDate > isoDate(ctx.clock.now())) {
    return err(
      appError("validation", "Popraw zaznaczone pola.", {
        birthDate: ["Data urodzenia nie może być z przyszłości"],
      }),
    );
  }
  return null;
}

export async function listDogs(
  ctx: RequestContext,
  clientId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Result<Dog[]>> {
  const allowed = authorize(ctx, "dogs.read");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).listByClient(ctx.organizationId, clientId, options.includeArchived);
}

/** Psy dodane przez klientów, które czekają na zatwierdzenie. */
export async function listPendingDogs(ctx: RequestContext): Promise<Result<Dog[]>> {
  const allowed = authorize(ctx, "dogs.write");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).listPending(ctx.organizationId);
}

export async function approveDog(ctx: RequestContext, id: string): Promise<Result<Dog>> {
  const allowed = authorize(ctx, "dogs.write");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).review(ctx.organizationId, id, "approved", ctx.userId, ctx.clock.now());
}

export async function rejectDog(ctx: RequestContext, id: string): Promise<Result<Dog>> {
  const allowed = authorize(ctx, "dogs.write");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).review(ctx.organizationId, id, "rejected", ctx.userId, ctx.clock.now());
}

/** Klient dodaje psa w panelu; pies czeka na zatwierdzenie trenera. Bez uprawnień personelu, chroni go RLS. */
export async function proposeDog(ctx: ClientRequestContext, raw: unknown): Promise<Result<Dog>> {
  const input = parseInput(dogInputSchema, raw);
  if (!input.ok) return err(input.error);
  if (input.value.birthDate && input.value.birthDate > isoDate(ctx.clock.now())) {
    return err(
      appError("validation", "Popraw zaznaczone pola.", { birthDate: ["Data urodzenia nie może być z przyszłości"] }),
    );
  }
  return dogsRepository(ctx.db).insertProposed(ctx.organizationId, ctx.userId, ctx.clientId, input.value);
}

export async function listOrganizationDogs(ctx: RequestContext): Promise<Result<Dog[]>> {
  const allowed = authorize(ctx, "dogs.read");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).listAll(ctx.organizationId);
}

export async function getDog(ctx: RequestContext, id: string): Promise<Result<Dog>> {
  const allowed = authorize(ctx, "dogs.read");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).get(ctx.organizationId, id);
}

export async function addDog(
  ctx: RequestContext,
  clientId: string,
  raw: unknown,
): Promise<Result<Dog>> {
  const allowed = authorize(ctx, "dogs.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(dogInputSchema, raw);
  if (!input.ok) return err(input.error);
  const future = birthDateInFuture(ctx, input.value);
  if (future) return future;

  return dogsRepository(ctx.db).insert(ctx.organizationId, ctx.userId, clientId, input.value);
}

export async function updateDog(ctx: RequestContext, id: string, raw: unknown): Promise<Result<Dog>> {
  const allowed = authorize(ctx, "dogs.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(dogInputSchema, raw);
  if (!input.ok) return err(input.error);
  const future = birthDateInFuture(ctx, input.value);
  if (future) return future;

  return dogsRepository(ctx.db).update(ctx.organizationId, id, input.value);
}

export async function archiveDog(ctx: RequestContext, id: string): Promise<Result<Dog>> {
  const allowed = authorize(ctx, "dogs.write");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).setArchived(ctx.organizationId, id, ctx.clock.now());
}

export async function restoreDog(ctx: RequestContext, id: string): Promise<Result<Dog>> {
  const allowed = authorize(ctx, "dogs.write");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).setArchived(ctx.organizationId, id, null);
}

export async function listDogNotes(ctx: RequestContext, dogId: string): Promise<Result<DogNote[]>> {
  const allowed = authorize(ctx, "dog_notes.read");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).listNotes(ctx.organizationId, dogId);
}

export async function addDogNote(
  ctx: RequestContext,
  dogId: string,
  raw: unknown,
): Promise<Result<DogNote>> {
  const allowed = authorize(ctx, "dog_notes.write");
  if (!allowed.ok) return allowed;

  const input = parseInput(dogNoteInputSchema, raw);
  if (!input.ok) return err(input.error);

  return dogsRepository(ctx.db).insertNote(ctx.organizationId, ctx.userId, dogId, input.value);
}

export async function deleteDogNote(ctx: RequestContext, id: string): Promise<Result<void>> {
  const allowed = authorize(ctx, "dog_notes.write");
  if (!allowed.ok) return allowed;
  return dogsRepository(ctx.db).deleteNote(ctx.organizationId, id);
}
