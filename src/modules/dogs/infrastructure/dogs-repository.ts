import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "@/shared/db/errors";
import { appError } from "@/shared/errors";
import { err, ok, type Result } from "@/shared/result";
import type { Dog, DogInput, DogNote, DogNoteInput, DogSex, NoteKind } from "../domain/dog";

const DOG_COLUMNS = "id, organization_id, client_id, name, breed, birth_date, sex, archived_at, created_at";
const NOTE_COLUMNS = "id, dog_id, kind, content, visible_to_client, valid_until, created_at";

type DogRow = {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  breed: string | null;
  birth_date: string | null;
  sex: DogSex;
  archived_at: string | null;
  created_at: string;
};

type NoteRow = {
  id: string;
  dog_id: string;
  kind: NoteKind;
  content: string;
  visible_to_client: boolean;
  valid_until: string | null;
  created_at: string;
};

function toDog(row: DogRow): Dog {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    name: row.name,
    breed: row.breed,
    birthDate: row.birth_date,
    sex: row.sex,
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
    createdAt: new Date(row.created_at),
  };
}

function toNote(row: NoteRow): DogNote {
  return {
    id: row.id,
    dogId: row.dog_id,
    kind: row.kind,
    content: row.content,
    visibleToClient: row.visible_to_client,
    validUntil: row.valid_until,
    createdAt: new Date(row.created_at),
  };
}

const dogNotFound = () => appError("not_found", "Nie znaleziono psa.");
const noteNotFound = () => appError("not_found", "Nie znaleziono notatki.");

export function dogsRepository(db: SupabaseClient) {
  return {
    async listByClient(
      organizationId: string,
      clientId: string,
      includeArchived = false,
    ): Promise<Result<Dog[]>> {
      let query = db
        .from("dogs")
        .select(DOG_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .order("name");
      if (!includeArchived) query = query.is("archived_at", null);

      const { data, error } = await query;
      if (error) return err(fromDbError(error));
      return ok((data as DogRow[]).map(toDog));
    },

    async get(organizationId: string, id: string): Promise<Result<Dog>> {
      const { data, error } = await db
        .from("dogs")
        .select(DOG_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(dogNotFound());
      return ok(toDog(data as DogRow));
    },

    async insert(
      organizationId: string,
      userId: string,
      clientId: string,
      input: DogInput,
    ): Promise<Result<Dog>> {
      const { data, error } = await db
        .from("dogs")
        .insert({
          organization_id: organizationId,
          client_id: clientId,
          name: input.name,
          breed: input.breed,
          birth_date: input.birthDate,
          sex: input.sex,
          created_by: userId,
        })
        .select(DOG_COLUMNS)
        .single();
      if (error) return err(fromDbError(error));
      return ok(toDog(data as DogRow));
    },

    async update(organizationId: string, id: string, input: DogInput): Promise<Result<Dog>> {
      const { data, error } = await db
        .from("dogs")
        .update({
          name: input.name,
          breed: input.breed,
          birth_date: input.birthDate,
          sex: input.sex,
        })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select(DOG_COLUMNS)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(dogNotFound());
      return ok(toDog(data as DogRow));
    },

    async setArchived(organizationId: string, id: string, archivedAt: Date | null): Promise<Result<Dog>> {
      const { data, error } = await db
        .from("dogs")
        .update({ archived_at: archivedAt ? archivedAt.toISOString() : null })
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select(DOG_COLUMNS)
        .maybeSingle();
      if (error) return err(fromDbError(error));
      if (!data) return err(dogNotFound());
      return ok(toDog(data as DogRow));
    },

    async listNotes(organizationId: string, dogId: string): Promise<Result<DogNote[]>> {
      const { data, error } = await db
        .from("dog_notes")
        .select(NOTE_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("dog_id", dogId)
        .order("created_at", { ascending: false });
      if (error) return err(fromDbError(error));
      return ok((data as NoteRow[]).map(toNote));
    },

    async insertNote(
      organizationId: string,
      userId: string,
      dogId: string,
      input: DogNoteInput,
    ): Promise<Result<DogNote>> {
      const { data, error } = await db
        .from("dog_notes")
        .insert({
          organization_id: organizationId,
          dog_id: dogId,
          kind: input.kind,
          content: input.content,
          visible_to_client: input.visibleToClient,
          valid_until: input.validUntil,
          created_by: userId,
        })
        .select(NOTE_COLUMNS)
        .single();
      if (error) return err(fromDbError(error));
      return ok(toNote(data as NoteRow));
    },

    async deleteNote(organizationId: string, id: string): Promise<Result<void>> {
      const { data, error } = await db
        .from("dog_notes")
        .delete()
        .eq("organization_id", organizationId)
        .eq("id", id)
        .select("id");
      if (error) return err(fromDbError(error));
      if (!data || data.length === 0) return err(noteNotFound());
      return ok(undefined);
    },
  };
}
