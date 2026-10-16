import { z } from "zod";
import { appError, type AppError } from "./errors";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Wartości z ostatniego wysłania; React 19 czyści formularz po akcji, więc odtwarzamy je jako defaultValue. */
  values?: Record<string, string>;
};

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value;
  }
  return values;
}

export function toFormState(error: AppError, formData?: FormData): FormState {
  const values = formData ? formValues(formData) : undefined;
  if (error.code === "validation" && error.details && typeof error.details === "object") {
    return { error: error.message, fieldErrors: error.details as FormState["fieldErrors"], values };
  }
  return { error: error.message, values };
}

/** Parsuje dane wejściowe schematem Zod i zamienia błędy na AppError z błędami pól. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  raw: unknown,
): { ok: true; value: z.output<S> } | { ok: false; error: AppError } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const { fieldErrors, formErrors } = z.flattenError(parsed.error);
  return {
    ok: false,
    error: appError("validation", formErrors[0] ?? "Popraw zaznaczone pola.", fieldErrors),
  };
}

/** Pole tekstowe z formularza: brak wartości traktowany jak pusty ciąg. */
export const formText = (max: number) =>
  z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(max, `Maksymalnie ${max} znaków`));

/** Pole opcjonalne: pusty ciąg oznacza brak wartości. */
export const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
