/**
 * PaiBot – eigene 404-Seite im Design der App (ohne Inline-Stil, passend zur strengen Content-Security-Policy).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { EmptyState, Logo } from "@paibot/ui";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./not-found.module.css";

// Texte der Seite. Passende Schlüssel in `@paibot/shared` gibt es noch nicht
// (vorhanden ist nur `fehler.nicht_gefunden`).
const NICHT_GEFUNDEN_TEXTE = {
  seitentitel: "Seite nicht gefunden",
  titel: "Diese Seite gibt es nicht",
  text: "Die Adresse stimmt nicht oder die Seite wurde verschoben. Von der Startseite aus findest du alles Weitere.",
  link: "Zur Startseite",
} as const;

export const metadata: Metadata = { title: NICHT_GEFUNDEN_TEXTE.seitentitel };

export default function NotFound() {
  return (
    <main className={styles.seite}>
      <EmptyState
        bild={<Logo titel="PaiBot" />}
        titel={NICHT_GEFUNDEN_TEXTE.titel}
        text={NICHT_GEFUNDEN_TEXTE.text}
        aktion={
          <Link href="/" className={styles.link}>
            {NICHT_GEFUNDEN_TEXTE.link}
          </Link>
        }
      />
    </main>
  );
}
