import { describe, expect, it } from "vitest";
import {
  parseBirthdayInput,
  upcomingBirthdays,
  type BirthdayContact,
} from "./birthdays";

// A contact with a birthday; helpers below fill the parts a test does not care
// about.
function contact(partial: Partial<BirthdayContact>): BirthdayContact {
  return {
    id: 1,
    name: "Контакт",
    relationship: null,
    birthDay: 1,
    birthMonth: 1,
    birthYear: null,
    ...partial,
  };
}

describe("upcomingBirthdays", () => {
  it("includes a birthday today at the very top with daysUntil 0", () => {
    const today = new Date(2025, 4, 10); // 10 May 2025
    const result = upcomingBirthdays(
      [contact({ id: 1, name: "Сегодня", birthDay: 10, birthMonth: 5 })],
      today,
    );
    expect(result).toHaveLength(1);
    expect(result[0].daysUntil).toBe(0);
  });

  it("includes a birthday 6 days away but excludes one 7 days away", () => {
    const today = new Date(2025, 4, 10);
    const result = upcomingBirthdays(
      [
        contact({ id: 1, name: "Через6", birthDay: 16, birthMonth: 5 }),
        contact({ id: 2, name: "Через7", birthDay: 17, birthMonth: 5 }),
      ],
      today,
    );
    const names = result.map((r) => r.name);
    expect(names).toContain("Через6");
    expect(names).not.toContain("Через7");
  });

  it("excludes a birthday 10 days away", () => {
    const today = new Date(2025, 4, 10);
    const result = upcomingBirthdays(
      [contact({ birthDay: 20, birthMonth: 5 })],
      today,
    );
    expect(result).toHaveLength(0);
  });

  it("orders nearest birthday first", () => {
    const today = new Date(2025, 4, 10);
    const result = upcomingBirthdays(
      [
        contact({ id: 1, name: "Через5", birthDay: 15, birthMonth: 5 }),
        contact({ id: 2, name: "Через1", birthDay: 11, birthMonth: 5 }),
      ],
      today,
    );
    expect(result.map((r) => r.name)).toEqual(["Через1", "Через5"]);
  });

  it("wraps across the end of the year", () => {
    const today = new Date(2025, 11, 29); // 29 Dec 2025
    const result = upcomingBirthdays(
      [contact({ name: "Январь", birthDay: 2, birthMonth: 1 })],
      today,
    );
    expect(result).toHaveLength(1);
    expect(result[0].daysUntil).toBe(4);
  });

  it("celebrates a 29 Feb birthday on 28 Feb in a non-leap year", () => {
    const today = new Date(2025, 1, 25); // 25 Feb 2025 (non-leap)
    const result = upcomingBirthdays(
      [contact({ name: "Високосный", birthDay: 29, birthMonth: 2 })],
      today,
    );
    expect(result).toHaveLength(1);
    expect(result[0].daysUntil).toBe(3); // 28 Feb
    expect(result[0].date.getMonth()).toBe(1);
    expect(result[0].date.getDate()).toBe(28);
  });

  it("reports the age only when the birth year is known", () => {
    const today = new Date(2025, 4, 10);
    const [withYear, withoutYear] = upcomingBirthdays(
      [
        contact({
          id: 1,
          name: "СГодом",
          birthDay: 11,
          birthMonth: 5,
          birthYear: 1990,
        }),
        contact({ id: 2, name: "БезГода", birthDay: 12, birthMonth: 5 }),
      ],
      today,
    );
    expect(withYear.turningAge).toBe(35); // turns 35 in 2025
    expect(withoutYear.turningAge).toBeNull();
  });
});

describe("parseBirthdayInput", () => {
  it("treats all-empty input as 'no birthday'", () => {
    const result = parseBirthdayInput({ day: "", month: "", year: "" });
    expect(result).toEqual({
      ok: true,
      value: { birthDay: null, birthMonth: null, birthYear: null },
    });
  });

  it("rejects a year with no day and month", () => {
    const result = parseBirthdayInput({ day: "", month: "", year: "1990" });
    expect(result.ok).toBe(false);
  });

  it("rejects a day without a month", () => {
    const result = parseBirthdayInput({ day: "5", month: "", year: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-existent date (31 February)", () => {
    const result = parseBirthdayInput({ day: "31", month: "2", year: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects 30 February and 31 April", () => {
    expect(parseBirthdayInput({ day: "30", month: "2", year: "" }).ok).toBe(
      false,
    );
    expect(parseBirthdayInput({ day: "31", month: "4", year: "" }).ok).toBe(
      false,
    );
  });

  it("accepts a 29 February leap-day birthday", () => {
    const result = parseBirthdayInput({ day: "29", month: "2", year: "" });
    expect(result).toEqual({
      ok: true,
      value: { birthDay: 29, birthMonth: 2, birthYear: null },
    });
  });

  it("accepts day and month without a year", () => {
    const result = parseBirthdayInput({ day: "5", month: "5", year: "" });
    expect(result).toEqual({
      ok: true,
      value: { birthDay: 5, birthMonth: 5, birthYear: null },
    });
  });

  it("accepts a full date with a year", () => {
    const result = parseBirthdayInput({ day: "5", month: "5", year: "1990" });
    expect(result).toEqual({
      ok: true,
      value: { birthDay: 5, birthMonth: 5, birthYear: 1990 },
    });
  });
});
