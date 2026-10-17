import Link from "next/link";
import { desc, or, sql, type Column, type SQL } from "drizzle-orm";
import { ChevronLeft, ChevronRight, Mail, Phone } from "lucide-react";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { SearchBox } from "@/components/search-box";
import { AddContactForm } from "@/components/add-contact-form";
import { Avatar } from "@/components/avatar";
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const query = q?.trim() ?? "";
  const currentPage = Math.max(1, Number(page) || 1);

  const pattern = buildPattern(query);
  const where = query
    ? or(
        fuzzyMatch(contacts.name, pattern),
        fuzzyMatch(contacts.phone, pattern),
        fuzzyMatch(contacts.email, pattern),
      )
    : undefined;

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

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Контакты</h1>
        <AddContactForm />
      </div>

      <SearchBox />

      <p className="text-sm text-muted-foreground">
        {query ? (
          <>Найдено: {total} по запросу «{query}»</>
        ) : (
          <>Всего контактов: {total}</>
        )}
      </p>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {query
            ? "Ничего не нашлось. Попробуйте другое имя."
            : "Пока нет контактов. Добавьте первый."}
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/contacts/${c.id}`} className="block">
                <Card className="p-4 shadow-none transition-colors hover:bg-accent">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={c.name} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.name}</p>
                        {c.relationship ? (
                          <p className="truncate text-sm text-muted-foreground">
                            {c.relationship}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="hidden shrink-0 flex-col items-end gap-1 text-sm text-muted-foreground sm:flex">
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
                  </div>
                </Card>
              </Link>
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
            className={safePage >= totalPages ? "pointer-events-none opacity-50" : ""}
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
