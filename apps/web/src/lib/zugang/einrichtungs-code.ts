/**
 * PaiBot – Einrichtungs-Code: einmal zufällig erzeugt, nur im Log ausgegeben, im Speicher nur als
 * Prüfwert gehalten und nach der Einrichtung verworfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { hashToken, safeEqual } from "@paibot/crypto";
import { SETUP_CODE_PATTERN } from "@paibot/shared/eingaben";
import { t } from "@paibot/shared/texte";

/** Crockford-Base32 in Großbuchstaben. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Neuer Code: 12 Zeichen (60 Bit Zufall) in drei Vierergruppen, z. B. `K7QD-9M2F-XW4H`. */
export function neuerEinrichtungsCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  // 256 ist durch 32 teilbar: jedes Zeichen ist gleich wahrscheinlich.
  const zeichen = [...bytes].map((byte) => CODE_ALPHABET[byte & 31]).join("");
  return `${zeichen.slice(0, 4)}-${zeichen.slice(4, 8)}-${zeichen.slice(8, 12)}`;
}

/** Die Zeile, die beim Erzeugen genau einmal ins Log geht. */
export function codeLogZeile(code: string): string {
  return t("einrichtung.code.log", { code });
}

/**
 * Hält den gültigen Code eines Prozesses, nur als Prüfwert (SHA-256). Der Code selbst wird nur beim
 * Erzeugen zurückgegeben (für die Log-Zeile) und danach nirgends gespeichert.
 */
export interface CodeHalter {
  /** Gibt es einen gültigen Code? */
  aktiv(): boolean;
  /** Erzeugt einen neuen Code (der alte wird ungültig) und gibt ihn einmal zurück. */
  erzeugen(): string;
  /** Prüft eine Eingabe (schon in der Form `XXXX-XXXX-XXXX`) in konstanter Zeit. */
  pruefen(eingabe: string): boolean;
  /** Macht den Code ungültig (nach dem Abschluss der Einrichtung). */
  verbrauchen(): void;
}

export function erstelleCodeHalter(erzeuge: () => string = neuerEinrichtungsCode): CodeHalter {
  let pruefwert: string | undefined;
  return {
    aktiv: () => pruefwert !== undefined,
    erzeugen() {
      const code = erzeuge();
      if (!SETUP_CODE_PATTERN.test(code))
        throw new Error("Einrichtungs-Code hat die falsche Form.");
      pruefwert = hashToken(code);
      return code;
    },
    pruefen(eingabe) {
      const erwartet = pruefwert;
      // Auch ohne gültigen Code wird gerechnet und verglichen, damit die Dauer gleich bleibt.
      const vergleich = hashToken(eingabe);
      return safeEqual(vergleich, erwartet ?? "0".repeat(64)) && erwartet !== undefined;
    },
    verbrauchen() {
      pruefwert = undefined;
    },
  };
}

const SCHLUESSEL = Symbol.for("paibot.web.einrichtungs-code");
type Halter = { [SCHLUESSEL]?: CodeHalter };

/** Der Code-Halter des Prozesses (gemeinsam für Start, Proxy und Routen). */
export function prozessCodeHalter(): CodeHalter {
  const halter = globalThis as Halter;
  halter[SCHLUESSEL] ??= erstelleCodeHalter();
  return halter[SCHLUESSEL];
}

/**
 * Sorgt dafür, dass während der offenen Einrichtung ein Code existiert. Fehlt er, wird er erzeugt
 * und genau einmal mit `log` ausgegeben.
 */
export function codeSicherstellen(halter: CodeHalter, log: (zeile: string) => void): void {
  if (halter.aktiv()) return;
  log(codeLogZeile(halter.erzeugen()));
}
