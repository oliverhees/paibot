/**
 * PaiBot – Hinweis bei Anmeldung von einem neuen Gerät: Meldet sich jemand mit einem bisher
 * unbekannten Gerät an, sehen alle anderen angemeldeten Geräte beim nächsten Seitenaufruf einen
 * Hinweis, bis der Besitzer ihn dort mit „Das war ich“ bestätigt (Aktion über das Tor mit Beleg).
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

/** Ein neues Gerät, wie der Hinweis es nennt (keine Adresse, nur die Browser-Kennung). */
export interface NeueAnmeldung {
  id: string;
  /** Browser-Kennung, aus der die Oberfläche eine grobe Angabe macht. */
  name?: string;
  /** Wann das Gerät dazukam (erste Anmeldung damit). */
  angelegt: string;
}

/**
 * Neue Geräte aus Sicht der Sitzung: gültige andere Geräte, die nach dem Stand ihres Geräts
 * dazukamen, neueste zuerst. Eine Sitzung ohne Gerät sieht keinen Hinweis.
 */
export async function neueAnmeldungen(
  db: Database,
  sitzung: GepruefteSitzung,
  now: Date,
): Promise<NeueAnmeldung[]> {
  const geraet = await repo.sessions.deviceOf(db, sitzung.id);
  if (geraet === undefined) return [];
  const liste = await repo.geraete.neueSeit(db, sitzung.ownerId, geraet, { now });
  return liste.map((g) => ({
    id: g.id,
    ...(g.name === undefined ? {} : { name: g.name }),
    angelegt: g.createdAt,
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
  const neu = await repo.geraete.neueSeit(db, sitzung.ownerId, geraet, { now });
  // Stand = das neueste Gerät, das der Hinweis nennt; was danach dazukommt, erscheint wieder.
  const bis = neu.reduce((spaetestes, g) => {
    const zeit = new Date(g.createdAt);
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
