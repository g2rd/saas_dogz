"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Logowanie</h1>
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-11 rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Hasło
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-11 rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"
          />
        </label>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full bg-foreground font-medium text-background disabled:opacity-60"
        >
          {pending ? "Logowanie..." : "Zaloguj się"}
        </button>
      </form>
    </main>
  );
}
