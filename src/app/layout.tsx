import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Личная CRM",
  description: "Контакты людей, которых я знаю лично",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Users className="size-5" />
              Личная CRM
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
