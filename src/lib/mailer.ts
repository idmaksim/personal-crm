import "server-only";
import nodemailer from "nodemailer";

// One transport for the whole app, built from environment variables so the
// same build sends through Mailpit locally/in CI and through Resend's SMTP on
// the server — only the .env values differ, never the code.
const globalForMailer = globalThis as unknown as {
  mailer: ReturnType<typeof nodemailer.createTransport> | undefined;
};

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);

  if (!host || !Number.isInteger(port)) {
    throw new Error("SMTP_HOST/SMTP_PORT is not set. Check your .env file.");
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: user && pass ? { user, pass } : undefined,
  });
}

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const from = process.env.MAIL_FROM;
  if (!from) {
    throw new Error("MAIL_FROM is not set. Check your .env file.");
  }

  const transport =
    globalForMailer.mailer ?? (globalForMailer.mailer = createTransport());

  await transport.sendMail({
    from: `"Личная CRM" <${from}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}
