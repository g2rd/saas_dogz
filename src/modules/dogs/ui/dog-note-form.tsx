"use client";

import { useActionState } from "react";
import type { FormState } from "@/shared/form";
import {
  CheckboxField,
  FormMessage,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/shared/ui/form-fields";
import { NOTE_KINDS } from "../domain/dog";
import { useTranslations } from "next-intl";

export function DogNoteForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const t = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  // React 19 czyści formularz po akcji; po błędzie wracamy do tego, co wpisał użytkownik.
  const v = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <SelectField
        label={t("dogs.dogNoteForm.rodzaj")}
        name="kind"
        defaultValue={v("kind", "other")}
        options={NOTE_KINDS.map((k) => ({ value: k, label: t(`labels.noteKind.${k}`) }))}
      />
      <TextAreaField label={t("dogs.dogNoteForm.tresc")} name="content" defaultValue={v("content")} errors={errors.content} required />
      <TextField label={t("dogs.dogNoteForm.wazne_do")} name="validUntil" type="date" defaultValue={v("validUntil")} errors={errors.validUntil} />
      <CheckboxField
        label={t("dogs.dogNoteForm.widoczna_dla_klienta")}
        name="visibleToClient"
        defaultChecked={state.values ? "visibleToClient" in state.values : false}
        hint={t("dogs.dogNoteForm.domyslnie_notatka_jest_prywatna_i_widzi")}
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton>{t("common.dodaj_notatke")}</SubmitButton>
      </div>
    </form>
  );
}
