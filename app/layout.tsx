import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Manrope, Space_Grotesk } from "next/font/google";

import { resolveHtmlLanguage } from "@/lib/language";
import { getCurrentUser } from "@/server/auth/session";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Ingeniometrix",
  description: "Asistencia etica para planificar tesis de maestria y posgrado en Peru.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const currentUser = await getCurrentUser();

  return (
    <html lang={resolveHtmlLanguage({ userLocale: currentUser?.locale })}>
      <body
        className={`${headingFont.variable} ${bodyFont.variable} font-[var(--font-body)] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
