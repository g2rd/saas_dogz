import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">DogTrainer</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Kalendarz, pakiety zajęć, płatności i zadania domowe dla trenerów psów, w jednym miejscu.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-medium text-background"
        >
          Załóż konto
        </Link>
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-full border border-zinc-300 px-6 font-medium dark:border-zinc-700"
        >
          Zaloguj się
        </Link>
      </div>
    </main>
  );
}
