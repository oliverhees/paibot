/**
 * PaiBot – Grundgerüst aller Seiten mit Titel und Beschreibung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { APP_NAME } from "@paibot/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@paibot/ui/schriften.css";
import "@paibot/ui/tokens.css";
import "@paibot/ui/avatar.css";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Dein persönliches KI-Team – EU-souverän und selbst gehostet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link
          rel="preload"
          href="/fonts/inter-latin-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
