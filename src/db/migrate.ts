import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
// Typed as `string` (not `string | undefined`) so the check below narrows it
// for the async `main()` closure too, not just this module's top level.
const ownerEmail: string = process.env.OWNER_EMAIL ?? "";

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Check your .env file.");
}
if (!ownerEmail) {
  throw new Error("OWNER_EMAIL is not set. Check your .env file.");
}

// max: 1 keeps every migration statement on the same Postgres session, so the
// owner's email set below with set_config stays visible to the hand-written
// backfill migration that reads it back with current_setting.
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Running migrations...");
  // Session-level (not transaction-local), so it survives into the migrator's
  // own transaction. Passed as a query parameter so the email itself never
  // appears in a logged SQL string.
  await client`select set_config('app.owner_email', ${ownerEmail}, false)`;
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
