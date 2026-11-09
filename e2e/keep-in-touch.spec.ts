import { test, expect, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./support/login";

// Keep-in-touch scenarios driven through the real UI against the real Postgres
// (no mocks). To get a contact whose due date has already passed without waiting
// days, we seed it straight into the database with a back-dated created_at — the
// same database the app reads. Every seeded contact is named with this prefix,
// and each test logs in as its own owner (a shared owner across tests would hit
// the "3 magic links per 10 minutes" rate limit), so the teardown removes every
// owner matching this email prefix (cascades to their contacts/notes and
// Better Auth session/account).
const PREFIX = "E2E_TEST_";
const OWNER_EMAIL_PREFIX = "e2e_test_keep_in_touch_";

// A token unique to each test, so names (and owner emails) never collide
// across runs or tests.
function uniq(): string {
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function uniqueOwnerEmail(): string {
  return `${OWNER_EMAIL_PREFIX}${uniq()}@example.com`;
}

type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

// Only valid after loginAs(page, ownerEmail) has run (that's what creates the
// user).
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

// Insert a contact with a back-dated created_at. With no notes, created_at is
// also the "last contact" date the app counts the due date from. Returns its id.
async function seedContact(opts: {
  ownerId: string;
  name: string;
  relationship?: string | null;
  frequency?: Frequency | null;
  daysAgo: number;
}): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url);
  try {
    const [row] = await sql<{ id: number }[]>`
      insert into contacts (owner_id, name, relationship, frequency, created_at)
      values (
        ${opts.ownerId},
        ${opts.name},
        ${opts.relationship ?? null},
        ${opts.frequency ?? null}::contact_frequency,
        now() - (${opts.daysAgo} * interval '1 day')
      )
      returning id
    `;
    return row.id;
  } finally {
    await sql.end();
  }
}

// Read the count shown next to the "Пора связаться" heading.
async function readCount(block: Locator): Promise<number> {
  const text = await block.getByRole("heading").first().innerText();
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

// Reveal every overdue row. The block shows only the first few, with a
// "Показать ещё" button for the rest; the owner's real data can push a seeded
// contact behind it, so expand before asserting on specific rows.
async function expandBlock(page: Page): Promise<void> {
  const more = page.getByRole("button", { name: /Показать ещё/ });
  if (await more.count()) await more.first().click();
}

test.afterAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = postgres(url);
  try {
    // Cascades to each owner's contacts/notes and Better Auth session/account.
    await sql`delete from "user" where email like ${OWNER_EMAIL_PREFIX + "%"}`;
  } finally {
    await sql.end();
  }
});

test("home: the overdue block lists due contacts, longest-waiting first, above search", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const run = uniq();
  const longer = `${PREFIX}${run} A Долгожданный`;
  const shorter = `${PREFIX}${run} B Недавний`;
  // A: monthly, last contact 70 days ago -> due ~40 days ago (waits longest).
  await seedContact({
    ownerId,
    name: longer,
    frequency: "monthly",
    daysAgo: 70,
  });
  // B: weekly, last contact 20 days ago -> due 13 days ago.
  await seedContact({
    ownerId,
    name: shorter,
    relationship: "Коллега",
    frequency: "weekly",
    daysAgo: 20,
  });

  await page.goto("/");

  const block = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Пора связаться/ }),
  });
  await expect(block).toBeVisible();
  await expandBlock(page);

  // The block sits above the search box.
  const searchBox = page.getByRole("searchbox", { name: "Поиск контактов" });
  const blockBox = await block.boundingBox();
  const searchBoxBox = await searchBox.boundingBox();
  expect(blockBox!.y).toBeLessThan(searchBoxBox!.y);

  // The row shows name, relationship, frequency, last-contact date and wait text.
  const rowB = block.getByRole("listitem").filter({ hasText: shorter });
  await expect(rowB).toContainText("Коллега");
  await expect(rowB).toContainText("Раз в неделю");
  await expect(rowB).toContainText("последнее общение");
  await expect(rowB).toContainText("ждёт 13 дней");
  // "Просрочено" is deliberately never used.
  await expect(rowB).not.toContainText("росрочено");

  // The longest-waiting contact (A) appears above the shorter-waiting one (B).
  const names = await block.getByRole("link").allInnerTexts();
  const indexA = names.findIndex((t) => t.includes(longer));
  const indexB = names.findIndex((t) => t.includes(shorter));
  expect(indexA).toBeGreaterThanOrEqual(0);
  expect(indexB).toBeGreaterThan(indexA);
});

test("home: marking from the block removes the contact and shows a confirmation", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const run = uniq();
  const withText = `${PREFIX}${run} C Пётр`;
  const empty = `${PREFIX}${run} D Мария`;
  await seedContact({
    ownerId,
    name: withText,
    frequency: "monthly",
    daysAgo: 40,
  });
  await seedContact({
    ownerId,
    name: empty,
    frequency: "monthly",
    daysAgo: 40,
  });

  await page.goto("/");
  const block = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Пора связаться/ }),
  });
  await expect(block).toBeVisible();
  await expandBlock(page);

  const countBefore = await readCount(block);

  // Mark with a note text.
  await block
    .getByRole("button", { name: `Отметить разговор с ${withText}` })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("О чём говорили?");
  await dialog.getByLabel("О чём говорили?").fill("Созвонились, всё хорошо");
  await dialog.getByRole("button", { name: "Сохранить" }).click();

  // The contact leaves the block, a confirmation appears, the counter drops by 1.
  await expect(
    block.getByRole("listitem").filter({ hasText: withText }),
  ).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    `Записал разговор: ${withText}`,
  );
  await expect(page.getByRole("status")).toContainText("Следующий — после");
  await expect.poll(() => readCount(block)).toBe(countBefore - 1);

  // Mark the second one with an empty note — still records the talk.
  await block
    .getByRole("button", { name: `Отметить разговор с ${empty}` })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Сохранить" })
    .click();
  await expect(
    block.getByRole("listitem").filter({ hasText: empty }),
  ).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    `Записал разговор: ${empty}`,
  );
});

test("card: choosing a frequency saves immediately, with no Save button", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const name = `${PREFIX}${uniq()} E Контакт`;
  const id = await seedContact({ ownerId, name, frequency: null, daysAgo: 1 });

  await page.goto(`/contacts/${id}`);
  const trigger = page.locator("#frequency");
  await expect(trigger).toContainText("Не задано");

  await trigger.click();
  await page.getByRole("option", { name: "Раз в месяц" }).click();
  // No Save button: once the auto-submit lands, the card re-renders with the
  // next-contact line, which only appears when a frequency is set.
  await expect(page.getByText("Связаться снова")).toBeVisible();

  // The choice survives a reload (it is persisted, not just selected in the DOM).
  await page.reload();
  await expect(page.locator("#frequency")).toContainText("Раз в месяц");
});

test("card: an overdue contact shows the due note with the day count", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const name = `${PREFIX}${uniq()} F Просрочен`;
  // weekly, last contact 20 days ago -> due 13 days ago.
  const id = await seedContact({
    ownerId,
    name,
    frequency: "weekly",
    daysAgo: 20,
  });

  await page.goto(`/contacts/${id}`);
  await expect(page.getByText("Последнее общение:")).toBeVisible();
  await expect(page.getByText(/Пора связаться.*ждёт 13 дней/)).toBeVisible();
});

test("card: a contact in time shows when to get in touch next", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const name = `${PREFIX}${uniq()} G Свежий`;
  // monthly, last contact 3 days ago -> not due yet.
  const id = await seedContact({
    ownerId,
    name,
    frequency: "monthly",
    daysAgo: 3,
  });

  await page.goto(`/contacts/${id}`);
  await expect(page.getByText("Последнее общение:")).toBeVisible();
  await expect(page.getByText("Связаться снова:")).toBeVisible();
  await expect(page.getByText(/Пора связаться/)).toHaveCount(0);
});

test("card: without a frequency only the last-contact date is shown", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const name = `${PREFIX}${uniq()} H БезЧастоты`;
  const id = await seedContact({ ownerId, name, frequency: null, daysAgo: 5 });

  await page.goto(`/contacts/${id}`);
  await expect(page.getByText("Последнее общение:")).toBeVisible();
  await expect(page.getByText("Связаться снова:")).toHaveCount(0);
  await expect(page.getByText(/Пора связаться/)).toHaveCount(0);
});
