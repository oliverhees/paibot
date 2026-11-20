/**
 * PaiBot – Beispielseite der Komponenten, nur in der Entwicklung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Metadata } from "next";
import { Beispiele } from "./beispiele";
import { nurInEntwicklung } from "./nur-entwicklung";

export const metadata: Metadata = { title: "Komponenten – Beispiele" };

/** Alle Komponenten mit ihren Zuständen (nur in der Entwicklung). */
export default function KomponentenSeite() {
  nurInEntwicklung();
  return <Beispiele />;
}
