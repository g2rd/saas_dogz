/** Zgłoszenie testera widoczne dla właściciela platformy (z nazwą szkoły i adresem autora). */
export type FeedbackRow = {
  id: string;
  organizationName: string;
  authorEmail: string | null;
  audience: "staff" | "client";
  kind: "problem" | "idea" | "other";
  message: string;
  page: string | null;
  locale: string | null;
  status: "new" | "seen";
  createdAt: Date;
};

export const FEEDBACK_KIND_LABELS: Record<FeedbackRow["kind"], string> = {
  problem: "Problem",
  idea: "Pomysł",
  other: "Inne",
};
