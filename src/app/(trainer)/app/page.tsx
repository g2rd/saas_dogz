import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getOrganization, getRequestContext } from "@/modules/core";
import { createOrganizationAction } from "./actions";
import { OnboardingForm } from "./onboarding-form";

export default function TrainerDashboard() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Panel trenera</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-500">Ładowanie...</p>}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const ctx = await getRequestContext();

  if (!ctx.ok) {
    if (ctx.error.code === "unauthenticated") redirect("/login");
    if (ctx.error.code === "no_organization") {
      return (
        <section className="mt-6 flex flex-col gap-4">
          <p className="text-zinc-600 dark:text-zinc-400">
            Zacznij od utworzenia organizacji. Potem dodasz klientów i ich psy.
          </p>
          <OnboardingForm action={createOrganizationAction} />
        </section>
      );
    }
    throw new Error(ctx.error.message);
  }

  const org = await getOrganization(ctx.value);

  return (
    <section className="mt-6 flex flex-col gap-4">
      <p className="text-zinc-600 dark:text-zinc-400">
        Organizacja: <strong>{org.ok ? org.value.name : "—"}</strong>
      </p>
      <div>
        <Link
          href="/app/clients"
          className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-medium text-background"
        >
          Klienci i psy
        </Link>
      </div>
    </section>
  );
}
