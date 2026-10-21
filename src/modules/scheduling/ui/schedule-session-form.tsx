"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/shared/form";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/shared/ui/form-fields";
import { useTranslations } from "next-intl";

export type ScheduleClientOption = { id: string; name: string };
export type ScheduleDogOption = { id: string; clientId: string; name: string };
export type ScheduleTypeOption = { id: string; label: string };
export type ScheduleTrainerOption = { id: string; name: string };

export function ScheduleSessionForm({
  action,
  clients,
  dogs,
  types,
  trainers,
  defaults,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  clients: ScheduleClientOption[];
  dogs: ScheduleDogOption[];
  types: ScheduleTypeOption[];
  trainers: ScheduleTrainerOption[];
  defaults: { clientId?: string; date?: string; trainerId?: string };
}) {
  const tr = useTranslations();
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const v = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  const [clientId, setClientId] = useState(v("clientId", defaults.clientId ?? ""));
  const clientDogs = dogs.filter((d) => d.clientId === clientId);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{tr("scheduling.scheduleSessionForm.klient")}</span>
        <select
          name="clientId"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          aria-invalid={Boolean(errors.clientId?.length)}
          className="h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
        >
          <option value="">{tr("scheduling.scheduleSessionForm.wybierz_klienta")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.clientId?.length ? (
          <span role="alert" className="text-red-600">
            {errors.clientId.join(", ")}
          </span>
        ) : null}
      </label>

      <SelectField
        key={clientId}
        label={tr("common.pies")}
        name="dogId"
        defaultValue={v("dogId")}
        errors={errors.dogId}
        options={[
          { value: "", label: clientDogs.length === 0 ? tr("scheduling.scheduleSessionForm.client_has_no_dogs") : tr("scheduling.scheduleSessionForm.no_dog") },
          ...clientDogs.map((d) => ({ value: d.id, label: d.name })),
        ]}
      />

      <SelectField
        label={tr("scheduling.scheduleSessionForm.rodzaj_zajec")}
        name="sessionTypeId"
        defaultValue={v("sessionTypeId")}
        errors={errors.sessionTypeId}
        options={[{ value: "", label: "Wybierz rodzaj" }, ...types.map((t) => ({ value: t.id, label: t.label }))]}
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={tr("scheduling.scheduleSessionForm.data")}
          name="date"
          type="date"
          defaultValue={v("date", defaults.date ?? "")}
          errors={errors.date}
          required
        />
        <TextField label={tr("scheduling.scheduleSessionForm.godzina")} name="time" type="time" defaultValue={v("time", "10:00")} errors={errors.time} required />
      </div>

      <TextField label={tr("scheduling.scheduleSessionForm.miejsce_opcjonalnie")} name="location" defaultValue={v("location")} errors={errors.location} />

      {trainers.length > 1 ? (
        <SelectField
          label={tr("scheduling.scheduleSessionForm.trener")}
          name="trainerId"
          defaultValue={v("trainerId", defaults.trainerId ?? "")}
          errors={errors.trainerId}
          options={trainers.map((t) => ({ value: t.id, label: t.name }))}
        />
      ) : null}

      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel={tr("scheduling.scheduleSessionForm.planowanie")}>{tr("common.zaplanuj_zajecia")}</SubmitButton>
      </div>
    </form>
  );
}
