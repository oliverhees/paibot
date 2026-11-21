/**
 * PaiBot – Not-Aus („Alle Bots anhalten“): Zustand lesen und über das Tor umschalten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo } from "@paibot/db";
import type { KillSwitchInput } from "@paibot/shared/eingaben";
import { PaiBotError } from "@paibot/shared/fehler";
import type { RoutenKontext } from "../api/route";
import { zaehleLimits } from "../rate-limit";
import { pruefePasswort } from "../zugang/passwort";

/** Ist der Not-Aus an? Ohne Einstellungen gilt er als aus. */
export async function notAusAn(db: Database): Promise<boolean> {
  return (await repo.settings.get(db))?.killSwitch === true;
}

/** Antwort von `PUT /api/notaus`: neuer Zustand und der Beleg „Ergebnis“. */
export interface NotAusGeschaltet {
  an: boolean;
  beleg: { id: string; nummer: number };
}

/**
 * `PUT /api/notaus`. Einschalten genügt die Sitzung. Beim Aufheben prüft die Route das
 * mitgeschickte Passwort (Versuch zählt auf `passwortAendern`, gemeinsam mit dem Passwortwechsel)
 * und meldet dem Tor nur, ob es stimmt; ohne Passwort lehnt das Tor ab (V-10, `passwort_falsch`).
 * Ein laufender Lauf endet von selbst: Der Wächter des Laufs sieht den Schalter binnen einer
 * halben Sekunde und beendet ihn als „angehalten“; neue Läufe lehnt das Tor ab (G-05).
 */
export async function notAusUmschalten(
  kontext: RoutenKontext<"notausUmschalten">,
): Promise<NotAusGeschaltet> {
  const eingabe: KillSwitchInput = kontext.eingabe;
  const { db, sitzung, dienste: d } = kontext;
  const vorher = await repo.settings.get(db);
  if (vorher?.installationId === undefined || vorher.setupCompletedAt === undefined) {
    throw new PaiBotError("einrichtung_offen");
  }
  let bestaetigt = false;
  if (!eingabe.on && eingabe.currentPassword !== undefined) {
    await zaehleLimits(
      db,
      ["passwortAendern"],
      { adresse: kontext.adresse, ownerId: sitzung.ownerId, sitzungId: sitzung.id },
      { now: d.uhr.now(), warten: d.warten },
    );
    const besitzer = await repo.owner.get(db);
    bestaetigt =
      besitzer !== undefined &&
      (await pruefePasswort(eingabe.currentPassword, besitzer.passwordHash));
  }
  const ergebnis = await kontext.tor(
    kontext.nachweis,
    { type: "notaus.umschalten", target: { installationId: vorher.installationId } },
    { on: eingabe.on, wasOn: vorher.killSwitch, currentPasswordVerified: bestaetigt },
    async () => {
      const neu = await repo.settings.update(db, { killSwitch: eingabe.on });
      return { value: neu.killSwitch, result: { status: "ok" } };
    },
  );
  return {
    an: ergebnis.value,
    beleg: { id: ergebnis.receipts.result.receiptId, nummer: ergebnis.receipts.result.seq },
  };
}
