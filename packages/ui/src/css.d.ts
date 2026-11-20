/**
 * PaiBot – Typen für CSS-Module.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

declare module "*.module.css" {
  const klassen: Readonly<Record<string, string>>;
  export default klassen;
}
