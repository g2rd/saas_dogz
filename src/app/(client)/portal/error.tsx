"use client";

import { ErrorView } from "@/shared/ui/error-view";

/** Błąd w panelu klienta: nawigacja dolna zostaje, więc można od razu przejść gdzie indziej. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/portal" />;
}
