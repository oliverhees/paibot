import { APP_NAME } from "@paibot/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Dein persönliches KI-Team – EU-souverän und selbst gehostet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
