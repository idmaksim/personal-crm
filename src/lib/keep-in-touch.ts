import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, notes, type ContactFrequency } from "@/db/schema";
import { daysWaiting } from "@/lib/frequency";

// Postgres interval matching each frequency; keep in sync with nextContactDate.
const FREQUENCY_INTERVAL_SQL = sql`case ${contacts.frequency}
  when 'weekly' then interval '7 days'
  when 'monthly' then interval '1 month'
  when 'quarterly' then interval '3 months'
  when 'yearly' then interval '1 year'
end`;

// Latest note date, or the date the contact was added if there are no notes yet.
export async function getLastContactAt(contactId: number): Promise<Date> {
  const [row] = await db
    .select({
      lastContactAt: sql<Date>`coalesce(max(${notes.createdAt}), ${contacts.createdAt})`.mapWith(
        (v) => new Date(v),
      ),
    })
    .from(contacts)
    .leftJoin(notes, eq(notes.contactId, contacts.id))
    .where(eq(contacts.id, contactId))
    .groupBy(contacts.id);
  return row.lastContactAt;
}

export type OverdueContact = {
  id: number;
  name: string;
  relationship: string | null;
  frequency: ContactFrequency;
  lastContactAt: Date;
  nextAt: Date;
  daysWaiting: number;
};

// Contacts with a frequency whose next-contact date has passed, longest-waiting first.
export async function getOverdueContacts(): Promise<OverdueContact[]> {
  const lastContactAt = sql<string>`coalesce(max(${notes.createdAt}), ${contacts.createdAt})`;
  const nextAt = sql<string>`${lastContactAt} + ${FREQUENCY_INTERVAL_SQL}`;

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      relationship: contacts.relationship,
      frequency: contacts.frequency,
      lastContactAt,
      nextAt,
    })
    .from(contacts)
    .leftJoin(notes, eq(notes.contactId, contacts.id))
    .where(sql`${contacts.frequency} is not null`)
    .groupBy(contacts.id)
    .having(sql`${nextAt} <= now()`)
    .orderBy(asc(nextAt));

  const now = new Date();
  return rows.map((row) => {
    const next = new Date(row.nextAt);
    return {
      id: row.id,
      name: row.name,
      relationship: row.relationship,
      frequency: row.frequency as ContactFrequency,
      lastContactAt: new Date(row.lastContactAt),
      nextAt: next,
      daysWaiting: daysWaiting(next, now),
    };
  });
}
