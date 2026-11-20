/**
 * PaiBot – AppShell bildschirmfüllend mit Beispiel-Daten, nur in der Entwicklung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Metadata } from "next";
import { ShellDemo } from "../demo";
import { nurInEntwicklung } from "../nur-entwicklung";

export const metadata: Metadata = { title: "AppShell – Beispiel" };

/** AppShell bildschirmfüllend mit Beispiel-Daten (nur in der Entwicklung). */
export default function ShellBeispielSeite() {
  nurInEntwicklung();
  return <ShellDemo />;
}
