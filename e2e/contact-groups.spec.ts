import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { loginAs } from "./support/login";

// Contact-groups scenarios (openspec/specs/contact-groups) driven through the
// real UI against the real Postgres (no mocks). Each test logs in as its own
// owner (a shared owner would hit the "3 magic links per 10 minutes" limit) and
// seeds its data straight into the same database the app reads. The teardown
// removes every owner matching this email prefix — cascading to their
// contacts/groups/contact_groups and Better Auth session/account rows.
const PREFIX = "E2E_TEST_";
const OWNER_EMAIL_PREFIX = "e2e_test_groups_";

// A token unique to each test, so names and owner emails never collide.
function uniq(): string {
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function uniqueOwnerEmail(): string {
  return `${OWNER_EMAIL_PREFIX}${uniq()}@example.com`;
}

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

type SeedSpec = {
  // Group names to create even if no contact uses them (e.g. an empty group).
  groups?: string[];
  // Contacts to create, each with the group names it belongs to. Any group
  // named here is created too, so it need not be repeated in `groups`.
  contacts: { name: string; groups?: string[] }[];
};

type SeedResult = {
  groupIds: Map<string, number>;
  contactIds: Map<string, number>;
};

// Seed groups, contacts and their links in one connection. Group names must be
// unique within the owner (the DB enforces it), which every test here respects.
async function seed(ownerId: string, spec: SeedSpec): Promise<SeedResult> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url);
  try {
    const groupIds = new Map<string, number>();
    const names = new Set<string>(spec.groups ?? []);
    for (const c of spec.contacts) for (const g of c.groups ?? []) names.add(g);
    for (const name of names) {
      const [row] = await sql<{ id: number }[]>`
        insert into groups (owner_id, name) values (${ownerId}, ${name})
        returning id
      `;
      groupIds.set(name, row.id);
    }

    const contactIds = new Map<string, number>();
    for (const c of spec.contacts) {
      const [row] = await sql<{ id: number }[]>`
        insert into contacts (owner_id, name) values (${ownerId}, ${c.name})
        returning id
      `;
      contactIds.set(c.name, row.id);
      for (const g of c.groups ?? []) {
        await sql`
          insert into contact_groups (contact_id, group_id)
          values (${row.id}, ${groupIds.get(g)!})
        `;
      }
    }

    return { groupIds, contactIds };
  } finally {
    await sql.end();
  }
}

// The group field (combobox) suggests existing groups as you type and offers to
// create a new name. Picking an existing suggestion: type its exact name so the
// only option shown is that suggestion.
async function pickExistingGroup(
  page: Page,
  fieldLabel: string,
  name: string,
): Promise<void> {
  await page.getByRole("combobox", { name: fieldLabel }).fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}

// Create a brand-new group by typing a name that does not exist yet and picking
// the "Создать «…»" row.
async function createGroupInField(
  page: Page,
  fieldLabel: string,
  name: string,
): Promise<void> {
  await page.getByRole("combobox", { name: fieldLabel }).fill(name);
  await page.getByRole("option", { name: /Создать/ }).click();
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

// Requirements "Назначение и снятие групп", "Метки групп у контакта", and the
// "create on the fly" part of "Создание группы".
test("card: assign on the fly and existing, show labels, de-dup, remove, list labels", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const run = uniq();
  const name = `${PREFIX}${run} Иван`;
  const { contactIds } = await seed(ownerId, {
    groups: ["Друзья"], // exists for this owner, unassigned
    contacts: [{ name }],
  });
  const id = contactIds.get(name)!;

  await page.goto(`/contacts/${id}`);
  const FIELD = "Добавить группу";

  // A brand-new name is created and assigned on the spot.
  await createGroupInField(page, FIELD, "Аналитики");
  await expect(
    page.getByRole("button", { name: "Снять группу Аналитики" }),
  ).toBeVisible();

  // An existing group is assigned from the suggestions.
  await pickExistingGroup(page, FIELD, "Друзья");
  await expect(
    page.getByRole("button", { name: "Снять группу Друзья" }),
  ).toBeVisible();

  // Re-adding the same group (different case) is refused — no duplicate link.
  await page.getByRole("combobox", { name: FIELD }).fill("друзья");
  await expect(page.getByText(/уже добавлена/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Снять группу Друзья" }),
  ).toHaveCount(1);
  await page.getByRole("combobox", { name: FIELD }).fill("");

  // Labels survive a reload (persisted, not just in the DOM).
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Снять группу Аналитики" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Снять группу Друзья" }),
  ).toBeVisible();

  // Both labels show in the contact's row on the list.
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Поиск контактов" }).fill(name);
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("Аналитики");
  await expect(row).toContainText("Друзья");

  // Removing a label drops it; the group itself and the contact remain.
  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  await page.getByRole("button", { name: "Снять группу Друзья" }).click();
  await expect(
    page.getByRole("button", { name: "Снять группу Друзья" }),
  ).toHaveCount(0);
  // "Друзья" is still a group of this owner (still suggested), only unassigned.
  await page.getByRole("combobox", { name: FIELD }).fill("Друзья");
  await expect(
    page.getByRole("option", { name: "Друзья", exact: true }),
  ).toBeVisible();
  // The contact itself is still here.
  await expect(page.getByText(name)).toBeVisible();
});

// Requirement "Группы при добавлении контакта".
test("add form: create a contact with a chosen and a new group, and one with none", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const run = uniq();
  const withGroups = `${PREFIX}${run} С группами`;
  const noGroups = `${PREFIX}${run} Без групп`;
  await seed(ownerId, { groups: ["Семья"], contacts: [] });

  const FIELD = "Выбрать или ввести новую";

  // A contact created with an existing group and a brand-new one.
  await page.goto("/");
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await page.locator("#name").fill(withGroups);
  await pickExistingGroup(page, FIELD, "Семья");
  await createGroupInField(page, FIELD, "Теннис");
  await expect(
    page.getByRole("button", { name: "Убрать группу Семья" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Убрать группу Теннис" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сохранить" }).click();

  // On the new contact's card both groups are shown.
  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  await expect(
    page.getByRole("button", { name: "Снять группу Семья" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Снять группу Теннис" }),
  ).toBeVisible();

  // A contact added with no groups is created without any.
  await page.goto("/");
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await page.locator("#name").fill(noGroups);
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page).toHaveURL(/\/contacts\/\d+$/);
  await expect(page.getByText("Групп пока нет")).toBeVisible();
});

// Requirement "Фильтр списка по группам".
test("home filter: narrow, intersection, non-empty only, impossible combo, search, clear", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const run = uniq();
  const p1 = `${PREFIX}${run} Alpha Анна`;
  const p2 = `${PREFIX}${run} Bravo Борис`;
  const p3 = `${PREFIX}${run} Charlie Вика`;
  // Теннис={p1,p2}, Семья={p1,p3}, Книги={p3}, Работа={} (empty).
  const { groupIds } = await seed(ownerId, {
    groups: ["Работа"],
    contacts: [
      { name: p1, groups: ["Теннис", "Семья"] },
      { name: p2, groups: ["Теннис"] },
      { name: p3, groups: ["Семья", "Книги"] },
    ],
  });

  await page.goto("/");

  // Only non-empty groups are offered: "Работа" (no contacts) is not shown.
  await expect(page.getByRole("button", { name: "Работа" })).toHaveCount(0);

  // Narrow to one group → only its contacts remain.
  await page.getByRole("button", { name: "Теннис" }).click();
  await expect(page.getByRole("link", { name: p1 })).toBeVisible();
  await expect(page.getByRole("link", { name: p2 })).toBeVisible();
  await expect(page.getByRole("link", { name: p3 })).toHaveCount(0);

  // With "Теннис" selected, only groups that still share a contact are offered:
  // "Семья" (shares p1) yes; "Книги" (only p3) no.
  await expect(page.getByRole("button", { name: "Семья" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Книги" })).toHaveCount(0);

  // Add a second group → intersection (contacts in both) only: p1.
  await page.getByRole("button", { name: "Семья" }).click();
  await expect(page.getByRole("link", { name: p1 })).toBeVisible();
  await expect(page.getByRole("link", { name: p2 })).toHaveCount(0);
  await expect(page.getByRole("link", { name: p3 })).toHaveCount(0);

  // Filter works together with search: keep "Теннис", search for p1 only.
  await page.goto(`/?group=${groupIds.get("Теннис")!}`);
  await page.getByRole("searchbox", { name: "Поиск контактов" }).fill("Alpha");
  await expect(page.getByRole("link", { name: p1 })).toBeVisible();
  await expect(page.getByRole("link", { name: p2 })).toHaveCount(0);
  // The group filter is still applied alongside the search.
  await expect(page.getByRole("button", { name: "Теннис" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // An empty intersection (reached via URL, e.g. a stale/edited link) shows a
  // clear "nothing found" message instead of the full list.
  await page.goto(
    `/?group=${groupIds.get("Теннис")!}&group=${groupIds.get("Книги")!}`,
  );
  await expect(page.getByText(/Ничего не нашлось/)).toBeVisible();
  await expect(page.getByText("Найдено: 0")).toBeVisible();

  // Clearing the filter shows every contact again.
  await page.goto("/");
  await page.getByRole("button", { name: "Теннис" }).click();
  await expect(page.getByRole("link", { name: p3 })).toHaveCount(0);
  await page.getByRole("button", { name: "Теннис" }).click();
  await expect(page.getByRole("link", { name: p1 })).toBeVisible();
  await expect(page.getByRole("link", { name: p2 })).toBeVisible();
  await expect(page.getByRole("link", { name: p3 })).toBeVisible();
});

// Requirements "Создание группы" (explicit page), "Переименование группы",
// "Удаление группы".
test("groups page: create, rename (+ taken, + empty), delete (+ cancel, keeps contacts)", async ({
  page,
}) => {
  const ownerEmail = uniqueOwnerEmail();
  await loginAs(page, ownerEmail);
  const ownerId = await getOwnerId(ownerEmail);
  const run = uniq();
  const member = `${PREFIX}${run} Член Теннис`;
  // "Теннис" has a contact so we can check deletion keeps the contact.
  const { contactIds } = await seed(ownerId, {
    contacts: [{ name: member, groups: ["Теннис"] }],
  });
  const memberId = contactIds.get(member)!;

  await page.goto("/groups");

  // Create a new group explicitly.
  await page
    .getByRole("textbox", { name: "Название новой группы" })
    .fill("Друзья");
  await page.getByRole("button", { name: "Создать" }).click();
  const friends = page.getByRole("listitem").filter({ hasText: "Друзья" });
  await expect(friends).toBeVisible();
  await expect(friends).toContainText("Нет контактов");

  // Rename it — the new name shows, the old one is gone.
  await page
    .getByRole("button", { name: "Переименовать группу Друзья" })
    .click();
  await page
    .getByRole("textbox", { name: "Новое название группы Друзья" })
    .fill("Коллеги");
  await page.getByRole("button", { name: "Сохранить название" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Коллеги" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Друзья" }),
  ).toHaveCount(0);

  // A name already taken (case-insensitive) is refused with a message.
  await page
    .getByRole("button", { name: "Переименовать группу Коллеги" })
    .click();
  const renameField = page.getByRole("textbox", {
    name: "Новое название группы Коллеги",
  });
  await renameField.fill("теннис");
  await page.getByRole("button", { name: "Сохранить название" }).click();
  await expect(
    page.getByText("Группа с таким названием уже есть"),
  ).toBeVisible();

  // An empty name is refused; the previous name stays.
  await renameField.fill("");
  await page.getByRole("button", { name: "Сохранить название" }).click();
  await expect(page.getByText("Введите название группы")).toBeVisible();
  await page.getByRole("button", { name: "Отменить переименование" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Коллеги" }),
  ).toBeVisible();

  // Cancelling a delete keeps the group.
  await page.getByRole("button", { name: "Удалить группу Коллеги" }).click();
  await page.getByRole("button", { name: "Отмена" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Коллеги" }),
  ).toBeVisible();

  // Confirming a delete removes the group; its contact stays (label gone).
  await page.getByRole("button", { name: "Удалить группу Теннис" }).click();
  await expect(
    page.getByRole("alertdialog").getByText("Удалить группу «Теннис»?"),
  ).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Удалить" })
    .click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Теннис" }),
  ).toHaveCount(0);

  // The contact that was in "Теннис" still exists, just without that label.
  await page.goto(`/contacts/${memberId}`);
  await expect(page.getByText(member)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Снять группу Теннис" }),
  ).toHaveCount(0);
});
