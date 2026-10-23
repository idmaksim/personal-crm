"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, notes } from "@/db/schema";

export type ActionState = { error?: string } | undefined;

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

  if (!name) {
    return { error: "Укажите имя контакта" };
  }

  let createdId: number;
  try {
    const [created] = await db
      .insert(contacts)
      .values({
        name,
        relationship: relationship || null,
        phone: phone || null,
        email: email || null,
      })
      .returning({ id: contacts.id });
    createdId = created.id;
  } catch (error) {
    logDbError("createContact", error);
    return { error: "Не удалось сохранить контакт. Попробуйте ещё раз." };
  }

  revalidatePath("/");
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
  if (!body) {
    return { error: "Заметка не может быть пустой" };
  }

  try {
    await db.insert(notes).values({ contactId, body });
  } catch (error) {
    logDbError("addNote", error);
    return { error: "Не удалось сохранить заметку. Попробуйте ещё раз." };
  }

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
