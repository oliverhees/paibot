/**
 * PaiBot – eigene 404-Seite im Design der App (ohne Inline-Stil, passend zur strengen Content-Security-Policy).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import { EmptyState, Logo } from "@paibot/ui";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: t("nicht_gefunden.seitentitel") };

export default function NotFound() {
  return (
    <main className="nicht-gefunden">
      <EmptyState
        bild={<Logo titel="PaiBot" />}
        titel={t("nicht_gefunden.titel")}
        text={t("nicht_gefunden.text")}
        aktion={
          <Link href="/" className="nicht-gefunden-link">
            {t("nicht_gefunden.link")}
          </Link>
        }
      />
    </main>
  );
}
