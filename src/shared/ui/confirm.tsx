"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";

type Variant = "primary" | "secondary" | "danger";

const STYLES: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-zinc-300 bg-white text-foreground hover:bg-zinc-50",
  danger: "border border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
};

/**
 * Przycisk wysyłający formularz dopiero po potwierdzeniu w oknie dialogowym (na telefonie arkusz od dołu).
 * Wstaw go w miejsce zwykłego przycisku zatwierdzającego formularz: po „Potwierdź” formularz jest wysyłany
 * (`requestSubmit`), więc działają wszystkie akcje serwerowe, także z `useActionState`.
 * Domyślnie zaznaczone jest „Anuluj”, żeby przypadkowe Enter/dotknięcie nie wykonało operacji.
 */
export function ConfirmSubmit({
  children,
  title,
  description,
  confirmLabel,
  pendingLabel = "Zapisywanie...",
  variant = "primary",
  tone = "danger",
  disabled = false,
}: {
  /** Napis na przycisku, który otwiera potwierdzenie. */
  children: React.ReactNode;
  title: string;
  /** Skutki operacji: co się stanie, kto dostanie powiadomienie, czy można cofnąć. */
  description: React.ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  variant?: Variant;
  /** Kolor przycisku potwierdzenia: `danger` (czerwony) dla operacji z trudnymi skutkami, `primary` dla pozostałych. */
  tone?: "danger" | "primary";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  function confirm() {
    dialogRef.current?.close();
    triggerRef.current?.form?.requestSubmit();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={pending || disabled}
        onClick={() => dialogRef.current?.showModal()}
        className={`inline-flex h-11 items-center justify-center rounded-full px-6 font-medium disabled:opacity-60 ${STYLES[variant]}`}
      >
        {pending ? pendingLabel : children}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => {
          // Kliknięcie w tło (poza treścią) zamyka okno bez wykonania operacji
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-0 mt-auto w-full max-w-md rounded-t-2xl bg-white p-0 text-foreground shadow-xl backdrop:bg-black/40 sm:m-auto sm:rounded-2xl"
      >
        <div className="flex flex-col gap-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div id={descriptionId} className="text-sm text-zinc-700">
            {description}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-6 font-medium hover:bg-zinc-50"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={confirm}
              className={`inline-flex h-11 items-center justify-center rounded-full px-6 font-medium ${
                tone === "danger" ? "bg-red-600 text-white hover:bg-red-700" : STYLES.primary
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
