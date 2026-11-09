import Link from "next/link";
import {
  and,
  desc,
  eq,
  inArray,
  notInArray,
  or,
  sql,
  type Column,
  type SQL,
} from "drizzle-orm";
import { ChevronLeft, ChevronRight, Mail, Phone } from "lucide-react";
import { db } from "@/db";
import { contacts, groups, contactGroups } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { SearchBox } from "@/components/search-box";
import { AddContactForm } from "@/components/add-contact-form";
import { DeleteContactButton } from "@/components/delete-contact-button";
import { GroupFilter } from "@/components/group-filter";
import { Avatar } from "@/components/avatar";
import { OverdueContacts } from "@/components/overdue-contacts";
import { getOverdueContacts } from "@/lib/keep-in-touch";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Always render on request against the live database; never prerender at build
// time (the build runs without DATABASE_URL).
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Case-insensitive substring match that also treats "е" and "ё" as the same
// letter. We lower-case both sides and fold "ё" into "е" so e.g. "Федоров"
// finds "Фёдоров". The pattern is compared with ESCAPE '\' so that any "%" or
// "_" the user typed (escaped in buildPattern) is matched literally instead of
// acting as a SQL wildcard.
function fuzzyMatch(column: Column, pattern: string): SQL {
  return sql`translate(lower(${column}), 'ё', 'е') like translate(lower(${pattern}), 'ё', 'е') escape '\'`;
}

// Turn raw user input into a LIKE pattern, escaping the wildcards "%", "_" and
// the escape char "\" itself so they match literally.
function buildPattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

// Read the repeatable ?group param (string | string[] | undefined) into a list
// of integer ids, dropping anything that is not a valid integer.
function parseGroupIds(raw: string | string[] | undefined): number[] {
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const ids: number[] = [];
  for (const value of values) {
    const id = Number(value);
    if (Number.isInteger(id)) ids.push(id);
  }
  return ids;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    group?: string | string[];
  }>;
}) {
  const user = await requireUser();
  const { q, page, group } = await searchParams;
  const query = q?.trim() ?? "";
  const currentPage = Math.max(1, Number(page) || 1);

  // All of this owner's groups, for the filter and its suggestions.
  const allGroups = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(eq(groups.ownerId, user.id))
    .orderBy(groups.name);

  // Keep only requested group ids that still exist (deleted/unknown ones are
  // silently dropped, so the list does not break when a group disappears).
  const existingGroupIds = new Set(allGroups.map((g) => g.id));
  const requestedGroupIds = parseGroupIds(group);
  const selectedGroupIds = requestedGroupIds.filter((id) =>
    existingGroupIds.has(id),
  );

  const pattern = buildPattern(query);
  const searchWhere = query
    ? or(
        fuzzyMatch(contacts.name, pattern),
        fuzzyMatch(contacts.phone, pattern),
        fuzzyMatch(contacts.email, pattern),
      )
    : undefined;

  // Contact ids in the intersection of the selected groups (belong to every one).
  const matchingContactIds =
    selectedGroupIds.length > 0
      ? db
          .select({ id: contactGroups.contactId })
          .from(contactGroups)
          .where(inArray(contactGroups.groupId, selectedGroupIds))
          .groupBy(contactGroups.contactId)
          .having(
            sql`count(distinct ${contactGroups.groupId}) = ${selectedGroupIds.length}`,
          )
      : undefined;

  const groupWhere = matchingContactIds
    ? inArray(contacts.id, matchingContactIds)
    : undefined;

  const where = and(eq(contacts.ownerId, user.id), searchWhere, groupWhere);

  // Groups offered in the filter, ordered from most-used to least-used. Empty
  // groups are left out. Once something is selected, only groups that still
  // share a contact with the whole selection are offered — so the owner cannot
  // build a combination that would show nothing.
  const candidateRows = matchingContactIds
    ? await db
        .select({
          id: groups.id,
          name: groups.name,
          cnt: sql<number>`count(distinct ${contactGroups.contactId})::int`,
        })
        .from(contactGroups)
        .innerJoin(groups, eq(contactGroups.groupId, groups.id))
        .where(
          and(
            eq(groups.ownerId, user.id),
            inArray(contactGroups.contactId, matchingContactIds),
            notInArray(groups.id, selectedGroupIds),
          ),
        )
        .groupBy(groups.id)
        .orderBy(
          sql`count(distinct ${contactGroups.contactId}) desc`,
          groups.name,
        )
    : await db
        .select({
          id: groups.id,
          name: groups.name,
          cnt: sql<number>`count(${contactGroups.contactId})::int`,
        })
        .from(groups)
        .innerJoin(contactGroups, eq(contactGroups.groupId, groups.id))
        .where(eq(groups.ownerId, user.id))
        .groupBy(groups.id)
        .orderBy(sql`count(${contactGroups.contactId}) desc`, groups.name);

  const candidateGroups = candidateRows.map((r) => ({
    id: r.id,
    name: r.name,
  }));
  // Selected groups keep their chosen order so they stay put as active chips.
  const groupNameById = new Map(allGroups.map((g) => [g.id, g.name]));
  const selectedGroups = selectedGroupIds.map((id) => ({
    id,
    name: groupNameById.get(id) ?? "",
  }));

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(contacts)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const rows = await db
    .select()
    .from(contacts)
    .where(where)
    .orderBy(desc(contacts.createdAt))
    .limit(PAGE_SIZE)
    .offset((safePage - 1) * PAGE_SIZE);

  // Group labels for the contacts shown on this page.
  const rowIds = rows.map((c) => c.id);
  const labelRows = rowIds.length
    ? await db
        .select({
          contactId: contactGroups.contactId,
          id: groups.id,
          name: groups.name,
        })
        .from(contactGroups)
        .innerJoin(groups, eq(contactGroups.groupId, groups.id))
        .where(inArray(contactGroups.contactId, rowIds))
        .orderBy(groups.name)
    : [];

  const groupsByContact = new Map<number, { id: number; name: string }[]>();
  for (const row of labelRows) {
    const list = groupsByContact.get(row.contactId) ?? [];
    list.push({ id: row.id, name: row.name });
    groupsByContact.set(row.contactId, list);
  }

  const overdue = await getOverdueContacts(user.id);

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    for (const id of selectedGroupIds) params.append("group", String(id));
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Контакты</h1>
        <AddContactForm allGroups={allGroups.map((g) => g.name)} />
      </div>

      <OverdueContacts contacts={overdue} />

      <SearchBox />

      <GroupFilter selected={selectedGroups} candidates={candidateGroups} />

      <p className="text-sm text-muted-foreground">
        {query || selectedGroupIds.length > 0 ? (
          <>Найдено: {total}</>
        ) : (
          <>Всего контактов: {total}</>
        )}
      </p>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {query || selectedGroupIds.length > 0
            ? "Ничего не нашлось. Попробуйте изменить запрос или фильтр."
            : "Добавь первый контакт"}
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Card className="relative p-4 shadow-none transition-colors hover:bg-band">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.name} />
                    <div className="min-w-0">
                      <Link
                        href={`/contacts/${c.id}`}
                        className="block truncate font-semibold after:absolute after:inset-0"
                      >
                        {c.name}
                      </Link>
                      {c.relationship ? (
                        <p className="truncate text-sm text-muted-foreground">
                          {c.relationship}
                        </p>
                      ) : null}
                      {(groupsByContact.get(c.id) ?? []).length > 0 ? (
                        <ul className="relative z-10 mt-1 flex flex-wrap gap-1">
                          {(groupsByContact.get(c.id) ?? []).map((g) => (
                            <li
                              key={g.id}
                              className="rounded-full bg-band px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {g.name}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="hidden flex-col items-end gap-1 text-sm text-muted-foreground sm:flex">
                      {c.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3.5" /> {c.phone}
                        </span>
                      ) : null}
                      {c.email ? (
                        <span className="flex items-center gap-1">
                          <Mail className="size-3.5" /> {c.email}
                        </span>
                      ) : null}
                    </div>
                    <div className="relative z-10">
                      <DeleteContactButton
                        contactId={c.id}
                        contactName={c.name}
                        variant="icon"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={safePage <= 1}
            className={safePage <= 1 ? "pointer-events-none opacity-50" : ""}
          >
            <Link href={buildHref(safePage - 1)}>
              <ChevronLeft /> Назад
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            Страница {safePage} из {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={safePage >= totalPages}
            className={
              safePage >= totalPages ? "pointer-events-none opacity-50" : ""
            }
          >
            <Link href={buildHref(safePage + 1)}>
              Вперёд <ChevronRight />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
