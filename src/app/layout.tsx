import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Круг — личная CRM",
  description: "Контакты людей, которых я знаю лично",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        {/* Golos Text — loaded the same way as the landing, so the
            font-family "Golos Text" from tokens.css resolves. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <header className="border-b border-hairline">
          <div className="mx-auto flex max-w-3xl items-center gap-[10px] px-4 py-[18px]">
            <Link href="/" className="flex items-center gap-[10px]">
              {/* Logo: dark tile with a ring inside — matches the landing mark */}
              <span className="flex size-6 items-center justify-center rounded-[7px] bg-primary">
                <span className="size-[9px] rounded-full border-2 border-primary-foreground" />
              </span>
              <span className="text-[18px] font-semibold text-foreground">Круг</span>
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
