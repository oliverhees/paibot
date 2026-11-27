/**
 * PaiBot – Beispielseite der Teams, nur in der Entwicklung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import type { Metadata } from "next";
import { nurInEntwicklung } from "../nur-entwicklung";
import { ladeVorlage } from "./vorlage";
import { TeamsVorschau } from "./vorschau";

export const metadata: Metadata = { title: "Bots und Teams – Vorschau" };

/** Bots und Teams verwalten, Team-Entwurf und Teams-Übersicht, alle Szenen mit Beispiel-Daten. */
export default async function TeamsSeite() {
  nurInEntwicklung();
  const vorlage = await ladeVorlage();
  return <TeamsVorschau vorlage={vorlage} />;
}
