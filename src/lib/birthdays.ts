import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

// How many calendar days the "Скоро день рождения" block looks ahead, counting
// today as day 0. Seven days means today plus the next six.
export const BIRTHDAY_WINDOW_DAYS = 7;

// A contact with a birthday set. Day and month are always present together; the
// year is optional (many people only know the day and month).
export type BirthdayContact = {
  id: number;
  name: string;
  relationship: string | null;
  birthDay: number;
  birthMonth: number;
  birthYear: number | null;
};

// A contact whose birthday falls inside the look-ahead window.
export type UpcomingBirthday = {
  id: number;
  name: string;
  relationship: string | null;
  // The day the birthday is celebrated this time around (29 Feb falls on 28 Feb
  // in a non-leap year).
  date: Date;
  // 0 = today, up to BIRTHDAY_WINDOW_DAYS - 1.
  daysUntil: number;
  // How old the contact turns on this birthday; null when the year is unknown.
  turningAge: number | null;
};

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// The date a (month, day) birthday is celebrated in a given year. A 29 February
// birthday falls on 28 February in a non-leap year so it is never skipped.
function occurrenceInYear(month: number, day: number, year: number): Date {
  let celebratedDay = day;
  if (month === 2 && day === 29 && !isLeapYear(year)) celebratedDay = 28;
  return new Date(year, month - 1, celebratedDay);
}

// Midnight of the given date in local time, so day differences are whole days.
function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Pure: of the given contacts, those whose birthday falls within the look-ahead
// window starting at `today`, nearest first (ties broken by name). The DB query
// is responsible for passing only contacts that have a birthday set.
export function upcomingBirthdays(
  contacts: BirthdayContact[],
  today: Date,
): UpcomingBirthday[] {
  const start = atMidnight(today);

  const result: UpcomingBirthday[] = [];
  for (const c of contacts) {
    // The next time this birthday comes round, from today onward. Try this year
    // first; if it has already passed, roll to next year.
    let occ = occurrenceInYear(c.birthMonth, c.birthDay, start.getFullYear());
    if (occ.getTime() < start.getTime()) {
      occ = occurrenceInYear(c.birthMonth, c.birthDay, start.getFullYear() + 1);
    }

    const daysUntil = Math.round((occ.getTime() - start.getTime()) / DAY_MS);
    if (daysUntil > BIRTHDAY_WINDOW_DAYS - 1) continue;

    result.push({
      id: c.id,
      name: c.name,
      relationship: c.relationship,
      date: occ,
      daysUntil,
      turningAge: c.birthYear === null ? null : occ.getFullYear() - c.birthYear,
    });
  }

  result.sort((a, b) =>
    a.daysUntil !== b.daysUntil
      ? a.daysUntil - b.daysUntil
      : a.name.localeCompare(b.name, "ru"),
  );
  return result;
}

// The given owner's contacts whose birthday falls within the look-ahead window,
// nearest first. Only this owner's contacts are read.
export async function getUpcomingBirthdays(
  ownerId: string,
): Promise<UpcomingBirthday[]> {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      relationship: contacts.relationship,
      birthDay: contacts.birthDay,
      birthMonth: contacts.birthMonth,
      birthYear: contacts.birthYear,
    })
    .from(contacts)
    .where(and(eq(contacts.ownerId, ownerId), isNotNull(contacts.birthDay)));

  // birthDay is not null guarantees birthMonth is not null too (CHECK
  // constraint), so these are safe BirthdayContact values.
  const withBirthday = rows.map((r) => ({
    ...r,
    birthDay: r.birthDay as number,
    birthMonth: r.birthMonth as number,
  }));

  return upcomingBirthdays(withBirthday, new Date());
}

// Longest day of each month (1-indexed), with February at 29 so a leap-day
// birthday is allowed. Day-in-month validity beyond this (knowing the exact
// year) is intentionally not enforced, since the year is optional.
const MAX_DAY_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Minimum year accepted; mirrors the CHECK constraint in the schema.
const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = 2100;

export type BirthdayParseResult =
  | {
      ok: true;
      value: {
        birthDay: number | null;
        birthMonth: number | null;
        birthYear: number | null;
      };
    }
  | { ok: false; error: string };

// Validate raw birthday form input on the server. Day and month must be given
// together; the year is optional but requires a day and month. An empty input
// means "no birthday". Rejects non-existent dates (e.g. 31 February).
export function parseBirthdayInput(input: {
  day?: string | null;
  month?: string | null;
  year?: string | null;
}): BirthdayParseResult {
  const dayRaw = (input.day ?? "").trim();
  const monthRaw = (input.month ?? "").trim();
  const yearRaw = (input.year ?? "").trim();

  // Nothing filled in: the birthday is cleared.
  if (!dayRaw && !monthRaw && !yearRaw) {
    return {
      ok: true,
      value: { birthDay: null, birthMonth: null, birthYear: null },
    };
  }

  if (!dayRaw || !monthRaw) {
    return {
      ok: false,
      error: "Укажите и день, и месяц дня рождения",
    };
  }

  const day = Number(dayRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: "Неверный месяц дня рождения" };
  }
  if (!Number.isInteger(day) || day < 1 || day > MAX_DAY_IN_MONTH[month - 1]) {
    return { ok: false, error: "Такого дня в этом месяце нет" };
  }

  let year: number | null = null;
  if (yearRaw) {
    year = Number(yearRaw);
    if (
      !Number.isInteger(year) ||
      year < MIN_BIRTH_YEAR ||
      year > MAX_BIRTH_YEAR
    ) {
      return { ok: false, error: "Неверный год рождения" };
    }
  }

  return {
    ok: true,
    value: { birthDay: day, birthMonth: month, birthYear: year },
  };
}
