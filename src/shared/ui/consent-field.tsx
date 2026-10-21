"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LEGAL_PATHS } from "../legal";
import { MsgList } from "./msg";

/** Pole zgody na regulamin i politykę prywatności w formularzach rejestracji (konto trenera, klienta, członka zespołu). */
export function ConsentField({ errors, defaultChecked }: { errors?: string[]; defaultChecked?: boolean }) {
  const t = useTranslations();
  const hasError = Boolean(errors?.length);
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="acceptTerms"
          defaultChecked={defaultChecked}
          required
          aria-invalid={hasError}
          className="mt-1 size-4"
        />
        <span>
          {t.rich("legal.consent.label", {
            terms: (chunks) => (
              <Link href={LEGAL_PATHS.terms} target="_blank" className="underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href={LEGAL_PATHS.privacy} target="_blank" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      {hasError ? (
        <p role="alert" className="text-sm text-red-600">
          <MsgList items={errors ?? []} />
        </p>
      ) : null}
    </div>
  );
}
