import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zenti Content Engine — Prototype",
  description: "A source-aware editorial workspace for educational payments content and Google Flow prompts.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
