import Link from "next/link";

/** Link powrotu na podstronach: w aplikacji zainstalowanej na ekranie głównym (tryb `standalone`) nie ma przycisku „Wstecz” przeglądarki. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} data-testid="back-link" className="inline-flex min-h-11 items-center gap-1 text-sm text-zinc-600 underline dark:text-zinc-400">
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  );
}
