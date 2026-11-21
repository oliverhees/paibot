/**
 * PaiBot – Einrichtungs-Code: einmal zufällig erzeugt, nur im Log ausgegeben, in der Datenbank nur
 * als Prüfwert gehalten und mit dem Abschluss der Einrichtung verworfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { hashToken, safeEqual } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import { SETUP_CODE_PATTERN } from "@paibot/shared/eingaben";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
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

/** Prüfwert eines Codes, wie er in der Datenbank steht (`sha256:` und 64 Hex-Zeichen). */
export function codePruefwert(code: string): Sha256Digest {
  return `sha256:${hashToken(code)}` as Sha256Digest;
}

/** Ergebnis von `sicherstellen`. */
export type CodeStand =
  /** Neu erzeugt: der Code, genau einmal (für die Log-Zeile). */
  | { art: "neu"; code: string }
  /** Es gilt schon ein Code (z. B. aus einem früheren Start oder einem anderen Prozess). */
  | { art: "vorhanden"; seit: Date }
  /** Die Einrichtung ist abgeschlossen; es gibt keinen Code mehr. */
  | { art: "fertig" };

/**
 * Der Einrichtungs-Code der Installation. Die Datenbank hält nur seinen Prüfwert (SHA-256) und den
 * Zeitpunkt der Erzeugung; der Code selbst wird nur beim Erzeugen zurückgegeben (für die Log-Zeile)
 * und nirgends gespeichert. Er gilt, bis die Einrichtung abgeschlossen ist (`completeSetup` löscht
 * den Prüfwert). Weil er in der Datenbank steht, erzeugt weder ein Neustart noch ein zweiter
 * Prozess einen neuen, solange er gilt.
 */
export interface CodeHalter {
  /** Gibt es einen gültigen Code? */
  aktiv(db: Database): Promise<boolean>;
  /**
   * Sorgt dafür, dass während der offenen Einrichtung ein Code gilt. Unter einer Sperre der Zeile
   * der Einstellungen: Gilt schon einer, bleibt er; sonst entsteht genau einer. Auch bei
   * gleichzeitigen Aufrufen (mehrere Prozesse) entsteht so nur ein Code.
   */
  sicherstellen(db: Database, jetzt: Date): Promise<CodeStand>;
  /**
   * Erzeugt einen neuen Code und ersetzt den alten (der alte gilt danach nicht mehr). Nur vor dem
   * Abschluss der Einrichtung; sonst `undefined`.
   */
  ersetzen(db: Database, jetzt: Date): Promise<string | undefined>;
  /** Prüft eine Eingabe (schon in der Form `XXXX-XXXX-XXXX`) in konstanter Zeit. */
  pruefen(db: Database, eingabe: string): Promise<boolean>;
}

function neuerCode(erzeuge: () => string): string {
  const code = erzeuge();
  if (!SETUP_CODE_PATTERN.test(code)) throw new Error("Einrichtungs-Code hat die falsche Form.");
  return code;
}

/** Sperrt die Zeile der Einstellungen bis zum Ende der Transaktion (legt sie bei Bedarf an). */
async function zeileSperren(tx: Database): Promise<void> {
  await repo.settings.ensure(tx);
  await tx.execute(`select 1 from "public"."settings" where id = 'singleton' for update`);
}

export function erstelleCodeHalter(erzeuge: () => string = neuerEinrichtungsCode): CodeHalter {
  return {
    aktiv: async (db) => (await repo.settings.getSetupCode(db)) !== undefined,
    sicherstellen: (db, jetzt) =>
      db.transaction(async (tx): Promise<CodeStand> => {
        await zeileSperren(tx);
        if (await repo.settings.isSetupComplete(tx)) return { art: "fertig" };
        const vorhanden = await repo.settings.getSetupCode(tx);
        if (vorhanden !== undefined) return { art: "vorhanden", seit: vorhanden.createdAt };
        const code = neuerCode(erzeuge);
        const gesetzt = await repo.settings.setSetupCode(tx, {
          hash: codePruefwert(code),
          now: jetzt,
        });
        return gesetzt ? { art: "neu", code } : { art: "fertig" };
      }),
    ersetzen: (db, jetzt) =>
      db.transaction(async (tx) => {
        await zeileSperren(tx);
        const code = neuerCode(erzeuge);
        const gesetzt = await repo.settings.setSetupCode(tx, {
          hash: codePruefwert(code),
          now: jetzt,
        });
        return gesetzt ? code : undefined;
      }),
    async pruefen(db, eingabe) {
      const erwartet = (await repo.settings.getSetupCode(db))?.hash;
      // Auch ohne gültigen Code wird gerechnet und verglichen, damit die Dauer gleich bleibt.
      const vergleich = codePruefwert(eingabe);
      return safeEqual(vergleich, erwartet ?? `sha256:${"0".repeat(64)}`) && erwartet !== undefined;
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
 * Sorgt dafür, dass während der offenen Einrichtung ein Code gilt. Entsteht er hier, steht er genau
 * einmal mit `log` im Log. Gilt schon einer (früherer Start, anderer Prozess), entsteht kein neuer;
 * dann steht nur ein Hinweis im Log, wann er erzeugt wurde.
 */
export async function codeSicherstellen(
  halter: CodeHalter,
  db: Database,
  jetzt: Date,
  log: (zeile: string) => void,
): Promise<CodeStand> {
  const stand = await halter.sicherstellen(db, jetzt);
  if (stand.art === "neu") log(codeLogZeile(stand.code));
  return stand;
}
