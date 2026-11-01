import { describe, expect, it } from "vitest";
import {
  daysWaiting,
  formatShortDate,
  getContactTiming,
  isContactFrequency,
  nextContactDate,
  pluralizeDays,
} from "./frequency";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("nextContactDate", () => {
  it("weekly is 7 days later", () => {
    const next = nextContactDate(new Date(2024, 0, 1), "weekly");
    expect(next).toEqual(new Date(2024, 0, 8));
  });

  it("monthly is one calendar month later", () => {
    const next = nextContactDate(new Date(2024, 0, 15), "monthly");
    expect(next).toEqual(new Date(2024, 1, 15));
  });

  it("quarterly is three calendar months later", () => {
    const next = nextContactDate(new Date(2024, 0, 15), "quarterly");
    expect(next).toEqual(new Date(2024, 3, 15));
  });

  it("yearly is twelve calendar months later", () => {
    const next = nextContactDate(new Date(2024, 0, 15), "yearly");
    expect(next).toEqual(new Date(2025, 0, 15));
  });

  it("clamps the day to the end of a shorter month (Jan 31 + 1 month)", () => {
    // Non-leap year: Feb has 28 days.
    expect(nextContactDate(new Date(2025, 0, 31), "monthly")).toEqual(
      new Date(2025, 1, 28),
    );
    // Leap year: Feb has 29 days.
    expect(nextContactDate(new Date(2024, 0, 31), "monthly")).toEqual(
      new Date(2024, 1, 29),
    );
  });
});

describe("daysWaiting", () => {
  it("is 0 when the next-contact date is still in the future", () => {
    const now = new Date(2024, 5, 1);
    const future = new Date(now.getTime() + 3 * DAY_MS);
    expect(daysWaiting(future, now)).toBe(0);
  });

  it("is 0 exactly at the due moment", () => {
    const now = new Date(2024, 5, 1);
    expect(daysWaiting(now, now)).toBe(0);
  });

  it("counts whole days past the due date", () => {
    const now = new Date(2024, 5, 14);
    const due = new Date(now.getTime() - 13 * DAY_MS);
    expect(daysWaiting(due, now)).toBe(13);
  });

  it("floors a partial day", () => {
    const now = new Date(2024, 5, 14);
    const due = new Date(now.getTime() - (13 * DAY_MS + DAY_MS / 2));
    expect(daysWaiting(due, now)).toBe(13);
  });
});

describe("getContactTiming", () => {
  it("returns no due date when frequency is not set", () => {
    const last = new Date(2024, 0, 1);
    const timing = getContactTiming(last, null, new Date(2024, 11, 1));
    expect(timing).toEqual({
      lastContactAt: last,
      nextAt: null,
      overdue: false,
      daysWaiting: 0,
    });
  });

  it("is not overdue when the next date is in the future", () => {
    const last = new Date(2024, 5, 1);
    const now = new Date(2024, 5, 4); // 3 days after last, monthly not due yet
    const timing = getContactTiming(last, "monthly", now);
    expect(timing.nextAt).toEqual(new Date(2024, 6, 1));
    expect(timing.overdue).toBe(false);
    expect(timing.daysWaiting).toBe(0);
  });

  it("is overdue with a day count once the next date has passed", () => {
    const now = new Date(2024, 5, 14);
    const last = new Date(now.getTime() - 40 * DAY_MS); // monthly: due ~10 days ago
    const timing = getContactTiming(last, "monthly", now);
    expect(timing.overdue).toBe(true);
    expect(timing.daysWaiting).toBeGreaterThan(0);
    expect(timing.nextAt).toEqual(nextContactDate(last, "monthly"));
  });

  it("is overdue exactly at the due moment", () => {
    const last = new Date(2024, 5, 1);
    const now = nextContactDate(last, "weekly"); // exactly due
    const timing = getContactTiming(last, "weekly", now);
    expect(timing.overdue).toBe(true);
    expect(timing.daysWaiting).toBe(0);
  });
});

describe("pluralizeDays", () => {
  it("uses the singular for 1 and 21", () => {
    expect(pluralizeDays(1)).toBe("1 день");
    expect(pluralizeDays(21)).toBe("21 день");
    expect(pluralizeDays(101)).toBe("101 день");
  });

  it("uses the few form for 2-4, 22-24", () => {
    expect(pluralizeDays(2)).toBe("2 дня");
    expect(pluralizeDays(3)).toBe("3 дня");
    expect(pluralizeDays(4)).toBe("4 дня");
    expect(pluralizeDays(22)).toBe("22 дня");
  });

  it("uses the many form for 5-20 and the 11-14 teens", () => {
    expect(pluralizeDays(5)).toBe("5 дней");
    expect(pluralizeDays(11)).toBe("11 дней");
    expect(pluralizeDays(13)).toBe("13 дней");
    expect(pluralizeDays(14)).toBe("14 дней");
    expect(pluralizeDays(20)).toBe("20 дней");
    expect(pluralizeDays(25)).toBe("25 дней");
    expect(pluralizeDays(111)).toBe("111 дней");
  });
});

describe("formatShortDate", () => {
  it('formats a date in the current year without the year ("24 ноября")', () => {
    const thisYear = new Date().getFullYear();
    expect(formatShortDate(new Date(thisYear, 10, 24))).toBe("24 ноября");
  });

  it("includes the year for a date in a different year", () => {
    const otherYear = new Date().getFullYear() - 5;
    const formatted = formatShortDate(new Date(otherYear, 10, 24));
    expect(formatted).toContain("24 ноября");
    expect(formatted).toContain(String(otherYear));
  });
});

describe("isContactFrequency", () => {
  it("accepts the four known frequencies", () => {
    expect(isContactFrequency("weekly")).toBe(true);
    expect(isContactFrequency("monthly")).toBe(true);
    expect(isContactFrequency("quarterly")).toBe(true);
    expect(isContactFrequency("yearly")).toBe(true);
  });

  it("rejects empty, unknown, and non-string values", () => {
    expect(isContactFrequency("")).toBe(false);
    expect(isContactFrequency("daily")).toBe(false);
    expect(isContactFrequency(null)).toBe(false);
    expect(isContactFrequency(undefined)).toBe(false);
    expect(isContactFrequency(7)).toBe(false);
    expect(isContactFrequency({})).toBe(false);
  });
});
