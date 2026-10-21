"use server";

import { IMPORT_MAX_BYTES, importClients, previewClientImport, type ImportFormState } from "@/modules/clients";
import { msg } from "@/shared/i18n/messages";
import { requireContext } from "../../../_lib/context";

/** Tekst pliku z formularza: plik ma pierwszeństwo przed wklejonym tekstem. */
async function readCsv(formData: FormData): Promise<{ csv: string } | { error: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > IMPORT_MAX_BYTES) return { error: msg("clients.import.too_large") };
    return { csv: await file.text() };
  }
  const text = formData.get("text");
  return { csv: typeof text === "string" ? text : "" };
}

export async function previewImportAction(_prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  const ctx = await requireContext();
  const source = await readCsv(formData);
  if ("error" in source) return { error: source.error };
  const result = await previewClientImport(ctx, source.csv);
  if (!result.ok) return { error: result.error.message };
  const { total, rows, issues, ignoredColumns, truncated, dogsCount } = result.value;
  return { csv: source.csv, preview: { total, rows, issues, ignoredColumns, truncated, dogsCount } };
}

export async function confirmImportAction(_prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  const ctx = await requireContext();
  const csv = formData.get("csv");
  const result = await importClients(ctx, typeof csv === "string" ? csv : "");
  if (!result.ok) return { error: result.error.message };
  return { result: result.value };
}
