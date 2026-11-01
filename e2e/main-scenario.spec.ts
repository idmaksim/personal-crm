import { test, expect } from "@playwright/test";
import postgres from "postgres";

// The main scenario from specs/01-продуктовая-идея.md:
//   1. Open → see the list of all contacts
//   2. Add a contact → find it by name → append a note after a talk → it is saved
//   3. Open the same address in another browser → the same data is there
//
// Runs against the real app and the real Postgres (no mocks). Every contact the
// test creates is named with this prefix so the teardown can remove exactly
// those rows and leave the owner's real contacts untouched.
const PREFIX = "E2E_TEST_";

// A name unique to this run, so search finds our contact and ours only.
const unique = `${PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const contactName = `${unique} Иван`;
const noteText = `Договорились созвониться на той неделе — ${unique}`;

test.afterAll(async () => {
  // Remove the contacts this run created (notes are deleted by ON DELETE cascade).
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = postgres(url);
  try {
    await sql`delete from contacts where name like ${PREFIX + "%"}`;
  } finally {
    await sql.end();
  }
});

test("главный сценарий: открыл → добавил → нашёл → записал заметку → сохранилось", async ({
  page,
  browser,
}) => {
  // 1. Open → the contacts list is shown.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();

  // 2a. Add a contact.
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await page.locator("#name").fill(contactName);
  await page.getByRole("button", { name: "Сохранить" }).click();

  // Saving a contact redirects to its card.
  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  await expect(page.getByText(contactName)).toBeVisible();
  const contactUrl = page.url();

  // 2b. Back to the list and find the contact by name via search.
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Поиск контактов" }).fill(contactName);
  const contactLink = page.getByRole("link", { name: contactName });
  await expect(contactLink).toBeVisible();

  // 2c. Open the card and append a note after a talk.
  await contactLink.click();
  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  await page.getByRole("button", { name: "Пообщались" }).click();
  await page.getByLabel("Как пообщались?").fill(noteText);
  await page.getByRole("button", { name: "Сохранить" }).click();

  // The note is saved and shown on the card.
  await expect(page.getByText(noteText)).toBeVisible();

  // 2d. The note survives a reload (it is persisted, not just in the DOM).
  await page.reload();
  await expect(page.getByText(noteText)).toBeVisible();

  // 3. Open the same address in another browser → the same data is there.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto(contactUrl);
  await expect(otherPage.getByText(contactName)).toBeVisible();
  await expect(otherPage.getByText(noteText)).toBeVisible();
  await otherContext.close();
});
