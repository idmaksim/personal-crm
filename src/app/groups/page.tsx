import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { groups, contactGroups } from "@/db/schema";
import { CreateGroupForm } from "@/components/create-group-form";
import { GroupRow } from "@/components/group-row";
import { Card, CardContent } from "@/components/ui/card";

// Always render on request against the live database; never prerender at build
// time (the build runs without DATABASE_URL).
export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      contactCount: sql<number>`count(${contactGroups.contactId})::int`,
    })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .groupBy(groups.id)
    .orderBy(groups.name);

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> К списку
      </Link>

      <h1 className="text-2xl font-semibold">Группы</h1>

      <Card>
        <CardContent className="pt-6">
          <CreateGroupForm />
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Пока нет групп. Создайте первую выше.
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((group) => (
              <li key={group.id}>
                <GroupRow
                  group={{ id: group.id, name: group.name }}
                  contactCount={group.contactCount}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
