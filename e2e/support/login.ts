import type { Page } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

type MailpitMessage = { ID: string; Created: string };
type MailpitSearchResult = { messages: MailpitMessage[] };
type MailpitMessageBody = { Text: string };

// Mail delivery to the Mailpit stub is async, so poll briefly instead of
// assuming the message is there the instant the request completes.
async function fetchMagicLinkUrl(email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const searchRes = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const search = (await searchRes.json()) as MailpitSearchResult;

    const latest = [...search.messages].sort(
      (a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime(),
    )[0];

    if (latest) {
      const messageRes = await fetch(
        `${MAILPIT_URL}/api/v1/message/${latest.ID}`,
      );
      const message = (await messageRes.json()) as MailpitMessageBody;
      const match = message.Text.match(
        /https?:\/\/\S+\/api\/auth\/magic-link\/verify\?\S+/,
      );
      if (match) return match[0];
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No magic link email found for ${email} in Mailpit`);
}

// Requests a magic link for `email` through the real /login form, retrieves
// it from the Mailpit stub, and follows it — leaving `page` signed in as that
// user. Used by every e2e test as the first step, since the app is closed to
// guests.
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Почта").fill(email);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await page.getByRole("status").waitFor();

  const url = await fetchMagicLinkUrl(email);
  await page.goto(url);
}
