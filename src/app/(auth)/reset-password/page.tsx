import Link from "next/link";
import { Suspense } from "react";
import { getSessionUser } from "@/modules/core";
import { AuthShell } from "../_components/auth-shell";
import { resetPasswordAction } from "./actions";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Nowe hasło" description="Ustaw nowe hasło do swojego konta.">
      <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
        <ResetPasswordContent />
      </Suspense>
    </AuthShell>
  );
}

/** Formularz działa tylko z sesją z linku resetującego (ustawioną w /auth/callback). */
async function ResetPasswordContent() {
  const user = await getSessionUser();
  if (!user.ok) {
    return (
      <p className="text-sm">
        Link wygasł lub nie jest już ważny.{" "}
        <Link href="/forgot-password" className="underline">
          Poproś o nowy
        </Link>
        .
      </p>
    );
  }
  return <ResetPasswordForm action={resetPasswordAction} />;
}
