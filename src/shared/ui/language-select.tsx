"use client";

import { useId, useTransition } from "react";

/** Lista wyboru języka: zmiana zapisuje się od razu (akcja serwerowa) i odświeża widok. */
export function LanguageSelect({
  label,
  savingLabel,
  current,
  options,
  action,
}: {
  label: string;
  savingLabel: string;
  /** `auto` albo kod języka wybranego ręcznie. */
  current: string;
  options: { value: string; label: string }[];
  action: (value: string) => Promise<void>;
}) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <select
        id={id}
        value={current}
        disabled={pending}
        onChange={(event) => startTransition(() => action(event.target.value))}
        className="h-11 w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 text-base"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {pending ? <p className="text-zinc-500">{savingLabel}</p> : null}
    </div>
  );
}
