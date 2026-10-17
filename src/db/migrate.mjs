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

if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

try {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await client.end();
} catch (err) {
  console.error(err);
  process.exit(1);
}
