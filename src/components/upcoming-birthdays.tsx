import Link from "next/link";
import type { UpcomingBirthday } from "@/lib/birthdays";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";

// "сегодня" / "завтра" for the nearest days, otherwise "15 мая".
function formatBirthday(item: UpcomingBirthday): string {
  if (item.daysUntil === 0) return "сегодня";
  if (item.daysUntil === 1) return "завтра";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(item.date);
}

// Russian plural for "год / года / лет".
function pluralizeYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word: string;
  if (mod10 === 1 && mod100 !== 11) word = "год";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    word = "года";
  else word = "лет";
  return `${n} ${word}`;
}

export function UpcomingBirthdays({ items }: { items: UpcomingBirthday[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        Скоро день рождения{" "}
        <span className="text-sm font-normal text-muted-foreground">
          {items.length}
        </span>
      </h2>
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.id}>
            <Card className="p-4 shadow-none">
              <div className="flex items-center gap-3">
                <Avatar name={c.name} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="truncate font-semibold hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="text-sm font-medium text-accent-ink">
                      {formatBirthday(c)}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {[
                      c.relationship,
                      c.turningAge !== null
                        ? `исполнится ${pluralizeYears(c.turningAge)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
