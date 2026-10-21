import { FeedbackForm } from "@/modules/feedback";
import { useTranslations } from "next-intl";
import { submitFeedbackAction } from "./actions";

export default function FeedbackPage() {
  const t = useTranslations();
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("report.title")}</h1>
      <p className="mt-2 max-w-md text-zinc-600 dark:text-zinc-400">{t("report.intro")}</p>
      <div className="mt-6">
        <FeedbackForm action={submitFeedbackAction} />
      </div>
    </>
  );
}
