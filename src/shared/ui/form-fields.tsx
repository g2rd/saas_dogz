"use client";

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

function FieldShell({ label, name, errors, hint, children }: BaseProps & { children: React.ReactNode }) {
  const hasError = Boolean(errors?.length);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={name} className="font-medium">
        {label}
      </label>
      {children}
      {hint && !hasError ? <p className="text-zinc-500">{hint}</p> : null}
      {hasError ? (
        <p id={`${name}-error`} role="alert" className="text-red-600">
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
  ...base
}: BaseProps & { type?: string; defaultValue?: string | null; required?: boolean; autoComplete?: string }) {
  return (
    <FieldShell {...base}>
      <input
        id={base.name}
        name={base.name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={Boolean(base.errors?.length)}
        aria-describedby={base.errors?.length ? `${base.name}-error` : undefined}
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
  return (
    <FieldShell {...base}>
      <select id={base.name} name={base.name} defaultValue={defaultValue} className={inputClass}>
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
  return (
    <FieldShell {...base}>
      <textarea
        id={base.name}
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
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-4" />
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
