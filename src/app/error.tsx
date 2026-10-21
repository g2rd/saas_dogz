"use client";

import { ErrorView } from "@/shared/ui/error-view";

/** Błąd w dowolnej stronie bez własnej granicy błędów (publiczne, logowanie, rejestracja). */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/start" />;
}
