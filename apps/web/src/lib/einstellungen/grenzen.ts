/**
 * PaiBot – Grenzen unter Einstellungen: lesen (mit dem heutigen Verbrauch) und ändern über das Tor.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo } from "@paibot/db";
import { SETTINGS_FIELDS } from "@paibot/shared/aktionen";
import type { SettingsInput } from "@paibot/shared/eingaben";
import { PaiBotError } from "@paibot/shared/fehler";
import { LIMITS } from "@paibot/shared/konstanten";
import type { Settings } from "@paibot/shared/objekte";
import type { RoutenKontext } from "../api/route";
import type { EinstellungenAnzeige, EinstellungenGespeichert } from "./typen";

/** Mitternacht des Tages von `jetzt` in der Zeitzone `zeitzone`, als Zeitpunkt. */
export function tagesbeginn(jetzt: Date, zeitzone: string): Date {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zeitzone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(jetzt);
  const wert = (art: Intl.DateTimeFormatPartTypes) =>
    Number(teile.find((teil) => teil.type === art)?.value ?? "0");
  const wandAlsUtc = Date.UTC(
    wert("year"),
    wert("month") - 1,
    wert("day"),
    wert("hour"),
    wert("minute"),
    wert("second"),
  );
  const versatz = wandAlsUtc - Math.floor(jetzt.getTime() / 1000) * 1000;
  return new Date(Date.UTC(wert("year"), wert("month") - 1, wert("day")) - versatz);
}

/**
 * Verbrauchte Token (Eingabe plus Ausgabe aller Antworten des Bots) seit `seit`. Dieselbe Abfrage
 * wie für die Grenze `tagesbudget` in der Lauf-Steuerung (`repo.messages.tokensSince`).
 */
export function tokenSeit(db: Database, seit: Date): Promise<number> {
  return repo.messages.tokensSince(db, seit);
}

function anzeigeAus(
  settings: Settings,
  heute: { token: number; seit: Date },
): EinstellungenAnzeige {
  return {
    zeitzone: settings.timezone,
    tagesbudget: settings.dailyTokenBudget ?? null,
    verlaufsgrenze: settings.historyTokenLimit ?? null,
    heute: { token: heute.token, seit: heute.seit.toISOString() },
    hoechstwerte: { tagesbudget: LIMITS.dailyTokenBudget, verlaufsgrenze: LIMITS.historyTokens },
  };
}

/** Die Grenzen mit dem heutigen Verbrauch; vor der Einrichtung `einrichtung_offen`. */
export async function einstellungenAnzeige(
  db: Database,
  jetzt: Date,
): Promise<EinstellungenAnzeige> {
  const settings = await repo.settings.get(db);
  if (settings === undefined || settings.setupCompletedAt === undefined) {
    throw new PaiBotError("einrichtung_offen");
  }
  const seit = tagesbeginn(jetzt, settings.timezone);
  return anzeigeAus(settings, { token: await tokenSeit(db, seit), seit });
}

/** `GET /api/einstellungen`. */
export function einstellungenLesen(
  kontext: RoutenKontext<"einstellungen">,
): Promise<EinstellungenAnzeige> {
  return einstellungenAnzeige(kontext.db, kontext.dienste.uhr.now());
}

/**
 * `PATCH /api/einstellungen`: ändert Zeitzone, Verlaufsgrenze und Tagesgrenze (`null` entfernt
 * eine Grenze) über das Tor (`einstellung.aendern`). Antwortet mit den neuen Werten und dem Beleg
 * „Ergebnis“.
 */
export async function einstellungenAendern(
  kontext: RoutenKontext<"einstellungenAendern">,
): Promise<EinstellungenGespeichert> {
  const eingabe: SettingsInput = kontext.eingabe;
  const { db, dienste: d } = kontext;
  const vorher = await repo.settings.get(db);
  if (vorher?.installationId === undefined || vorher.setupCompletedAt === undefined) {
    throw new PaiBotError("einrichtung_offen");
  }
  const felder = SETTINGS_FIELDS.filter((feld) => eingabe[feld] !== undefined);
  const aenderung = {
    ...(eingabe.timezone === undefined ? {} : { timezone: eingabe.timezone }),
    ...(eingabe.historyTokenLimit === undefined
      ? {}
      : { historyTokenLimit: eingabe.historyTokenLimit }),
    ...(eingabe.dailyTokenBudget === undefined
      ? {}
      : { dailyTokenBudget: eingabe.dailyTokenBudget }),
  };
  const ergebnis = await kontext.tor(
    kontext.nachweis,
    { type: "einstellung.aendern", target: { installationId: vorher.installationId } },
    { fields: felder },
    async () => {
      const neu = await repo.settings.update(db, aenderung);
      return { value: neu, result: { status: "ok" } };
    },
  );
  const jetzt = d.uhr.now();
  const seit = tagesbeginn(jetzt, ergebnis.value.timezone);
  return {
    einstellungen: anzeigeAus(ergebnis.value, { token: await tokenSeit(db, seit), seit }),
    beleg: {
      id: ergebnis.receipts.result.receiptId,
      nummer: ergebnis.receipts.result.seq,
    },
  };
}
