import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// The authoritative access check: every page and server action calls this
// (not just the middleware redirect, which is only a fast guard for guests
// who reach an internal page directly).
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
}
