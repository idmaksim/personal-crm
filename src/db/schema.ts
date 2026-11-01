import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    contactIdx: index("notes_contact_id_idx").on(table.contactId),
  }),
);

// Labels the owner sorts contacts into (family, friends, tennis, …)
export const groups = pgTable(
  "groups",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Unique name, case-insensitive and folding "ё" into "е" — the same
    // normalization used for contact search, so "Теннис"/"теннис"/"тённис"
    // all count as one group.
    nameUniqueIdx: uniqueIndex("groups_name_unique_idx").on(
      sql`translate(lower(${table.name}), 'ё', 'е')`,
    ),
  }),
);

// Which contact belongs to which group (many-to-many)
export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.contactId, table.groupId] }),
    groupIdx: index("contact_groups_group_id_idx").on(table.groupId),
  }),
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
