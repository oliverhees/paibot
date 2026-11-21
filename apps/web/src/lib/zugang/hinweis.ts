/**
 * PaiBot – Hinweis bei Anmeldung von einem neuen Gerät: Meldet sich jemand mit einem bisher
 * unbekannten Gerät an, sehen alle anderen angemeldeten Geräte beim nächsten Seitenaufruf einen
 * Hinweis, bis der Besitzer ihn dort mit „Das war ich“ bestätigt (Aktion über das Tor mit Beleg).
 * Ebenso, wenn ein anderes Gerät entfernt, über die Obergrenze verdrängt oder mit „Alle Sitzungen
 * beenden“ abgemeldet wurde; ein neues Gerät sieht das auch für die Tage vor seiner Anmeldung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo } from "@paibot/db";
import { PaiBotError } from "@paibot/shared/fehler";
import type { RoutenKontext } from "../api/route";
import type { GepruefteSitzung } from "./nachweis";

/** Eine Zeile des Hinweises (keine Adresse, nur die Browser-Kennung). */
export interface NeueAnmeldung {
  id: string;
  /** `neu`: angemeldet; `entfernt`, `verdraengt`, `alle`: abgemeldet. */
  art: repo.geraete.GeraetAenderung["art"];
  /** Browser-Kennung, aus der die Oberfläche eine grobe Angabe macht. */
  name?: string;
  /** Wann es geschah (Anmeldung bzw. Abmeldung). */
  angelegt: string;
  /** Bei `alle`: wie viele Geräte. */
  anzahl?: number;
}

/**
 * Änderungen aus Sicht der Sitzung (`repo.geraete.aenderungenSeit`), neueste zuerst. Eine Sitzung
 * ohne Gerät sieht keinen Hinweis.
 */
export async function neueAnmeldungen(
  db: Database,
  sitzung: GepruefteSitzung,
  now: Date,
): Promise<NeueAnmeldung[]> {
  const geraet = await repo.sessions.deviceOf(db, sitzung.id);
  if (geraet === undefined) return [];
  const liste = await repo.geraete.aenderungenSeit(db, sitzung.ownerId, geraet, { now });
  return liste.map((g) => ({
    id: g.id,
    art: g.art,
    ...(g.name === undefined ? {} : { name: g.name }),
    angelegt: g.zeit,
    ...(g.anzahl === undefined ? {} : { anzahl: g.anzahl }),
  }));
}

/**
 * `POST /api/zugang/geraete/hinweis`: „Das war ich“. Bestätigt auf dem Gerät dieser Sitzung alle
 * neuen Geräte, die es gerade sieht (Aktion „Neue Anmeldung bestätigt“). Danach erscheint der
 * Hinweis hier erst wieder bei einem Gerät, das später dazukommt; andere Geräte sehen ihn weiter.
 * Gehört die Sitzung zu keinem gültigen Gerät: `nicht_gefunden`.
 */
export async function hinweisBestaetigen(
  kontext: RoutenKontext<"geraeteHinweisBestaetigen">,
): Promise<{ bestaetigt: number }> {
  const { db, sitzung, dienste: d } = kontext;
  const geraet = await repo.sessions.deviceOf(db, sitzung.id);
  if (geraet === undefined) throw new PaiBotError("nicht_gefunden");
  const now = d.uhr.now();
  const neu = await repo.geraete.aenderungenSeit(db, sitzung.ownerId, geraet, { now });
  // Stand = die neueste Zeile, die der Hinweis nennt; was danach geschieht, erscheint wieder.
  const bis = neu.reduce((spaetestes, g) => {
    const zeit = new Date(g.zeit);
    return zeit > spaetestes ? zeit : spaetestes;
  }, new Date(0));
  await kontext.tor(
    kontext.nachweis,
    { type: "geraet.bestaetigen", target: { deviceId: geraet } },
    { newDevices: neu.length },
    async () => {
      const gilt = await repo.geraete.hinweisBestaetigen(db, sitzung.ownerId, geraet, {
        bis: neu.length === 0 ? now : bis,
        now,
      });
      if (!gilt) throw new PaiBotError("nicht_gefunden");
      return { value: undefined, result: { status: "ok" } };
    },
  );
  return { bestaetigt: neu.length };
}
