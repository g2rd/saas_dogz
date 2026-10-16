import Link from "next/link";
import { Suspense } from "react";
import { LOGIN_NEXT_PREFIXES, safeNextPath } from "@/modules/core";
import { AuthShell } from "../_components/auth-shell";
import { loginAction } from "./actions";
import { LoginForm } from "./login-form";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell
      title="Logowanie"
      footer={
        <>
          <Link href="/forgot-password" className="underline">
            Nie pamiętasz hasła?
          </Link>
          <span>
            Nie masz konta?{" "}
            <Link href="/signup" className="underline">
              Załóż konto
            </Link>
          </span>
        </>
      }
    >
      <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
        <LoginFormWithNext searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginFormWithNext({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  const raw = Array.isArray(next) ? next[0] : next;
  return <LoginForm action={loginAction} next={safeNextPath(raw, LOGIN_NEXT_PREFIXES, "")} />;
}
