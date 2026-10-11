import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fakerRU as faker } from "@faker-js/faker";
import { contacts, notes } from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Check your .env file.");
}

const CONTACTS_COUNT = 1000;

// Where I could know a person from
const relationships = [
  "Университет",
  "Школа",
  "Бывшая работа",
  "Текущая работа",
  "Конференция",
  "Через друзей",
  "Спортзал",
  "Соседи",
  "Родственник",
  "Клиент",
  "Подрядчик",
  "Хобби-клуб",
  "Волонтёрство",
  "Онлайн-знакомство",
];

// Phrases for notes — things we agreed on or talked about
const noteTemplates = [
  "Договорились созвониться на следующей неделе.",
  "Обсудили совместный проект, ждёт предложение.",
  "Переехал в другой город, сменил работу.",
  "Поздравил с днём рождения, был рад.",
  "Порекомендовал хорошего врача, нужно спросить контакт.",
  "Встретились за кофе, рассказал про новый стартап.",
  "Нужно отправить ему книгу, которую обещал.",
  "Ищет работу в маркетинге, помочь с рекомендацией.",
  "Познакомил с коллегой, хотят посотрудничать.",
  "Собирается в отпуск, вернётся через две недели.",
  "Просил скинуть контакт дизайнера.",
  "Обсудили цены на аренду, поделился опытом.",
  "Женился прошлым летом, теперь с семьёй.",
  "Увлёкся бегом, зовёт на утренние пробежки.",
  "Договорились встретиться на конференции в марте.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client);

  console.log("Clearing existing data...");
  await db.delete(notes);
  await db.delete(contacts);

  console.log(`Generating ${CONTACTS_COUNT} contacts...`);

  const contactRows = Array.from({ length: CONTACTS_COUNT }, () => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const hasEmail = Math.random() > 0.15;
    const hasPhone = Math.random() > 0.1;
    return {
      name: `${firstName} ${lastName}`,
      relationship: Math.random() > 0.1 ? pick(relationships) : null,
      phone: hasPhone ? faker.phone.number() : null,
      email: hasEmail
        ? faker.internet
            .email({ firstName: faker.string.alphanumeric(6), provider: pick(["gmail.com", "mail.ru", "yandex.ru", "outlook.com"]) })
            .toLowerCase()
        : null,
      createdAt: faker.date.past({ years: 3 }),
    };
  });

  // Insert contacts in batches and collect generated ids
  const insertedIds: number[] = [];
  const batchSize = 200;
  for (let i = 0; i < contactRows.length; i += batchSize) {
    const batch = contactRows.slice(i, i + batchSize);
    const rows = await db.insert(contacts).values(batch).returning({ id: contacts.id });
    insertedIds.push(...rows.map((r) => r.id));
  }

  console.log("Generating notes for a subset of contacts...");
  const noteRows: { contactId: number; body: string; createdAt: Date }[] = [];
  for (const id of insertedIds) {
    // ~60% of contacts have at least one note
    if (Math.random() > 0.4) {
      const count = 1 + Math.floor(Math.random() * 4);
      for (let n = 0; n < count; n++) {
        noteRows.push({
          contactId: id,
          body: pick(noteTemplates),
          createdAt: faker.date.recent({ days: 365 }),
        });
      }
    }
  }

  for (let i = 0; i < noteRows.length; i += batchSize) {
    const batch = noteRows.slice(i, i + batchSize);
    await db.insert(notes).values(batch);
  }

  console.log(`Done. Inserted ${insertedIds.length} contacts and ${noteRows.length} notes.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
