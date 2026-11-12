import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./support/login";

// Birthday scenarios driven through the real UI against the real Postgres (no
// mocks). Contacts with a birthday inside/outside the 7-day window are seeded
// straight into the database (the same one the app reads). Every seeded owner
// matches this email prefix, so teardown removes them (cascades to contacts).
const PREFIX = "E2E_TEST_";
const OWNER_EMAIL_PREFIX = "e2e_test_birthdays_";

function uniq(): string {
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function uniqueOwnerEmail(): string {
  return `${OWNER_EMAIL_PREFIX}${uniq()}@example.com`;
}

// Nominative month names shown in the month select (index 0 = January).
const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

async function getOwnerId(ownerEmail: string): Promise<string> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url);
  try {
    const [row] = await sql<{ id: string }[]>`
      select id from "user" where email = ${ownerEmail}
    `;
    if (!row) throw new Error(`Owner user ${ownerEmail} not found`);
    return row.id;
  } finally {
    await sql.end();
  }
}

// Day and month (1-indexed) of the date `offset` days from today.
function dayMonth(offset: number): { day: number; month: number } {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return { day: d.getDate(), month: d.getMonth() + 1 };
}

async function seedContact(opts: {
  ownerId: string;
  name: string;
  birthDay: number;
  birthMonth: number;
  birthYear?: number | null;
}): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url);
  try {
    const [row] = await sql<{ id: number }[]>`
      insert into contacts (owner_id, name, birth_day, birth_month, birth_year)
      values (
        ${opts.ownerId},
        ${opts.name},
        ${opts.birthDay},
        ${opts.birthMonth},
        ${opts.birthYear ?? null}
      )
      returning id
    `;
    return row.id;
  } finally {
    await sql.end();
  }
}

function block(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: /Скоро день рождения/ }),
  });
}

test.afterAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = postgres(url);
  try {
    await sql`delete from "user" where email like ${OWNER_EMAIL_PREFIX + "%"}`;
  } finally {
    await sql.end();
  }
});

test("home: the birthday block lists upcoming birthdays, nearest first, above search", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const run = uniq();

  const today = dayMonth(0);
  const inTwo = dayMonth(2);
  const far = dayMonth(10);

  const todayName = `${PREFIX}${run} A Сегодня`;
  const soonName = `${PREFIX}${run} B Через2`;
  const farName = `${PREFIX}${run} C Далёкий`;

  // Today's birthday, with a known year -> age is shown.
  await seedContact({
    ownerId,
    name: todayName,
    birthDay: today.day,
    birthMonth: today.month,
    birthYear: 1990,
  });
  // In two days, no year -> no age.
  await seedContact({
    ownerId,
    name: soonName,
    birthDay: inTwo.day,
    birthMonth: inTwo.month,
  });
  // Ten days away -> outside the 7-day window.
  await seedContact({
    ownerId,
    name: farName,
    birthDay: far.day,
    birthMonth: far.month,
  });

  await page.goto("/");

  const b = block(page);
  await expect(b).toBeVisible();

  // The block sits above the search box.
  const searchBox = page.getByRole("searchbox", { name: "Поиск контактов" });
  const blockBox = await b.boundingBox();
  const searchBoxBox = await searchBox.boundingBox();
  expect(blockBox!.y).toBeLessThan(searchBoxBox!.y);

  // Today's contact is shown as "сегодня" with the age; it comes first.
  const rowToday = b.getByRole("listitem").filter({ hasText: todayName });
  await expect(rowToday).toContainText("сегодня");
  await expect(rowToday).toContainText("исполнится");

  // The two-days contact is present but without an age (year unknown).
  const rowSoon = b.getByRole("listitem").filter({ hasText: soonName });
  await expect(rowSoon).toBeVisible();
  await expect(rowSoon).not.toContainText("исполнится");

  // The far contact does not appear.
  await expect(
    b.getByRole("listitem").filter({ hasText: farName }),
  ).toHaveCount(0);

  // Nearest first: today's contact is above the two-days one.
  const names = await b.getByRole("link").allInnerTexts();
  const indexToday = names.findIndex((t) => t.includes(todayName));
  const indexSoon = names.findIndex((t) => t.includes(soonName));
  expect(indexToday).toBeGreaterThanOrEqual(0);
  expect(indexSoon).toBeGreaterThan(indexToday);
});

test("home: the birthday block is hidden when no one has a birthday soon", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const far = dayMonth(20);
  await seedContact({
    ownerId,
    name: `${PREFIX}${uniq()} Нескоро`,
    birthDay: far.day,
    birthMonth: far.month,
  });

  await page.goto("/");
  await expect(block(page)).toHaveCount(0);
});

test("card: setting a birthday saves and persists, clearing removes it", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const today = dayMonth(0);
  const name = `${PREFIX}${uniq()} D Карточка`;
  const id = await seedContact({
    ownerId,
    name,
    birthDay: 1,
    birthMonth: 1,
  });

  const monthName = MONTH_NAMES[today.month - 1];

  // Set the birthday to today (with a year) via the card form.
  await page.goto(`/contacts/${id}`);
  await page.getByLabel("День рождения").fill(String(today.day));
  await page.getByLabel("Месяц рождения").click();
  await page.getByRole("option", { name: monthName, exact: true }).click();
  await page.getByLabel("Год рождения (необязательно)").fill("1990");
  // The Save button appears only once something changed; it disappears again
  // after the save lands.
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("button", { name: "Сохранить" })).toHaveCount(0);

  // It survives a reload and then shows up in the home block.
  await page.reload();
  await expect(page.getByLabel("День рождения")).toHaveValue(String(today.day));
  await page.goto("/");
  await expect(
    block(page).getByRole("listitem").filter({ hasText: name }),
  ).toBeVisible();

  // Clearing the fields removes the birthday and drops it from the block.
  await page.goto(`/contacts/${id}`);
  await page.getByLabel("День рождения").fill("");
  await page.getByLabel("Месяц рождения").click();
  await page.getByRole("option", { name: "Месяц", exact: true }).click();
  await page.getByLabel("Год рождения (необязательно)").fill("");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("button", { name: "Сохранить" })).toHaveCount(0);

  await page.goto("/");
  await expect(
    block(page).getByRole("listitem").filter({ hasText: name }),
  ).toHaveCount(0);
});
