import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import { NoteForm } from "@/components/note-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isInteger(contactId)) notFound();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) notFound();

  const noteList = await db
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt));

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> К списку
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{contact.name}</CardTitle>
          {contact.relationship ? (
            <p className="text-sm text-muted-foreground">{contact.relationship}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {contact.phone ? (
            <p className="flex items-center gap-2">
              <Phone className="size-4 text-muted-foreground" />
              <a href={`tel:${contact.phone}`} className="hover:underline">
                {contact.phone}
              </a>
            </p>
          ) : null}
          {contact.email ? (
            <p className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              <a href={`mailto:${contact.email}`} className="hover:underline">
                {contact.email}
              </a>
            </p>
          ) : null}
          {!contact.phone && !contact.email ? (
            <p className="text-muted-foreground">Контактов пока нет</p>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Заметки</h2>

        <Card>
          <CardContent className="pt-6">
            <NoteForm contactId={contact.id} />
          </CardContent>
        </Card>

        {noteList.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет заметок. Добавьте первую после разговора.
          </p>
        ) : (
          <ul className="space-y-2">
            {noteList.map((note) => (
              <li key={note.id}>
                <Card>
                  <CardContent className="space-y-1 py-4">
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(note.createdAt)}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
