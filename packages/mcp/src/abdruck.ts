/**
 * PaiBot – Abdruck (Fingerabdruck) eines Werkzeugs über seine Rohform: kanonische JSON-Form ohne
 * Rekursion und ein SHA-256 darüber. Ein einziges geändertes Zeichen, auch ein unsichtbares oder
 * ein unbekannter Schlüssel, ergibt einen anderen Abdruck.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createHash } from "node:crypto";

/** Vorsatz, damit der Abdruck eines Werkzeugs nie mit dem Abdruck von etwas anderem übereinstimmt. */
export const WERKZEUG_ABDRUCK_VORSATZ = "pb-mcp-werkzeug/v1\n";

type Aufgabe = { text: string } | { wert: unknown };

/**
 * Kanonische JSON-Form: Schlüssel sortiert (UTF-16-Reihenfolge), keine Leerzeichen, Zahlen wie
 * `JSON.stringify`. Geht nur für Werte, die `pruefeStruktur` angenommen hat (endliche Zahlen, kein
 * Kreis). Läuft mit eigenem Stapel, auch bei tiefer Verschachtelung.
 */
export function kanonischeForm(wert: unknown): string {
  const ausgabe: string[] = [];
  const stapel: Aufgabe[] = [{ wert }];
  while (stapel.length > 0) {
    const aufgabe = stapel.pop() as Aufgabe;
    if ("text" in aufgabe) {
      ausgabe.push(aufgabe.text);
      continue;
    }
    const aktuell = aufgabe.wert;
    if (aktuell === null) ausgabe.push("null");
    else if (typeof aktuell === "string") ausgabe.push(JSON.stringify(aktuell));
    else if (typeof aktuell === "boolean") ausgabe.push(aktuell ? "true" : "false");
    else if (typeof aktuell === "number") {
      ausgabe.push(Object.is(aktuell, -0) ? "0" : JSON.stringify(aktuell));
    } else if (Array.isArray(aktuell)) {
      stapel.push({ text: "]" });
      for (let index = aktuell.length - 1; index >= 0; index--) {
        stapel.push({ wert: aktuell[index] });
        if (index > 0) stapel.push({ text: "," });
      }
      ausgabe.push("[");
    } else if (typeof aktuell === "object") {
      const objekt = aktuell as Record<string, unknown>;
      const schluessel = Object.keys(objekt).sort();
      stapel.push({ text: "}" });
      for (let index = schluessel.length - 1; index >= 0; index--) {
        const name = schluessel[index] as string;
        stapel.push({ wert: objekt[name] });
        stapel.push({ text: `${JSON.stringify(name)}:` });
        if (index > 0) stapel.push({ text: "," });
      }
      ausgabe.push("{");
    } else {
      // nicht JSON-fähig (undefined, Funktion …): wie `JSON.stringify` als null
      ausgabe.push("null");
    }
  }
  return ausgabe.join("");
}

/** Abdruck eines Texts: `sha256:` und 64 Hex-Zeichen. */
export function abdruckVonText(text: string): string {
  return `sha256:${createHash("sha256").update(WERKZEUG_ABDRUCK_VORSATZ).update(text).digest("hex")}`;
}

/** Abdruck eines Werts über seine kanonische Form. */
export function abdruckVonWert(wert: unknown): string {
  return abdruckVonText(kanonischeForm(wert));
}
