import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser } from "@/modules/core";
import { listMyJoinRequests } from "@/modules/invitations";
import { getFormats } from "@/shared/i18n/server";
import { createUserClient } from "@/shared/supabase/server";
import { Badge } from "@/shared/ui/badge";
import { suspendedLogoutAction } from "../../suspended/actions";
import { AuthShell } from "../_components/auth-shell";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("invitations.schoolJoin.status.title") };
}

/** Status próśb o dołączenie do szkół (dla osoby, która czeka na akceptację trenera). */
export default function SchoolRequestsPage() {
  const t = useTranslations();
  return (
    <AuthShell title={t("invitations.schoolJoin.status.title")}>
      <Suspense fallback={<p className="text-zinc-500">{t("invitations.schoolJoin.page.loading")}</p>}>
        <Requests />
      </Suspense>
    </AuthShell>
  );
}

const TONES = { pending: "warning", approved: "success", rejected: "danger" } as const;

async function Requests() {
  const t = await getTranslations();
  const formats = await getFormats();
  const user = await getSessionUser();
  if (!user.ok) redirect("/login?next=%2Fschool");
  const requests = await listMyJoinRequests(await createUserClient(), user.value.id);
  if (!requests.ok) throw new Error(requests.error.message);

  const approved = requests.value.some((request) => request.status === "approved");
  const pending = requests.value.some((request) => request.status === "pending");

  return (
    <div className="flex flex-col gap-4">
      {requests.value.length === 0 ? <p className="text-zinc-600">{t("invitations.schoolJoin.status.empty")}</p> : null}
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {requests.value.map((request) => (
          <li key={request.id} className="flex flex-col gap-1 px-4 py-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{request.organizationName}</span>
              <Badge tone={TONES[request.status]}>{t(`invitations.schoolJoin.status.${request.status}`)}</Badge>
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("invitations.schoolJoin.status.sent", { date: formats.dateTime(request.createdAt) })}</p>
          </li>
        ))}
      </ul>
      {pending ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("invitations.schoolJoin.status.pending_hint")}</p> : null}
      {approved ? (
        <Link href="/start" className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 font-medium text-white">
          {t("invitations.schoolJoin.status.open_portal")}
        </Link>
      ) : null}
      <form action={suspendedLogoutAction}>
        <button type="submit" className="text-sm text-zinc-600 underline">
          {t("invitations.schoolJoin.status.logout")}
        </button>
      </form>
    </div>
  );
}
