import "server-only";
import { and, ne, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import {
  isMagicLinkRateLimited,
  recordMagicLinkSent,
} from "@/lib/magic-link-limit";
import { sendMail } from "@/lib/mailer";

const MAGIC_LINK_EXPIRES_IN_SECONDS = 15 * 60;

// Remove any magic link previously issued to this email (except the one just
// created for this request), so an old, unused link stops working the moment
// a new one is requested. The plugin stores each link as a `verification` row
// with identifier "magic-link:<token>" and the email inside its JSON value.
async function revokeOtherMagicLinks(email: string, keepToken: string) {
  const keepIdentifier = `magic-link:${keepToken}`;
  await db
    .delete(verification)
    .where(
      and(
        sql`${verification.identifier} like 'magic-link:%'`,
        ne(verification.identifier, keepIdentifier),
        sql`(${verification.value}::jsonb ->> 'email') = ${email}`,
      ),
    );
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? [process.env.BETTER_AUTH_URL]
    : [],
  session: {
    // 30 days from the last activity, renewed at most once a day.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  // Normalize and validate the email the same way for every path into
  // sign-in, including a request made straight to this route rather than
  // through the /login form.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/magic-link") return;
      const raw = ctx.body?.email;
      if (typeof raw !== "string") return;

      const email = normalizeEmail(raw);
      if (!isValidEmail(email)) {
        throw new APIError("BAD_REQUEST", { message: "invalid_email" });
      }
      return { context: { body: { ...ctx.body, email } } };
    }),
  },
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_EXPIRES_IN_SECONDS,
      sendMagicLink: async ({ email, url, token }) => {
        // Defense in depth: the /login form already checks this before even
        // requesting a link, but a request straight to this route must be
        // held to the same "3 per 10 minutes" rule.
        if (await isMagicLinkRateLimited(email)) return;

        await revokeOtherMagicLinks(email, token);

        await sendMail({
          to: email,
          subject: "Вход в Личную CRM",
          html: `
            <p>Чтобы войти в Личную CRM, перейдите по ссылке:</p>
            <p><a href="${url}">Войти</a></p>
            <p>Ссылка действует 15 минут.</p>
            <p>Если вы не запрашивали вход — просто проигнорируйте письмо.</p>
          `,
          text: [
            "Чтобы войти в Личную CRM, перейдите по ссылке:",
            url,
            "",
            "Ссылка действует 15 минут.",
            "Если вы не запрашивали вход — просто проигнорируйте письмо.",
          ].join("\n"),
        });

        await recordMagicLinkSent(email);
      },
    }),
  ],
});
