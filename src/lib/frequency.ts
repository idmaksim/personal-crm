import type { ContactFrequency } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export const FREQUENCY_LABELS: Record<ContactFrequency, string> = {
  weekly: "Раз в неделю",
  monthly: "Раз в месяц",
  quarterly: "Раз в квартал",
  yearly: "Раз в год",
};

// "24 ноября", with the year only when it is not the current one.
export function formatShortDate(date: Date): string {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

export function isContactFrequency(value: unknown): value is ContactFrequency {
  return typeof value === "string" && value in FREQUENCY_LABELS;
}

// Add calendar months the way Postgres does: Jan 31 + 1 month = Feb 28/29.
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

// When we should talk to the contact again, counted from the last conversation.
export function nextContactDate(lastContactAt: Date, frequency: ContactFrequency): Date {
  switch (frequency) {
    case "weekly":
      return new Date(lastContactAt.getTime() + 7 * DAY_MS);
    case "monthly":
      return addMonths(lastContactAt, 1);
    case "quarterly":
      return addMonths(lastContactAt, 3);
    case "yearly":
      return addMonths(lastContactAt, 12);
  }
}

// Whole days the contact has been waiting past the due date; 0 if not overdue.
export function daysWaiting(nextAt: Date, now: Date = new Date()): number {
  if (nextAt.getTime() > now.getTime()) return 0;
  return Math.floor((now.getTime() - nextAt.getTime()) / DAY_MS);
}

export type ContactTiming = {
  lastContactAt: Date;
  // null when no frequency is set
  nextAt: Date | null;
  overdue: boolean;
  daysWaiting: number;
};

export function getContactTiming(
  lastContactAt: Date,
  frequency: ContactFrequency | null,
  now: Date = new Date(),
): ContactTiming {
  if (!frequency) {
    return { lastContactAt, nextAt: null, overdue: false, daysWaiting: 0 };
  }
  const nextAt = nextContactDate(lastContactAt, frequency);
  return {
    lastContactAt,
    nextAt,
    overdue: nextAt.getTime() <= now.getTime(),
    daysWaiting: daysWaiting(nextAt, now),
  };
}

// "1 день", "2 дня", "13 дней" — Russian plural for the waiting counter.
export function pluralizeDays(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} дней`;
  if (mod10 === 1) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} дня`;
  return `${n} дней`;
}
