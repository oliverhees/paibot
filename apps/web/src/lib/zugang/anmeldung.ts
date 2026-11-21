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
import { newId, type OwnerId } from "@paibot/shared/ids";
import type { RoutenKontext, TorOptionen } from "../api/route";
import {
  bekanntesGeraet,
  geraetAblauf,
  geraetAusAnfrage,
  geraetCookie,
  geraetCookieLoeschen,
  neuerGeraetWert,
} from "./geraet";
import { _nachweisPasswort, nachweisAusSitzung } from "./nachweis";
import { neuerPasswortHash, pruefePasswort } from "./passwort";
import {
  cookieLoeschen,
  type NeueSitzung,
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
 * Macht den Browser der Anfrage zum bekannten Gerät: Aktion „Gerät hinzugefügt“ über das Tor (mit
 * der neuen Sitzung als Nachweis), legt den Eintrag im Verzeichnis an und hängt die Sitzung daran.
 * Gibt den Wert für das Geräte-Cookie zurück. Mit `optionen.db` (Transaktion) läuft alles dort.
 */
export async function geraetHinzufuegen(
  kontext: RoutenKontext<"anmelden" | "passwortAendern" | "einrichtungAbschliessen">,
  neu: NeueSitzung,
  optionen: TorOptionen = {},
): Promise<string> {
  const db = optionen.db ?? kontext.db;
  const d = kontext.dienste;
  const deviceId = newId("device");
  const wert = neuerGeraetWert(d.schluessel().sitzung);
  const userAgent = kontext.request.headers.get("user-agent");
  await kontext.tor(
    nachweisAusSitzung(neu.sitzung),
    { type: "geraet.hinzufuegen", target: { deviceId } },
    { kind: "browser" },
    async () => {
      await repo.geraete.create(db, {
        id: deviceId,
        tokenHash: wert.tokenHash,
        ownerId: neu.sitzung.ownerId,
        kind: "browser",
        ...(userAgent ? { name: userAgent } : {}),
        now: d.uhr.now(),
        expiresAt: geraetAblauf(d.uhr.now()),
      });
      await repo.sessions.attachDevice(db, neu.sitzung.id, deviceId);
      return { value: undefined, result: { status: "ok" } };
    },
    optionen,
  );
  return wert.wert;
}

/**
 * `POST /api/zugang/anmelden`. Die Limits hat der Rahmen schon gezählt (vor dem teuren Hash). Das
 * Passwort wird über den Begrenzer geprüft (höchstens zwei gleichzeitig); ohne Besitzer gegen einen
 * Ersatz-Hash, damit Antwort und Dauer gleich bleiben. Bei Erfolg: veraltetes Hash-Verfahren
 * erneuern, über das Tor eine neue Sitzung mit frischem Token anlegen, Vorab-Cookie löschen. Ist
 * der Browser schon ein bekanntes Gerät, hängt die Sitzung daran und das Gerät gilt wieder 90 Tage;
 * sonst wird er eins (Aktion „Gerät hinzugefügt“).
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
  const rahmen = { appUrl: d.appOrigin() };
  const bisher = await bekanntesGeraet(
    db,
    d.schluessel().sitzung,
    geraetAusAnfrage(kontext.request, rahmen),
    d.uhr.now(),
    userAgent,
  );
  const bekannt = bisher?.ownerId === ownerId ? bisher : undefined;
  const ergebnis = await kontext.tor(
    _nachweisPasswort(ownerId, bekannt?.id),
    { type: "zugang.anmelden", target: { ownerId } },
    { remember: eingabe.remember },
    async () => {
      const neu = await sitzungAnlegen(db, ownerId, {
        now: d.uhr.now(),
        userAgent,
        ...(bekannt === undefined ? {} : { deviceId: bekannt.id }),
      });
      if (bekannt !== undefined) {
        await repo.geraete.renew(db, bekannt.id, {
          now: d.uhr.now(),
          expiresAt: geraetAblauf(d.uhr.now()),
        });
      }
      return { value: neu, result: { status: "ok" } };
    },
  );
  await kontext.limitZuruecksetzen("anmeldenIp");
  await kontext.limitZuruecksetzen("anmeldenIpTag");
  await kontext.limitZuruecksetzen("anmeldenGeraet");
  await kontext.limitZuruecksetzen("anmeldenGeraetTag");
  kontext.cookie(sitzungsCookie(rahmen, ergebnis.value.token, eingabe.remember));
  if (bekannt === undefined) {
    kontext.cookie(geraetCookie(rahmen, await geraetHinzufuegen(kontext, ergebnis.value)));
  }
  kontext.cookie(cookieLoeschen(vorabCookieName(rahmen), rahmen, "Strict"));
  return { angemeldet: true };
}

/**
 * `POST /api/zugang/abmelden`: beendet die Sitzung dieser Anfrage, widerruft das Gerät, zu dem sie
 * gehört (ein fremder Rechner bleibt so kein bekanntes Gerät), und löscht beide Cookies.
 */
export async function abmelden(kontext: RoutenKontext<"abmelden">): Promise<{ abgemeldet: true }> {
  const { sitzung, db } = kontext;
  const rahmen = { appUrl: kontext.dienste.appOrigin() };
  const geraet = await repo.sessions.deviceOf(db, sitzung.id);
  await kontext.tor(
    kontext.nachweis,
    { type: "zugang.abmelden", target: { ownerId: sitzung.ownerId } },
    {},
    async () => {
      if (geraet !== undefined) {
        await repo.geraete.revoke(db, sitzung.ownerId, geraet, {
          now: kontext.dienste.uhr.now(),
          grund: "abgemeldet",
        });
      }
      await repo.sessions.end(db, sitzung.id);
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
      await repo.geraete.revokeAll(db, sitzung.ownerId, { now: d.uhr.now() });
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
        await repo.geraete.revokeAll(tx, sitzung.ownerId, { now: d.uhr.now(), grund: "passwort" });
        await repo.sessions.endAll(tx, sitzung.ownerId);
        return sitzungAnlegen(tx, sitzung.ownerId, { now: d.uhr.now(), userAgent });
      });
      return { value: neu, result: { status: "ok" } };
    },
  );
  const rahmen = { appUrl: d.appOrigin() };
  kontext.cookie(sitzungsCookie(rahmen, ergebnis.value.token, false));
  kontext.cookie(geraetCookie(rahmen, await geraetHinzufuegen(kontext, ergebnis.value)));
  return { geaendert: true };
}

/** Ein bekanntes Gerät, wie die Oberfläche es sieht. */
export interface GeraetAnzeige {
  id: string;
  art: "browser";
  /** Browser-Kennung, aus der die Oberfläche eine grobe Angabe macht. */
  name?: string;
  angelegt: string;
  zuletzt: string;
  endet: string;
  /** Das Gerät, von dem diese Anfrage kommt. */
  aktuell: boolean;
}

/** `GET /api/zugang/geraete`: die gültigen bekannten Geräte, das aktuelle markiert. */
export async function geraeteListe(
  kontext: RoutenKontext<"geraete">,
): Promise<{ geraete: GeraetAnzeige[] }> {
  const aktuell = await repo.sessions.deviceOf(kontext.db, kontext.sitzung.id);
  const liste = await repo.geraete.list(kontext.db, kontext.sitzung.ownerId, {
    now: kontext.dienste.uhr.now(),
  });
  return {
    geraete: liste.map((g) => ({
      id: g.id,
      art: g.kind,
      ...(g.name === undefined ? {} : { name: g.name }),
      angelegt: g.createdAt,
      zuletzt: g.lastSeenAt,
      endet: g.expiresAt,
      aktuell: g.id === aktuell,
    })),
  };
}

/**
 * `POST /api/zugang/geraete/:id/entfernen`: widerruft ein bekanntes Gerät über das Tor (Aktion
 * „Gerät entfernt“); seine Sitzungen enden mit. Ist es dieses Gerät, sind danach auch diese
 * Sitzung und beide Cookies weg. Ein unbekanntes Gerät: `nicht_gefunden`.
 */
export async function geraetEntfernen(
  kontext: RoutenKontext<"geraetEntfernen">,
): Promise<{ entfernt: true; abgemeldet: boolean }> {
  const { db, sitzung, dienste: d } = kontext;
  const geraet = await repo.geraete.get(db, sitzung.ownerId, kontext.params.id ?? "");
  if (geraet === undefined) throw new PaiBotError("nicht_gefunden");
  const eigenes = await repo.sessions.deviceOf(db, sitzung.id);
  const dieses = eigenes === geraet.id;
  // Nennt der Hinweis auf diesem Gerät nichts außer dem Gerät, das hier entfernt wird, zeigt er
  // das Entfernen hier nicht an (es geschah ja hier); alle anderen Geräte sehen es.
  const ohneHinweis =
    eigenes !== undefined && !dieses
      ? (
          await repo.geraete.aenderungenSeit(db, sitzung.ownerId, eigenes, { now: d.uhr.now() })
        ).every((zeile) => zeile.id === geraet.id)
      : false;
  const aktiv =
    geraet.revokedAt === undefined && Date.parse(geraet.expiresAt) > d.uhr.now().getTime();
  await kontext.tor(
    kontext.nachweis,
    { type: "geraet.entfernen", target: { deviceId: geraet.id } },
    { deviceActive: aktiv, thisDevice: dieses },
    async () => {
      await repo.geraete.revoke(db, sitzung.ownerId, geraet.id, { now: d.uhr.now() });
      if (ohneHinweis && eigenes !== undefined) {
        await repo.geraete.hinweisBestaetigen(db, sitzung.ownerId, eigenes, {
          bis: d.uhr.now(),
          now: d.uhr.now(),
        });
      }
      return { value: undefined, result: { status: "ok" } };
    },
  );
  if (dieses) {
    const rahmen = { appUrl: d.appOrigin() };
    kontext.cookie(cookieLoeschen(sitzungsCookieName(rahmen), rahmen, "Lax"));
    kontext.cookie(geraetCookieLoeschen(rahmen));
  }
  return { entfernt: true, abgemeldet: dieses };
}
