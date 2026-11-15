import { test, expect } from "@playwright/test";
import postgres from "postgres";

// Spec: openspec/specs/user-auth/spec.md, "Лимит писем на одну почту" — no more
// than 3 emails per address per 10 minutes. The limit must hold even when
// requests for one address arrive at the same time: the check and the record
// happen as a single atomic DB step (see reserveMagicLinkSend in
// src/lib/magic-link-limit.ts). Runs against the real app, a real Postgres and
// the real Mailpit stub — no mocks.
const PREFIX = "e2e_limit_";
const run = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const email = `${PREFIX}${run}@example.com`;

const MAX_PER_WINDOW = 3;
const CONCURRENT_REQUESTS = 6;

test.afterAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = postgres(url);
  try {
    await sql`delete from magic_link_requests where email like ${PREFIX + "%"}`;
  } finally {
    await sql.end();
  }
});

test("одновременные запросы не пробивают лимит писем на один адрес", async ({
  baseURL,
  request,
}) => {
  // Fire several sign-in requests for the same fresh address at once. Without an
  // atomic check-and-record each one would read "0 sent so far" and send, so
  // more than the limit of 3 emails would go out.
  const responses = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, () =>
      request.post(`${baseURL}/api/auth/sign-in/magic-link`, {
        data: {
          email,
          callbackURL: "/",
          errorCallbackURL: "/login?expired=1",
        },
      }),
    ),
  );

  // The endpoint accepts every request — past the limit it just sends nothing,
  // without an error. The invariant is enforced in the database, so assert on
  // the recorded sends rather than on a status code.
  for (const res of responses) {
    expect(res.ok()).toBe(true);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url);
  try {
    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count
      from magic_link_requests
      where email = ${email}
    `;
    // Some requests got through (the address was fresh), but never more than the
    // limit, no matter that they arrived together.
    expect(rows[0].count).toBeGreaterThan(0);
    expect(rows[0].count).toBeLessThanOrEqual(MAX_PER_WINDOW);
  } finally {
    await sql.end();
  }
});
