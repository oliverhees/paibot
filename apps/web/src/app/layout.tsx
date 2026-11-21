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
import { CSRF } from "@paibot/shared/konstanten";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@paibot/ui/schriften.css";
import "@paibot/ui/tokens.css";
import "@paibot/ui/avatar.css";
import "./globals.css";
import { seitenPruefzeichen } from "../lib/zugang/seite";

/** Alle Seiten werden je Anfrage erzeugt: nur so trägt jede Antwort ihre eigene Nonce. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Dein persönliches KI-Team – EU-souverän und selbst gehostet.",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
};

/** Farbe der Browser-Leiste: folgt dem hellen und dunklen Design der Tokens. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e10" },
  ],
  colorScheme: "dark light",
  // Am Handy schiebt die eingeblendete Tastatur die Seite zusammen, statt die Chat-Eingabe zu verdecken.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pruefzeichen = await seitenPruefzeichen();
  return (
    <html lang="de">
      <head>
        {pruefzeichen && <meta name={CSRF.metaName} content={pruefzeichen} />}
        {/*
          Kein Vorabladen der Schriften: Sie liegen auf demselben Server und stehen im ersten
          Stylesheet. Beim Neuladen kommt die Schrift aus dem Speicher des Browsers, ein
          Vorabladen bliebe dann ungenutzt und der Browser meldet eine Warnung.
        */}
      </head>
      <body>{children}</body>
    </html>
  );
}
