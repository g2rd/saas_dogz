import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "../_components/auth-shell";
import { forgotPasswordAction } from "./actions";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  return (
    <AuthShell
      title="Reset hasła"
      description="Podaj e-mail konta. Wyślemy link do ustawienia nowego hasła."
      footer={
        <Link href="/login" className="underline">
          Wróć do logowania
        </Link>
      }
    >
      <Suspense fallback={null}>
        <LinkError searchParams={searchParams} />
      </Suspense>
      <ForgotPasswordForm action={forgotPasswordAction} />
    </AuthShell>
  );
}

async function LinkError({ searchParams }: Pick<PageProps<"/forgot-password">, "searchParams">) {
  const { error } = await searchParams;
  if (error !== "link") return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      Link wygasł lub został już użyty. Poproś o nowy.
    </p>
  );
}
