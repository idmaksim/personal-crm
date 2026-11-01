"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, notes, groups, contactGroups } from "@/db/schema";
import {
  formatShortDate,
  isContactFrequency,
  nextContactDate,
} from "@/lib/frequency";

// A Drizzle transaction handle, inferred from db.transaction's callback. Used by
// the group helpers so they can run inside a larger transaction.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Compare two group names the same way everywhere: case-insensitive and folding
// "ё" into "е" (matching contact search). Keeping this in one place guarantees
// the runtime "find" check and the functional unique index agree.
function sameNormalizedName(name: string) {
  return sql`translate(lower(${groups.name}), 'ё', 'е') = translate(lower(${name}), 'ё', 'е')`;
}

// Find a group by its normalized name, or create it; returns the group id.
// `name` must already be trimmed and non-empty. The unique index is the final
// guard against a race: if a concurrent insert wins, onConflictDoNothing yields
// no row and we fall back to a second lookup.
async function findOrCreateGroup(
  tx: DbTransaction,
  name: string,
): Promise<number> {
  const [existing] = await tx
    .select({ id: groups.id })
    .from(groups)
    .where(sameNormalizedName(name))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await tx
    .insert(groups)
    .values({ name })
    .onConflictDoNothing()
    .returning({ id: groups.id });
  if (created) return created.id;

  const [raced] = await tx
    .select({ id: groups.id })
    .from(groups)
    .where(sameNormalizedName(name))
    .limit(1);
  return raced.id;
}

// `message` is a confirmation to show after a successful save.
export type ActionState = { error?: string; message?: string } | undefined;

// Log that a database operation failed, without ever touching the data we tried
// to save. A raw Postgres error can carry the query parameters and the offending
// value (name, phone, email, note body) inside .message, .detail, .query and
// .parameters; logging the whole error would leak personal data into server logs.
// So we log only the operation name and the Postgres error code (SQLSTATE).
function logDbError(operation: string, error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "unknown";
  console.error(`DB operation "${operation}" failed (code: ${code})`);
}

export async function createContact(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const relationship = String(formData.get("relationship") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "");
  // Groups chosen in the form arrive as repeated "groups" fields (names).
  const groupNames = formData
    .getAll("groups")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!name) {
    return { error: "Укажите имя контакта" };
  }

  let createdId: number;
  try {
    createdId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(contacts)
        .values({
          name,
          relationship: relationship || null,
          phone: phone || null,
          email: email || null,
          frequency: isContactFrequency(frequency) ? frequency : null,
        })
        .returning({ id: contacts.id });

      // Create any missing groups and link them to the new contact in the same
      // transaction. onConflictDoNothing keeps it safe if the same name was
      // chosen twice (different casing/"ё").
      for (const groupName of groupNames) {
        const groupId = await findOrCreateGroup(tx, groupName);
        await tx
          .insert(contactGroups)
          .values({ contactId: created.id, groupId })
          .onConflictDoNothing();
      }

      return created.id;
    });
  } catch (error) {
    logDbError("createContact", error);
    return { error: "Не удалось сохранить контакт. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath("/groups");
  redirect(`/contacts/${createdId}`);
}

export async function addNote(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const contactId = Number(formData.get("contactId"));
  const body = String(formData.get("body") ?? "").trim();

  if (!Number.isInteger(contactId)) {
    return { error: "Контакт не найден" };
  }

  let message: string | undefined;
  try {
    const [contact] = await db
      .select({ name: contacts.name, frequency: contacts.frequency })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    if (!contact) {
      return { error: "Контакт не найден" };
    }

    // An empty body is saved as null: "we talked", nothing more to say.
    await db.insert(notes).values({ contactId, body: body || null });

    message = contact.frequency
      ? `Записал разговор: ${contact.name}. Следующий — после ${formatShortDate(
          nextContactDate(new Date(), contact.frequency),
        )}`
      : `Записал разговор: ${contact.name}`;
  } catch (error) {
    logDbError("addNote", error);
    return { error: "Не удалось сохранить заметку. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  return { message };
}

export async function setContactFrequency(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const contactId = Number(formData.get("contactId"));
  const value = String(formData.get("frequency") ?? "");

  if (!Number.isInteger(contactId)) {
    return { error: "Контакт не найден" };
  }
  if (value && !isContactFrequency(value)) {
    return { error: "Неизвестная частота общения" };
  }

  try {
    await db
      .update(contacts)
      .set({ frequency: isContactFrequency(value) ? value : null })
      .where(eq(contacts.id, contactId));
  } catch (error) {
    logDbError("setContactFrequency", error);
    return { error: "Не удалось сохранить частоту. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  return undefined;
}

export async function deleteContact(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const contactId = Number(formData.get("contactId"));

  if (!Number.isInteger(contactId)) {
    return { error: "Контакт не найден" };
  }

  try {
    // Notes are removed automatically by the ON DELETE cascade foreign key.
    await db.delete(contacts).where(eq(contacts.id, contactId));
  } catch (error) {
    logDbError("deleteContact", error);
    return { error: "Не удалось удалить контакт. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  redirect("/");
}

export async function addGroupToContact(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const contactId = Number(formData.get("contactId"));
  const name = String(formData.get("name") ?? "").trim();

  if (!Number.isInteger(contactId)) {
    return { error: "Контакт не найден" };
  }
  if (!name) {
    return { error: "Введите название группы" };
  }

  try {
    await db.transaction(async (tx) => {
      const groupId = await findOrCreateGroup(tx, name);
      // Idempotent: linking the same group again is a no-op (composite PK).
      await tx
        .insert(contactGroups)
        .values({ contactId, groupId })
        .onConflictDoNothing();
    });
  } catch (error) {
    logDbError("addGroupToContact", error);
    return { error: "Не удалось добавить группу. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath("/groups");
  revalidatePath(`/contacts/${contactId}`);
  return undefined;
}

export async function removeGroupFromContact(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const contactId = Number(formData.get("contactId"));
  const groupId = Number(formData.get("groupId"));

  if (!Number.isInteger(contactId) || !Number.isInteger(groupId)) {
    return { error: "Контакт или группа не найдены" };
  }

  try {
    // Only the link is removed; the group and the contact both stay.
    await db
      .delete(contactGroups)
      .where(
        and(
          eq(contactGroups.contactId, contactId),
          eq(contactGroups.groupId, groupId),
        ),
      );
  } catch (error) {
    logDbError("removeGroupFromContact", error);
    return { error: "Не удалось снять группу. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath("/groups");
  revalidatePath(`/contacts/${contactId}`);
  return undefined;
}

export async function createGroup(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Введите название группы" };
  }

  try {
    // Find-or-create by normalized name: an existing name (even in another case)
    // does not create a duplicate.
    await db.transaction(async (tx) => {
      await findOrCreateGroup(tx, name);
    });
  } catch (error) {
    logDbError("createGroup", error);
    return { error: "Не удалось создать группу. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath("/groups");
  return { message: `Группа «${name}» создана` };
}

export async function renameGroup(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const groupId = Number(formData.get("groupId"));
  const name = String(formData.get("name") ?? "").trim();

  if (!Number.isInteger(groupId)) {
    return { error: "Группа не найдена" };
  }
  if (!name) {
    return { error: "Введите название группы" };
  }

  try {
    // Reject a name already taken by a different group (case-insensitive, "ё"="е")
    // with a clear message instead of a raw unique-index error.
    const [clash] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(and(sameNormalizedName(name), sql`${groups.id} <> ${groupId}`))
      .limit(1);
    if (clash) {
      return { error: "Группа с таким названием уже есть" };
    }

    await db.update(groups).set({ name }).where(eq(groups.id, groupId));
  } catch (error) {
    logDbError("renameGroup", error);
    return { error: "Не удалось переименовать группу. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath("/groups");
  return { message: "Группа переименована" };
}

export async function deleteGroup(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const groupId = Number(formData.get("groupId"));

  if (!Number.isInteger(groupId)) {
    return { error: "Группа не найдена" };
  }

  try {
    // Contact links are removed automatically by the ON DELETE cascade; the
    // contacts themselves stay.
    await db.delete(groups).where(eq(groups.id, groupId));
  } catch (error) {
    logDbError("deleteGroup", error);
    return { error: "Не удалось удалить группу. Попробуйте ещё раз." };
  }

  revalidatePath("/");
  revalidatePath("/groups");
  return undefined;
}
