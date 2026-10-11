"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contacts, notes } from "@/db/schema";

export type ActionState = { error?: string } | undefined;

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

  const [created] = await db
    .insert(contacts)
    .values({
      name,
      relationship: relationship || null,
      phone: phone || null,
      email: email || null,
    })
    .returning({ id: contacts.id });

  revalidatePath("/");
  redirect(`/contacts/${created.id}`);
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

  await db.insert(notes).values({ contactId, body });

  revalidatePath(`/contacts/${contactId}`);
  return undefined;
}
