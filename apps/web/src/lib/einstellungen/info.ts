/**
 * PaiBot – feste Adressen der Info-Seite. Alles sind normale Links; die Seite lädt nichts von
 * fremden Servern.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { HR_CODELABS_URL, PAIBOT_DOKU_URL, PAIBOT_ROADMAP_URL, PAIBOT_URL } from "@paibot/ui";

const REPO = "https://github.com/oliverhees/paibot";

export const INFO_LINKS = {
  paibot: PAIBOT_URL,
  doku: PAIBOT_DOKU_URL,
  roadmap: PAIBOT_ROADMAP_URL,
  quellcode: REPO,
  hrCodelabs: HR_CODELABS_URL,
  community: "https://aiianer.de",
  lizenz: `${REPO}/blob/main/LICENSE`,
  bestandteile: `${REPO}/blob/main/THIRD_PARTY_NOTICES.md`,
  sicherheit: `${REPO}/blob/main/SECURITY.md`,
  aenderungen: `${REPO}/blob/main/CHANGELOG.md`,
} as const;

/** Mail-Adresse für Anfragen zu PaiBot Enterprise. */
export const ENTERPRISE_MAIL = "hi@paibot.de";

/** Attribute für Links, die in einem neuen Tab öffnen. */
export const NEUER_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;
