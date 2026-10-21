"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Msg } from "@/shared/ui/msg";
import { SubmitButton } from "@/shared/ui/form-fields";
import type { ImportIssue, ImportRow } from "../domain/import";

/** Stan formularza importu: krok 1 (plik) → podgląd → krok 2 (zapis) → wynik. */
export type ImportFormState = {
  error?: string;
  /** Tekst pliku odesłany do kroku zapisu (zapis analizuje go od nowa). */
  csv?: string;
  preview?: {
    total: number;
    rows: ImportRow[];
    issues: ImportIssue[];
    ignoredColumns: string[];
    truncated: boolean;
    dogsCount: number;
  };
  result?: { clients: number; dogs: number; skipped: number; ignored: number };
};

type Action = (prev: ImportFormState, formData: FormData) => Promise<ImportFormState>;

const PREVIEW_ROWS = 10;

export function ImportForm({ previewAction, confirmAction }: { previewAction: Action; confirmAction: Action }) {
  const t = useTranslations();
  const [previewState, previewFormAction] = useActionState(previewAction, {});
  const [confirmState, confirmFormAction] = useActionState(confirmAction, {});
  const preview = previewState.preview;
  const result = confirmState.result;

  if (result) {
    return (
      <div role="status" className="flex max-w-xl flex-col gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm">
        <p className="font-medium">{t("clients.import.done", { clients: result.clients, dogs: result.dogs })}</p>
        {result.skipped > 0 ? <p>{t("clients.import.done_skipped", { count: result.skipped })}</p> : null}
        <Link href="/app/clients" className="underline">
          {t("clients.import.back_to_clients")}
        </Link>
      </div>
    );
  }

  const errors = preview?.issues.filter((issue) => issue.severity === "error") ?? [];
  const warnings = preview?.issues.filter((issue) => issue.severity === "warning") ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <form action={previewFormAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("clients.import.file_label")}
          <input type="file" name="file" accept=".csv,.txt,text/csv,text/plain" className="text-base font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("clients.import.paste_label")}
          <textarea
            name="text"
            rows={4}
            placeholder={t("clients.import.paste_placeholder")}
            className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 font-mono text-sm font-normal dark:border-zinc-700"
          />
        </label>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("clients.import.format_hint")}</p>
        {previewState.error ? (
          <p role="alert" className="text-sm text-red-600">
            <Msg text={previewState.error} />
          </p>
        ) : null}
        <div>
          <SubmitButton variant="secondary" pendingLabel={t("clients.import.checking")}>
            {t("clients.import.check")}
          </SubmitButton>
        </div>
      </form>

      {preview ? (
        <section aria-label={t("clients.import.preview_title")} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("clients.import.preview_title")}</h2>
          <p>{t("clients.import.summary", { rows: preview.rows.length, total: preview.total, dogs: preview.dogsCount })}</p>
          {preview.truncated ? <p className="text-sm text-amber-700">{t("clients.import.truncated")}</p> : null}
          {preview.ignoredColumns.length > 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t("clients.import.ignored_columns", { columns: preview.ignoredColumns.join(", ") })}
            </p>
          ) : null}

          {preview.rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">{t("clients.import.col_name")}</th>
                    <th className="px-3 py-2">{t("common.e_mail")}</th>
                    <th className="px-3 py-2">{t("clients.clientForm.telefon")}</th>
                    <th className="px-3 py-2">{t("clients.import.col_dog")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, PREVIEW_ROWS).map((row) => (
                    <tr key={row.line} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-3 py-2">{[row.firstName, row.lastName].filter(Boolean).join(" ")}</td>
                      <td className="px-3 py-2">{row.email ?? "—"}</td>
                      <td className="px-3 py-2">{row.phone ?? "—"}</td>
                      <td className="px-3 py-2">{[row.dogName, row.breed].filter(Boolean).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > PREVIEW_ROWS ? (
                <p className="border-t border-zinc-200 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                  {t("clients.import.more_rows", { count: preview.rows.length - PREVIEW_ROWS })}
                </p>
              ) : null}
            </div>
          ) : null}

          {errors.length > 0 ? <IssueList title={t("clients.import.errors_title", { count: errors.length })} issues={errors} tone="error" /> : null}
          {warnings.length > 0 ? <IssueList title={t("clients.import.warnings_title", { count: warnings.length })} issues={warnings} tone="warning" /> : null}

          {preview.rows.length > 0 ? (
            <form action={confirmFormAction} className="flex flex-col gap-2">
              <input type="hidden" name="csv" value={previewState.csv ?? ""} />
              {confirmState.error ? (
                <p role="alert" className="text-sm text-red-600">
                  <Msg text={confirmState.error} />
                </p>
              ) : null}
              <div>
                <SubmitButton pendingLabel={t("clients.import.importing")}>
                  {t("clients.import.confirm", { count: preview.rows.length })}
                </SubmitButton>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: ImportIssue[]; tone: "error" | "warning" }) {
  const t = useTranslations();
  return (
    <details className={`rounded-lg border p-3 text-sm ${tone === "error" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {issues.slice(0, 50).map((issue, index) => (
          <li key={`${issue.line}-${issue.code}-${index}`}>
            {t("clients.import.issue_line", { line: issue.line })}: {t(`clients.import.issue.${issue.code}`, { value: issue.value ?? "" })}
          </li>
        ))}
        {issues.length > 50 ? <li>{t("clients.import.more_rows", { count: issues.length - 50 })}</li> : null}
      </ul>
    </details>
  );
}
