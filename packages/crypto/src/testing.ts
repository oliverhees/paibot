/**
 * PaiBot – Hilfen für Tests anderer Pakete: Altbestand im älteren Format `v1` nachstellen. Nicht
 * für den Betrieb; neue Geheimnisse entstehen nur mit `encryptSecret(plain, key, { aad })`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

export { encryptLegacySecret } from "./secret";
