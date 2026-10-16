import Link from "next/link";
import { ClientForm } from "@/modules/clients";
import { createClientAction } from "../actions";

export default function NewClientPage() {
  return (
    <>
      <Link href="/app/clients" className="text-sm text-zinc-600 dark:text-zinc-400">
        ← Klienci
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Nowy klient</h1>
      <ClientForm action={createClientAction} submitLabel="Dodaj klienta" />
    </>
  );
}
