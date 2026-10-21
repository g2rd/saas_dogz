import Link from "next/link";
import { Suspense } from "react";
import { LOGIN_NEXT_PREFIXES, getSignupMode, safeNextPath } from "@/modules/core";
import { createUserClient } from "@/shared/supabase/server";
import { AuthShell } from "../_components/auth-shell";
import { signupAction } from "./actions";
import { SignupForm } from "./signup-form";

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthShell
      title="Załóż konto"
      description="Po założeniu konta utworzysz swoją organizację i dodasz pierwszych klientów."
      footer={
        <span>
          Masz już konto?{" "}
          <Link href="/login" className="underline">
            Zaloguj się
          </Link>
        </span>
      }
    >
      <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
        <SignupFormWithNext searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function SignupFormWithNext({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const { next } = await searchParams;
  const raw = Array.isArray(next) ? next[0] : next;
  const mode = await getSignupMode(await createUserClient());
  return <SignupForm action={signupAction} next={safeNextPath(raw, LOGIN_NEXT_PREFIXES, "")} requireCode={mode === "closed"} />;
}
