import Link from "next/link";
import { useTranslations } from "next-intl";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div>
        <Link href="/" className="text-sm font-semibold">
          {t("common.dogtrainer")}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
        {description ? <p className="mt-2 text-zinc-600 dark:text-zinc-400">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">{footer}</div> : null}
    </main>
  );
}
