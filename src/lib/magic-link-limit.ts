import "server-only";
import { and, eq, gt } from "drizzle-orm";
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

// Records that a magic-link email was actually sent, so later requests count
// it. Called once, right when the email goes out (see src/lib/auth.ts) — never
// from the read-only check above, or every request would count twice.
export async function recordMagicLinkSent(email: string): Promise<void> {
  await db.insert(magicLinkRequests).values({ email });
}
