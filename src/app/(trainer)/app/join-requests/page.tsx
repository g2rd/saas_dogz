import Link from "next/link";
import { Suspense } from "react";
import { hasPermission } from "@/modules/core";
import { listClients, clientFullName } from "@/modules/clients";
import { getSchoolJoinLink, listJoinRequests, type JoinRequest } from "@/modules/invitations";
import type { Formats } from "@/shared/i18n/formats";
import { getFormats } from "@/shared/i18n/server";
import { ConfirmSubmit } from "@/shared/ui/confirm";
import { SubmitButton } from "@/shared/ui/form-fields";
import { requireContext } from "../../_lib/context";
import { decideJoinRequestAction, rotateSchoolLinkAction } from "./actions";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default function JoinRequestsPage() {
  const t = useTranslations();
  return (
    <>
      <Link href="/app/more" className="text-sm text-zinc-600 underline dark:text-zinc-400">
        {t("invitations.schoolJoin.requests.back")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t("invitations.schoolJoin.requests.title")}</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">{t("invitations.schoolJoin.requests.intro")}</p>
      <Suspense fallback={<p className="mt-4 text-zinc-500">{t("common.ladowanie")}</p>}>
        <JoinRequests />
      </Suspense>
    </>
  );
}

async function JoinRequests() {
  const t = await getTranslations();
  const formats = await getFormats();
  const ctx = await requireContext();

  const requests = await listJoinRequests(ctx);
  if (!requests.ok) throw new Error(requests.error.message);
  const clients = await listClients(ctx);
  const clientOptions = clients.ok ? clients.value : [];
  const canManageLink = hasPermission(ctx, "organization.update");
  const link = canManageLink ? await getSchoolJoinLink(ctx) : null;

  return (
    <div className="mt-6 flex flex-col gap-8">
      {canManageLink ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">{t("invitations.schoolJoin.link.title")}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("invitations.schoolJoin.link.description")}</p>
          {link?.ok && link.value ? (
            <>
              <div
                role="img"
                aria-label={t("invitations.schoolJoin.link.qr_label")}
                className="size-60 rounded-lg bg-white p-2"
                dangerouslySetInnerHTML={{ __html: link.value.qrSvg }}
              />
              <p className="text-sm">
                <span className="font-medium">{t("invitations.schoolJoin.link.address")}: </span>
                <code data-testid="school-link" className="break-all">{link.value.link}</code>
              </p>
              <form action={rotateSchoolLinkAction}>
                <ConfirmSubmit
                  variant="secondary"
                  title={t("invitations.schoolJoin.link.rotate_title")}
                  description={t("invitations.schoolJoin.link.rotate_description")}
                  confirmLabel={t("invitations.schoolJoin.link.rotate_confirm")}
                  pendingLabel={t("invitations.schoolJoin.link.rotating")}
                >
                  {t("invitations.schoolJoin.link.rotate")}
                </ConfirmSubmit>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm">{t("invitations.schoolJoin.link.empty")}</p>
              <form action={rotateSchoolLinkAction}>
                <SubmitButton pendingLabel={t("invitations.schoolJoin.link.creating")}>{t("invitations.schoolJoin.link.create")}</SubmitButton>
              </form>
            </>
          )}
        </section>
      ) : null}

      <section>
        {requests.value.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("invitations.schoolJoin.requests.empty")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {requests.value.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                formats={formats}
                canDecide={hasPermission(ctx, "clients.write")}
                clients={clientOptions.map((client) => ({ id: client.id, name: clientFullName(client) }))}
                t={t}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RequestRow({
  request,
  formats,
  canDecide,
  clients,
  t,
}: {
  request: JoinRequest;
  formats: Formats;
  canDecide: boolean;
  clients: { id: string; name: string }[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const name = [request.firstName, request.lastName].filter(Boolean).join(" ");
  return (
    <li className="flex flex-col gap-3 px-4 py-3" data-testid="join-request">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {[request.email ? t("invitations.schoolJoin.requests.email", { email: request.email }) : null, request.phone ? t("invitations.schoolJoin.requests.phone", { phone: request.phone }) : null, formats.dateTime(request.createdAt)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {request.note ? <p className="mt-1 text-sm">{request.note}</p> : null}
      </div>
      {canDecide ? (
        <div className="flex flex-wrap items-end gap-3">
          <form action={decideJoinRequestAction.bind(null, request.id, true)} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("invitations.schoolJoin.requests.existing_client")}</span>
              <select name="clientId" defaultValue="" className="h-11 max-w-xs rounded-lg border border-zinc-300 bg-white px-3 text-base">
                <option value="">{t("invitations.schoolJoin.requests.new_client")}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <ConfirmSubmit
              tone="primary"
              title={t("invitations.schoolJoin.requests.approve_title")}
              description={t("invitations.schoolJoin.requests.approve_description", { name })}
              confirmLabel={t("invitations.schoolJoin.requests.approve_confirm")}
              pendingLabel={t("invitations.schoolJoin.requests.approving")}
            >
              {t("invitations.schoolJoin.requests.approve")}
            </ConfirmSubmit>
          </form>
          <form action={decideJoinRequestAction.bind(null, request.id, false)}>
            <ConfirmSubmit
              variant="danger"
              title={t("invitations.schoolJoin.requests.reject_title")}
              description={t("invitations.schoolJoin.requests.reject_description")}
              confirmLabel={t("invitations.schoolJoin.requests.reject_confirm")}
              pendingLabel={t("invitations.schoolJoin.requests.rejecting")}
            >
              {t("invitations.schoolJoin.requests.reject")}
            </ConfirmSubmit>
          </form>
        </div>
      ) : null}
    </li>
  );
}
