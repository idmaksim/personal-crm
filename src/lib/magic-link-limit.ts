import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { magicLinkRequests } from "@/db/schema";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;

// Pure rule: sending one more magic link now would be the 4th (or later) to
// this address within the last 10 minutes.
export function exceedsMagicLinkLimit(sentAt: Date[], now: Date): boolean {
  const windowStart = now.getTime() - WINDOW_MS;
  const recent = sentAt.filter((t) => t.getTime() > windowStart);
  return recent.length >= MAX_PER_WINDOW;
}

// Read-only check, used to decide what message to show before even trying to
// send (the form path). `email` must already be normalized.
export async function isMagicLinkRateLimited(email: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const rows = await db
    .select({ createdAt: magicLinkRequests.createdAt })
    .from(magicLinkRequests)
    .where(
      and(
        eq(magicLinkRequests.email, email),
        gt(magicLinkRequests.createdAt, windowStart),
      ),
    );
  return exceedsMagicLinkLimit(
    rows.map((r) => r.createdAt),
    new Date(),
  );
}

// Atomically reserve a send slot: the check and the record happen as one DB
// step, so the limit holds even when requests for one address arrive at the same
// time. In a single transaction it takes a Postgres advisory lock keyed on the
// address (so same-address requests queue instead of all passing the count check
// at once), counts the sends still inside the window, and inserts a new row only
// if the limit is not yet reached. Returns the new row's id when a slot was
// taken — the caller may send the email, and must releaseMagicLinkSend(id) if
// the send ultimately fails — or null when the limit is already reached. This is
// the source of truth for the limit; the read-only check above is only for the
// form's pre-send message.
export async function reserveMagicLinkSend(
  email: string,
): Promise<number | null> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  return db.transaction(async (tx) => {
    // Serialize concurrent requests for this address; the lock is held until the
    // transaction ends.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

    const rows = await tx
      .select({ createdAt: magicLinkRequests.createdAt })
      .from(magicLinkRequests)
      .where(
        and(
          eq(magicLinkRequests.email, email),
          gt(magicLinkRequests.createdAt, windowStart),
        ),
      );

    if (
      exceedsMagicLinkLimit(
        rows.map((r) => r.createdAt),
        new Date(),
      )
    ) {
      return null;
    }

    const [inserted] = await tx
      .insert(magicLinkRequests)
      .values({ email })
      .returning({ id: magicLinkRequests.id });
    return inserted.id;
  });
}

// Undo a reservation when the email did not actually go out (e.g. the mailer
// failed), so a failed attempt does not count against the limit.
export async function releaseMagicLinkSend(id: number): Promise<void> {
  await db.delete(magicLinkRequests).where(eq(magicLinkRequests.id, id));
}
