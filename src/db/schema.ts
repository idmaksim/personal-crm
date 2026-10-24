import { pgEnum, pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";

// How often I want to talk to a contact; empty (null) means "not set"
export const contactFrequency = pgEnum("contact_frequency", [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);

export type ContactFrequency = (typeof contactFrequency.enumValues)[number];

// People I know personally
export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // How we know each other
    relationship: text("relationship"),
    phone: text("phone"),
    email: text("email"),
    frequency: contactFrequency("frequency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index("contacts_name_idx").on(table.name),
  }),
);

// Notes appended to a contact after talking to them
export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    // Empty (null) body means "we talked" without any details
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    contactIdx: index("notes_contact_id_idx").on(table.contactId),
  }),
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
