import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// Reuse the client/db across hot reloads in development to avoid exhausting
// connections.
const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
  db: DB | undefined;
};

function createDb(): DB {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Check your .env file.");
  }

  const client = globalForDb.client ?? postgres(connectionString);

  if (process.env.NODE_ENV !== "production") {
    globalForDb.client = client;
  }

  return drizzle(client, { schema });
}

// Lazy: the connection is created on first use, not when this module is
// imported. This lets `next build` import route modules without a database
// (the build runs without DATABASE_URL); the error only fires if a request
// actually tries to use the database while it is unset.
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const instance = globalForDb.db ?? (globalForDb.db = createDb());
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
