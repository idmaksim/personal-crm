import type { Metadata } from "next";
import Link from "next/link";
import { Golos_Text } from "next/font/google";
import "./globals.css";

const golos = Golos_Text({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-golos",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Круг — личная CRM",
  description: "Контакты людей, которых я знаю лично",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={golos.variable}>
      <body className="min-h-screen">
        <header className="border-b border-hairline">
          <div className="mx-auto flex max-w-3xl items-center gap-[10px] px-4 py-[18px]">
            <Link href="/" className="flex items-center gap-[10px]">
              {/* Logo: dark tile with a ring inside — matches the landing mark */}
              <span className="flex size-6 items-center justify-center rounded-[7px] bg-primary">
                <span className="size-[9px] rounded-full border-2 border-[color:hsl(var(--primary-foreground))]" />
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
