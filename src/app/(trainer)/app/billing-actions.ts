"use server";

import { redirect } from "next/navigation";
import {
  adjustPackage,
  archiveTemplate,
  createTemplate,
  restoreTemplate,
  sellPackage,
  updateTemplate,
} from "@/modules/packages";
import { recordPayment, voidCharge } from "@/modules/payments";
import { toFormState, type FormState } from "@/shared/form";
import type { Result } from "@/shared/result";
import { requireContext } from "../_lib/context";

const clientPath = (clientId: string) => `/app/clients/${clientId}`;
const packagePath = (clientId: string, packageId: string) => `/app/clients/${clientId}/packages/${packageId}`;

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** Identyfikatory z adresu (bound args) zawsze wygrywają z polami formularza. */
const withIds = (formData: FormData, ids: Record<string, string>) => ({ ...Object.fromEntries(formData), ...ids });

// --- szablony pakietów ------------------------------------------------------------------------------

export async function createTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext();
  const result = await createTemplate(ctx, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect("/app/packages");
}

export async function updateTemplateAction(
  templateId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const result = await updateTemplate(ctx, templateId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect("/app/packages");
}

export async function archiveTemplateAction(templateId: string) {
  const ctx = await requireContext();
  unwrap(await archiveTemplate(ctx, templateId));
  redirect("/app/packages");
}

export async function restoreTemplateAction(templateId: string) {
  const ctx = await requireContext();
  unwrap(await restoreTemplate(ctx, templateId));
  redirect("/app/packages");
}

// --- sprzedaż, korekty, płatności --------------------------------------------------------------------

export async function sellPackageAction(
  clientId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const result = await sellPackage(ctx, withIds(formData, { clientId }));
  if (!result.ok) return toFormState(result.error, formData);
  redirect(clientPath(clientId));
}

export async function adjustPackageAction(
  clientId: string,
  packageId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const result = await adjustPackage(ctx, packageId, Object.fromEntries(formData));
  if (!result.ok) return toFormState(result.error, formData);
  redirect(packagePath(clientId, packageId));
}

export async function recordPaymentAction(
  clientId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext();
  const result = await recordPayment(ctx, withIds(formData, { clientId }));
  if (!result.ok) return toFormState(result.error, formData);
  redirect(clientPath(clientId));
}

export async function voidChargeAction(clientId: string, chargeId: string) {
  const ctx = await requireContext();
  unwrap(await voidCharge(ctx, chargeId));
  redirect(clientPath(clientId));
}
