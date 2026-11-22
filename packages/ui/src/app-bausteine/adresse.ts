/**
 * PaiBot – Erste Prüfung der Adresse im Formular und kurze Anzeige einer Adresse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Das ist nur ein freundlicher Hinweis vor dem Absenden. Ob eine Adresse wirklich erlaubt ist
// (öffentlich, kein eigenes Netz), entscheidet allein der Server.

export type AdressePruefung = "ok" | "leer" | "befehl" | "kein_https" | "zugang_in_adresse";

export function pruefeAdresse(eingabe: string): AdressePruefung {
  const text = eingabe.trim();
  if (text === "") return "leer";
  // Eine Adresse enthält nie Leerzeichen; ein Befehl wie „npx …“ schon.
  if (/\s/.test(text)) return "befehl";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "kein_https";
  }
  if (url.protocol !== "https:") return "kein_https";
  if (url.username !== "" || url.password !== "") return "zugang_in_adresse";
  return "ok";
}

/**
 * Adresse zum Anzeigen: Rechner und Pfad, ohne Zugangsdaten in der Adresse und ohne Abfrage-Teil
 * (dort stehen manchmal Schlüssel). Was keine Adresse ist, kommt unverändert zurück.
 */
export function kurzAdresse(adresse: string): string {
  try {
    const url = new URL(adresse.trim());
    const pfad = url.pathname === "/" ? "" : url.pathname;
    const rest = url.search !== "" ? "?…" : "";
    return `${url.host}${pfad}${rest}`;
  } catch {
    return adresse.trim();
  }
}
