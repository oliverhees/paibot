/**
 * PaiBot – prüft, ob alle Abhängigkeiten eine erlaubte Lizenz haben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

// Bricht ab, wenn eine Produktions-Abhängigkeit eine nicht erlaubte Lizenz hat.
// Regeln: docs/LIZENZPOLITIK.md
import { readLicenses } from "./licenses.mjs";

const BLOCKED = /(^|[^L])GPL|SSPL|BUSL|Elastic|Commons-Clause|Unknown/i;
// Ausnahmen nur nach Prüfung eintragen, mit Begründung.
const ALLOWED_EXCEPTIONS = new Set([]);

const offenders = readLicenses().filter(
  (pkg) => BLOCKED.test(pkg.license) && !ALLOWED_EXCEPTIONS.has(pkg.name),
);

if (offenders.length > 0) {
  console.error("Nicht erlaubte Lizenzen gefunden:");
  for (const pkg of offenders) console.error(`- ${pkg.name} (${pkg.license})`);
  process.exit(1);
}
console.log("Lizenz-Check bestanden.");
