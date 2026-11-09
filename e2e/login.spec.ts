import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./support/login";

// Isolation between two users (spec: specs/user-auth/spec.md, "Изоляция данных
// по владельцу" and "Защита от доступа к чужим записям"). Runs against the
// real app, a real Postgres and the real Mailpit stub — no mocks.
const PREFIX = "e2e_test_";
const run = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const emailA = `${PREFIX}a_${run}@example.com`;
const emailB = `${PREFIX}b_${run}@example.com`;

test.afterAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = postgres(url);
  try {
    // Cascades to this user's contacts/groups (owner_id FK) and to their
    // Better Auth session/account rows.
    await sql`delete from "user" where email like ${PREFIX + "%"}`;
  } finally {
    await sql.end();
  }
});

test("пользователь Б не видит и не может открыть контакт пользователя А", async ({
  browser,
}) => {
  const contactName = `${PREFIX}${run} Контакт А`;

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await loginAs(pageA, emailA);

  await pageA.getByRole("button", { name: "Добавить контакт" }).click();
  await pageA.locator("#name").fill(contactName);
  await pageA.getByRole("button", { name: "Сохранить" }).click();
  await expect(pageA).toHaveURL(/\/contacts\/\d+$/);
  const contactUrlA = pageA.url();
  await contextA.close();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await loginAs(pageB, emailB);

  // Not in B's list.
  await expect(pageB.getByText(contactName)).toHaveCount(0);

  // Not found by B's search either.
  await pageB.goto("/");
  await pageB
    .getByRole("searchbox", { name: "Поиск контактов" })
    .fill(contactName);
  await expect(pageB.getByText(contactName)).toHaveCount(0);

  // A direct link to A's contact shows "not found", not A's data.
  await pageB.goto(contactUrlA);
  await expect(pageB.getByText("Контакт не найден")).toBeVisible();
  await expect(pageB.getByText(contactName)).toHaveCount(0);

  await contextB.close();
});
