import { Suspense } from "react";
import { BETA_CODE_STATE_LABELS, betaCodeState, getSignupMode, listBetaCodes } from "@/modules/platform";
import { Badge } from "@/shared/ui/badge";
import { requireAdmin } from "../../_lib/context";
import { createBetaCodeAction, revokeBetaCodeAction, setSignupModeAction } from "../actions";
import { formatDate } from "../format";
import { CreateCodeForm, RevokeCodeForm, SignupModeForm } from "./code-forms";

export const metadata = { title: "Kody i rejestracja" };

export default function CodesPage() {
  return (
    <Suspense fallback={<p className="text-zinc-500">Ładowanie...</p>}>
      <Codes />
    </Suspense>
  );
}

const TONES = { available: "success", used: "neutral", expired: "warning", revoked: "danger" } as const;

async function Codes() {
  const ctx = await requireAdmin();
  const [mode, codes] = await Promise.all([getSignupMode(ctx), listBetaCodes(ctx)]);
  if (!mode.ok) throw new Error(mode.error.message);
  if (!codes.ok) throw new Error(codes.error.message);
  const now = ctx.now();
  const closed = mode.value === "closed";

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Kody i rejestracja</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Tryb rejestracji</h2>
        <p className={`rounded-lg border p-3 text-sm ${closed ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
          {closed
            ? "Rejestracja jest zamknięta: konto trenera założy tylko osoba z kodem od Ciebie. Klienci i zespół wchodzą z zaproszeń trenera."
            : "Rejestracja jest otwarta: każdy może założyć konto trenera. Do testów z wybranymi osobami zamknij ją."}
        </p>
        <SignupModeForm mode={mode.value} action={setSignupModeAction.bind(null, closed ? "open" : "closed")} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Nowy kod dla testera</h2>
        <p className="text-sm text-zinc-600">
          Wyślij testerowi kod i link do strony rejestracji. Kod działa raz (albo tyle, ile ustawisz) i wygasa po wybranej liczbie dni.
        </p>
        <CreateCodeForm action={createBetaCodeAction} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Wydane kody</h2>
        {codes.value.length === 0 ? (
          <p className="text-sm text-zinc-600">Nie wydano jeszcze żadnego kodu.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {codes.value.map((code) => {
              const state = betaCodeState(code, now);
              return (
                <li key={code.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                  <span>
                    <span className="font-medium">{code.label}</span>
                    <span className="block text-sm text-zinc-600">
                      użyto {code.usedCount} z {code.maxUses} · wydany {formatDate(code.createdAt)}
                      {code.expiresAt ? ` · ważny do ${formatDate(code.expiresAt)}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge tone={TONES[state]}>{BETA_CODE_STATE_LABELS[state]}</Badge>
                    {state === "available" ? (
                      <RevokeCodeForm label={code.label} action={revokeBetaCodeAction.bind(null, code.id)} />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-zinc-500">Jawnego kodu nie da się odczytać po utworzeniu: w bazie jest tylko jego skrót.</p>
      </section>
    </div>
  );
}
