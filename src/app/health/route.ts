// Liveness endpoint used by the deploy smoke test and uptime checks.
// Intentionally does not touch the database: it reports that the web app
// process is up and serving, which is what the deploy needs to confirm.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { status: 200 });
}
