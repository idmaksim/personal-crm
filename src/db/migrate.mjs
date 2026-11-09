// Production migration runner.
//
// This is a plain-JS twin of migrate.ts so it can run inside the production
// Docker image, which has only runtime dependencies (no tsx / dotenv). It is
// executed as a one-shot container before the app starts: if it fails, the
// deploy aborts and the new image is never started.
//
// Env (DATABASE_URL) comes from the container, so there is no dotenv here.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
const ownerEmail = process.env.OWNER_EMAIL;

if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (!ownerEmail) {
  console.error("OWNER_EMAIL is not set.");
  process.exit(1);
}

// max: 1 keeps every migration statement on the same Postgres session, so the
// owner's email set below with set_config stays visible to the hand-written
// backfill migration that reads it back with current_setting.
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

try {
  console.log("Running migrations...");
  // Session-level (not transaction-local), so it survives into the migrator's
  // own transaction. Passed as a query parameter so the email itself never
  // appears in a logged SQL string.
  await client`select set_config('app.owner_email', ${ownerEmail}, false)`;
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await client.end();
} catch (err) {
  console.error(err);
  process.exit(1);
}
