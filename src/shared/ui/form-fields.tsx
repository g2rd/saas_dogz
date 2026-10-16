"use client";

import { useId } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "../form";

const inputClass =
  "h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700";

type BaseProps = {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
};

/** Unikalne id pola: ta sama nazwa pola może wystąpić w kilku formularzach na jednej stronie. */
function useFieldId(name: string) {
  return `${useId()}-${name}`;
}

function FieldShell({
  id,
  label,
  errors,
  hint,
  children,
}: Omit<BaseProps, "name"> & { id: string; children: React.ReactNode }) {
  const hasError = Boolean(errors?.length);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children}
      {hint && !hasError ? <p className="text-zinc-500">{hint}</p> : null}
      {hasError ? (
        <p id={`${id}-error`} role="alert" className="text-red-600">
          {errors?.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  type = "text",
  defaultValue,
  required,
  autoComplete,
  inputMode,
  min,
  ...base
}: BaseProps & {
  type?: string;
  defaultValue?: string | null;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  min?: number;
}) {
  const id = useFieldId(base.name);
  return (
    <FieldShell id={id} label={base.label} errors={base.errors} hint={base.hint}>
      <input
        id={id}
        name={base.name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        min={min}
        aria-invalid={Boolean(base.errors?.length)}
        aria-describedby={base.errors?.length ? `${id}-error` : undefined}
        className={inputClass}
      />
    </FieldShell>
  );
}

export function SelectField({
  options,
  defaultValue,
  ...base
}: BaseProps & { options: { value: string; label: string }[]; defaultValue?: string }) {
  const id = useFieldId(base.name);
  return (
    <FieldShell id={id} label={base.label} errors={base.errors} hint={base.hint}>
      {/* key: React nie odświeża wybranej opcji po zmianie defaultValue (np. po resecie formularza po błędzie). */}
      <select
        key={defaultValue ?? ""}
        id={id}
        name={base.name}
        defaultValue={defaultValue}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  defaultValue,
  required,
  ...base
}: BaseProps & { defaultValue?: string; required?: boolean }) {
  const id = useFieldId(base.name);
  return (
    <FieldShell id={id} label={base.label} errors={base.errors} hint={base.hint}>
      <textarea
        key={defaultValue ?? ""}
        id={id}
        name={base.name}
        rows={4}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={Boolean(base.errors?.length)}
        className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 text-base dark:border-zinc-700"
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        key={String(defaultChecked ?? false)}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 size-4"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-zinc-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Zapisywanie...",
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-foreground text-background",
    secondary: "border border-zinc-300 dark:border-zinc-700",
    danger: "border border-red-300 text-red-700 dark:border-red-800 dark:text-red-400",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-11 items-center justify-center rounded-full px-6 font-medium disabled:opacity-60 ${styles}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {state.error}
    </p>
  );
}
