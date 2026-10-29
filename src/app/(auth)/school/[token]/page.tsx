import Link from "next/link";
import { Suspense } from "react";
import { getSessionUser } from "@/modules/core";
import { lookupSchoolJoin } from "@/modules/invitations";
import { createUserClient } from "@/shared/supabase/server";
import { AuthShell } from "../../_components/auth-shell";
import { InviteSignupForm } from "../../invite/[secret]/invite-forms";
import { requestJoinAction, schoolSignupAction } from "./actions";
import { JoinRequestForm } from "./join-form";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

type Props = PageProps<"/school/[token]">;

/** Strona stałego linku szkoły (kod QR na drzwiach, wizytówce, stronie): załóż konto lub zaloguj się i wyślij prośbę o dołączenie. */
export default function SchoolJoinPage({ params }: Props) {
  const t = useTranslations();
  return (
    <AuthShell title={t("common.dogtrainer")}>
      <Suspense fallback={<p className="text-zinc-500">{t("invitations.schoolJoin.page.loading")}</p>}>
        <SchoolJoinContent params={params} />
      </Suspense>
    </AuthShell>
  );
}

async function SchoolJoinContent({ params }: Pick<Props, "params">) {
  const t = await getTranslations();
  const { token } = await params;
  const db = await createUserClient();
  const school = await lookupSchoolJoin(db, token);

  if (!school.ok || !school.value) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("invitations.schoolJoin.page.invalid_title")}</h2>
        <p role="alert" className="text-sm">
          {t("invitations.schoolJoin.page.invalid_body")}
        </p>
        <Link href="/login" className="text-sm underline">
          {t("common.przejdz_do_logowania")}
        </Link>
      </div>
    );
  }

  const user = await getSessionUser();
  let firstName = "";
  let lastName = "";
  if (user.ok) {
    const { data: profile } = await db.from("profiles").select("full_name").eq("id", user.value.id).maybeSingle();
    const [first, ...rest] = String((profile as { full_name: string | null } | null)?.full_name ?? "").trim().split(/\s+/);
    firstName = first ?? "";
    lastName = rest.join(" ");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">{t("invitations.schoolJoin.page.title", { school: school.value.name })}</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t("invitations.schoolJoin.page.intro")}</p>
      </div>

      {user.ok ? (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("invitations.schoolJoin.page.logged_as", { email: user.value.email ?? "" })}</p>
          <JoinRequestForm action={requestJoinAction.bind(null, token)} firstName={firstName} lastName={lastName} />
        </>
      ) : (
        <>
          <InviteSignupForm action={schoolSignupAction.bind(null, token)} secret={token} emailHint={null} basePath="/school" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("common.masz_juz_konto")}{" "}
            <Link href={`/login?next=${encodeURIComponent(`/school/${token}`)}`} className="underline">
              {t("common.zaloguj_sie")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
