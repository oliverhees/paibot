/**
 * PaiBot – Testhilfe für Suche, Datei-Export und „neu erzeugen“: eingerichtete Installation mit
 * den Handlern der Chat-Routen über den echten Rahmen, Datei-Anfragen und Belege lesen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { verifyChain } from "@paibot/receipts";
import type { StoredActionType } from "@paibot/shared/aktionen";
import { CSRF } from "@paibot/shared/konstanten";
import { einrichtungAbschliessen } from "../zugang/einrichtung";
import {
  anfrage,
  type Keksdose,
  pruefzeichenFuer,
  TEST_CODE,
  TEST_ORIGIN,
  TEST_PASSWORT,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "../zugang/testing";
import { nachrichtSenden, unterhaltungAnlegen } from "./aktionen";

/** Warteschlange, die nur mitschreibt. */
export function merkSchlange() {
  const jobs: { runId: string; conversationId: string }[] = [];
  return {
    jobs,
    bereit: async () => undefined,
    lauf: async (job: (typeof jobs)[number]) => {
      jobs.push(job);
    },
  };
}

/** Eingerichtete Installation mit Sitzung in `dose`. */
export async function eingerichtet() {
  const u = await testUmgebung();
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const dose = vorabDose();
  const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
    dose,
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  const schlange = merkSchlange();
  return {
    u,
    dose,
    schlange,
    anlegen: u.handler("unterhaltungAnlegen", unterhaltungAnlegen),
    senden: u.handler("nachrichtSenden", nachrichtSenden(schlange)),
  };
}

export type Umgebung = Awaited<ReturnType<typeof eingerichtet>>;

/** Legt eine Unterhaltung über die Route an. */
export async function neueUnterhaltung(e: Umgebung, titel: string): Promise<string> {
  const r = await anfrage(e.u, e.anlegen, "POST", "/api/unterhaltungen", {
    dose: e.dose,
    koerper: { title: titel },
  });
  if (r.status !== 201) throw new Error(`Anlegen: ${r.status}`);
  return (r.body.daten as { unterhaltung: { id: string } }).unterhaltung.id;
}

/** Schickt eine Anfrage mit Datei-Antwort über den Rahmen (ohne die JSON-Hülle auszupacken). */
export async function dateiAnfrage(
  u: TestUmgebung,
  handler: Parameters<typeof anfrage>[1],
  pfad: string,
  optionen: { dose: Keksdose; params?: Record<string, string>; pruefzeichen?: string | false },
): Promise<Response> {
  await u.bereit();
  const kopf = new Headers({ origin: TEST_ORIGIN, "x-forwarded-for": "203.0.113.7" });
  const zeichen =
    optionen.pruefzeichen === undefined
      ? pruefzeichenFuer(u, optionen.dose)
      : optionen.pruefzeichen;
  if (zeichen) kopf.set(CSRF.header, zeichen);
  if (optionen.dose.werte.size > 0) kopf.set("cookie", optionen.dose.kopf());
  return handler(new Request(`${TEST_ORIGIN}${pfad}`, { method: "POST", headers: kopf }), {
    params: Promise.resolve(optionen.params ?? {}),
  });
}

/** Belege einer Aktion als `Art:Ergebnis` (älteste zuerst). */
export async function belegeDer(u: TestUmgebung, aktion: StoredActionType) {
  const seite = await repo.belege.listPage(u.db, { action: aktion, limit: 50 });
  return seite.items.reverse();
}

/** Ist die ganze Kette gültig? */
export async function ketteGueltig(u: TestUmgebung): Promise<boolean> {
  const belege = await repo.belege.listFrom(u.db);
  const ergebnis = await verifyChain(belege, {
    publicKeys: await repo.installationKeys.listPublic(u.db),
    rules: await repo.rules.listActive(u.db),
  } as never);
  return ergebnis.ok;
}
