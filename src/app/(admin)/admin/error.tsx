"use client";

import { ErrorView } from "@/shared/ui/error-view";

/** Błąd w panelu właściciela platformy. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/admin" />;
}
