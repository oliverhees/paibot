/**
 * PaiBot – gibt dem Browser eine Datei zum Sichern (Anker aus der Seite, Export vom Server).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Startet das Sichern einer Datei mit diesem Inhalt (Text oder schon geladene Datei). */
export function dateiSichern(name: string, inhalt: string | Blob, typ: string): void {
  const datei = typeof inhalt === "string" ? new Blob([inhalt], { type: typ }) : inhalt;
  const url = URL.createObjectURL(datei);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
