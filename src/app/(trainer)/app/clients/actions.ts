"use server";

import { redirect } from "next/navigation";
import {
  archiveClient,
  createClient,
  restoreClient,
  updateClient,
} from "@/modules/clients";
import {
  addDog,
  addDogNote,
  archiveDog,
  deleteDogNote,
  restoreDog,
  updateDog,
} from "@/modules/dogs";
import { toFormState, type FormState } from "@/shared/form";
import type { Result } from "@/shared/result";
import { requireContext } from "../../_lib/context";

const clientPath = (clientId: string) => `/app/clients/${clientId}`;
const dogPath = (clientId: string, dogId: string) => `/app/clients/${clientId}/dogs/${dogId}`;

/** Akcje bez formularza (archiwizacja, usuwanie): błąd przerywa żądanie i trafia do error boundary. */
function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export async function createClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext();
  const result = await createClient(ctx, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect(clientPath(result.value.id));
}

export async function updateClientAction(
  clientId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const result = await updateClient(ctx, clientId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect(clientPath(clientId));
}

export async function archiveClientAction(clientId: string) {
  const ctx = await requireContext();
  unwrap(await archiveClient(ctx, clientId));
  redirect("/app/clients");
}

export async function restoreClientAction(clientId: string) {
  const ctx = await requireContext();
  unwrap(await restoreClient(ctx, clientId));
  redirect(clientPath(clientId));
}

export async function addDogAction(
  clientId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const result = await addDog(ctx, clientId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect(dogPath(clientId, result.value.id));
}

export async function updateDogAction(
  clientId: string,
  dogId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const result = await updateDog(ctx, dogId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect(dogPath(clientId, dogId));
}

export async function archiveDogAction(clientId: string, dogId: string) {
  const ctx = await requireContext();
  unwrap(await archiveDog(ctx, dogId));
  redirect(clientPath(clientId));
}

export async function restoreDogAction(clientId: string, dogId: string) {
  const ctx = await requireContext();
  unwrap(await restoreDog(ctx, dogId));
  redirect(dogPath(clientId, dogId));
}

export async function addDogNoteAction(
  clientId: string,
  dogId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const result = await addDogNote(ctx, dogId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect(dogPath(clientId, dogId));
}

export async function deleteDogNoteAction(clientId: string, dogId: string, noteId: string) {
  const ctx = await requireContext();
  unwrap(await deleteDogNote(ctx, noteId));
  redirect(dogPath(clientId, dogId));
}
