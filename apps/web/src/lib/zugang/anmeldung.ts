/**
 * PaiBot – Anmelden, Abmelden, alle Sitzungen beenden und Passwort ändern.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { needsRehash } from "@paibot/crypto";
import { repo } from "@paibot/db";
import type { LoginInput, PasswordChangeInput } from "@paibot/shared/eingaben";
import { PaiBotError } from "@paibot/shared/fehler";
import type { OwnerId } from "@paibot/shared/ids";
import type { RoutenKontext } from "../api/route";
import {
  geraetAnlegen,
  geraetAusAnfrage,
  geraetCookie,
  geraetCookieLoeschen,
  geraetHash,
} from "./geraet";
import { _nachweisPasswort } from "./nachweis";
import { neuerPasswortHash, pruefePasswort } from "./passwort";
import {
  cookieLoeschen,
  sitzungAnlegen,
  sitzungsCookie,
  sitzungsCookieName,
  vorabCookieName,
} from "./sitzung";

/** Antwort bei falschem Passwort: immer gleich, ob es einen Besitzer gibt oder nicht. */
function passwortFalsch(): PaiBotError {
  return new PaiBotError("passwort_falsch", { felder: [{ feld: "password", code: "ungueltig" }] });
}

/**
 * `POST /api/zugang/anmelden`. Die Limits hat der Rahmen schon gezählt (vor dem teuren Hash). Das
 * Passwort wird über den Begrenzer geprüft (höchstens zwei gleichzeitig); ohne Besitzer gegen einen
 * Ersatz-Hash, damit Antwort und Dauer gleich bleiben. Bei Erfolg: veraltetes Hash-Verfahren
 * erneuern, über das Tor eine neue Sitzung mit frischem Token anlegen, Vorab-Cookie löschen.
 */
export async function anmelden(kontext: RoutenKontext<"anmelden">): Promise<{ angemeldet: true }> {
  const eingabe: LoginInput = kontext.eingabe;
  const { db, dienste: d } = kontext;
  const besitzer = await repo.owner.get(db);
  const passt = await pruefePasswort(eingabe.password, besitzer?.passwordHash);
  if (!passt || besitzer === undefined) throw passwortFalsch();

  const ownerId = besitzer.id as OwnerId;
  if (needsRehash(besitzer.passwordHash)) {
    await repo.owner.updatePassword(db, ownerId, await neuerPasswortHash(eingabe.password));
  }
  const userAgent = kontext.request.headers.get("user-agent");
  const ergebnis = await kontext.tor(
    _nachweisPasswort(ownerId),
    { type: "zugang.anmelden", target: { ownerId } },
    { remember: eingabe.remember },
    async () => {
      const neu = await sitzungAnlegen(db, ownerId, { now: d.uhr.now(), userAgent });
      const geraet = await geraetAnlegen(db, d.schluessel().sitzung, ownerId, {
        now: d.uhr.now(),
        bisher: geraetAusAnfrage(kontext.request, { appUrl: d.appOrigin() }),
      });
      return { value: { ...neu, geraet }, result: { status: "ok" } };
    },
  );
  await kontext.limitZuruecksetzen("anmeldenIp");
  await kontext.limitZuruecksetzen("anmeldenIpTag");
  await kontext.limitZuruecksetzen("anmeldenGeraet");
  await kontext.limitZuruecksetzen("anmeldenGeraetTag");
  const rahmen = { appUrl: d.appOrigin() };
  kontext.cookie(sitzungsCookie(rahmen, ergebnis.value.token, eingabe.remember));
  kontext.cookie(geraetCookie(rahmen, ergebnis.value.geraet.wert));
  kontext.cookie(cookieLoeschen(vorabCookieName(rahmen), rahmen, "Strict"));
  return { angemeldet: true };
}

/**
 * `POST /api/zugang/abmelden`: beendet die Sitzung dieser Anfrage, entfernt das Gerät dieses
 * Browsers auf dem Server und löscht beide Cookies.
 */
export async function abmelden(kontext: RoutenKontext<"abmelden">): Promise<{ abgemeldet: true }> {
  const { sitzung, db } = kontext;
  const rahmen = { appUrl: kontext.dienste.appOrigin() };
  const geraet = geraetHash(
    kontext.dienste.schluessel().sitzung,
    geraetAusAnfrage(kontext.request, rahmen),
  );
  await kontext.tor(
    kontext.nachweis,
    { type: "zugang.abmelden", target: { ownerId: sitzung.ownerId } },
    {},
    async () => {
      await repo.sessions.end(db, sitzung.id);
      if (geraet !== undefined) await repo.geraete.remove(db, geraet);
      return { value: undefined, result: { status: "ok" } };
    },
  );
  kontext.cookie(cookieLoeschen(sitzungsCookieName(rahmen), rahmen, "Lax"));
  kontext.cookie(geraetCookieLoeschen(rahmen));
  return { abgemeldet: true };
}

/**
 * `POST /api/zugang/alle-abmelden`: beendet alle Sitzungen des Besitzers, auch diese, und entfernt
 * alle bekannten Geräte.
 */
export async function alleAbmelden(
  kontext: RoutenKontext<"alleAbmelden">,
): Promise<{ beendet: number }> {
  const { sitzung, db, dienste: d } = kontext;
  const offen = await repo.sessions.list(db, sitzung.ownerId, { now: d.uhr.now() });
  const ergebnis = await kontext.tor(
    kontext.nachweis,
    { type: "zugang.alle_abmelden", target: { ownerId: sitzung.ownerId } },
    { sessions: offen.length },
    async () => {
      const beendet = await repo.sessions.endAll(db, sitzung.ownerId);
      await repo.geraete.removeAll(db, sitzung.ownerId);
      return { value: beendet, result: { status: "ok" } };
    },
  );
  const rahmen = { appUrl: d.appOrigin() };
  kontext.cookie(cookieLoeschen(sitzungsCookieName(rahmen), rahmen, "Lax"));
  kontext.cookie(geraetCookieLoeschen(rahmen));
  return { beendet: ergebnis.value };
}

/** Eine Sitzung, wie die Oberfläche sie sieht (ohne Kennung). */
export interface SitzungsAnzeige {
  aktuell: boolean;
  angelegt: string;
  zuletzt: string;
  endet: string;
  geraet?: string;
}

/** `GET /api/zugang/sitzungen`: die gültigen Sitzungen, die aktuelle markiert. */
export async function sitzungenListe(
  kontext: RoutenKontext<"sitzungen">,
): Promise<{ sitzungen: SitzungsAnzeige[] }> {
  const liste = await repo.sessions.list(kontext.db, kontext.sitzung.ownerId, {
    currentTokenHash: kontext.sitzung.id,
    now: kontext.dienste.uhr.now(),
  });
  return {
    sitzungen: liste.map((s) => ({
      aktuell: s.current,
      angelegt: s.createdAt,
      zuletzt: s.lastSeenAt,
      endet: s.expiresAt,
      ...(s.userAgent === undefined ? {} : { geraet: s.userAgent }),
    })),
  };
}

/**
 * `POST /api/zugang/passwort`: prüft das aktuelle Passwort (Fakt `currentPasswordVerified`, das Tor
 * lehnt sonst ab), setzt den neuen Hash und löscht in derselben Transaktion alle Sitzungen und alle
 * bekannten Geräte. Danach bekommt diese Anfrage eine neue Sitzung mit frischem Token und dieser
 * Browser ein neues Gerät.
 */
export async function passwortAendern(
  kontext: RoutenKontext<"passwortAendern">,
): Promise<{ geaendert: true }> {
  const eingabe: PasswordChangeInput = kontext.eingabe;
  const { sitzung, db, dienste: d } = kontext;
  const besitzer = await repo.owner.get(db);
  const bestaetigt =
    besitzer !== undefined &&
    (await pruefePasswort(eingabe.currentPassword, besitzer.passwordHash));
  const neuerHash = bestaetigt ? await neuerPasswortHash(eingabe.newPassword) : undefined;
  const userAgent = kontext.request.headers.get("user-agent");
  const ergebnis = await kontext.tor(
    kontext.nachweis,
    { type: "zugang.passwort_aendern", target: { ownerId: sitzung.ownerId } },
    { currentPasswordVerified: bestaetigt },
    async () => {
      if (neuerHash === undefined) throw new PaiBotError("passwort_falsch");
      const neu = await db.transaction(async (tx) => {
        await repo.owner.updatePassword(tx, sitzung.ownerId, neuerHash, d.uhr.now());
        await repo.sessions.endAll(tx, sitzung.ownerId);
        await repo.geraete.removeAll(tx, sitzung.ownerId);
        const neueSitzung = await sitzungAnlegen(tx, sitzung.ownerId, {
          now: d.uhr.now(),
          userAgent,
        });
        const geraet = await geraetAnlegen(tx, d.schluessel().sitzung, sitzung.ownerId, {
          now: d.uhr.now(),
        });
        return { ...neueSitzung, geraet };
      });
      return { value: neu, result: { status: "ok" } };
    },
  );
  const rahmen = { appUrl: d.appOrigin() };
  kontext.cookie(sitzungsCookie(rahmen, ergebnis.value.token, false));
  kontext.cookie(geraetCookie(rahmen, ergebnis.value.geraet.wert));
  return { geaendert: true };
}
