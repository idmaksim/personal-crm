import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import { NoteForm } from "@/components/note-form";
import { ContactFrequencyForm } from "@/components/contact-frequency-form";
import { getLastContactAt } from "@/lib/keep-in-touch";
import { formatShortDate, getContactTiming, pluralizeDays } from "@/lib/frequency";
import { DeleteContactButton } from "@/components/delete-contact-button";
import { Avatar } from "@/components/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Always render on request against the live database; never prerender at build
// time (the build runs without DATABASE_URL).
export const dynamic = "force-dynamic";

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

  const timing = getContactTiming(await getLastContactAt(contactId), contact.frequency);

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
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Avatar name={contact.name} className="size-12 shrink-0 text-base" />
              <div className="min-w-0">
                <CardTitle className="break-words text-2xl">
                  {contact.name}
                </CardTitle>
                {contact.relationship ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {contact.relationship}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="shrink-0">
              <DeleteContactButton
                contactId={contact.id}
                contactName={contact.name}
                variant="icon"
              />
            </div>
          </div>
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

      <Card>
        <CardContent className="space-y-4 pt-6">
          <ContactFrequencyForm contactId={contact.id} frequency={contact.frequency} />
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Последнее общение: </span>
              {formatShortDate(timing.lastContactAt)}
            </p>
            {timing.nextAt ? (
              timing.overdue ? (
                <p className="font-medium text-accent-ink">
                  Пора связаться — ждёт {pluralizeDays(timing.daysWaiting)}
                </p>
              ) : (
                <p>
                  <span className="text-muted-foreground">Связаться снова: </span>
                  после {formatShortDate(timing.nextAt)}
                </p>
              )
            ) : null}
          </div>
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
            Пока нет заметок. Отметьте первый разговор кнопкой «Пообщались».
          </p>
        ) : (
          <ul className="space-y-2">
            {noteList.map((note) => (
              <li key={note.id}>
                <Card>
                  <CardContent className="space-y-1 py-4">
                    <p className="whitespace-pre-wrap text-sm">
                      {note.body ?? "Пообщались"}
                    </p>
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
