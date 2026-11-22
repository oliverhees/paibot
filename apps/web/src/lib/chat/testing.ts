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
import type { ConversationId, MessageId, RunId } from "@paibot/shared/ids";
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

/** Ein Zwischentext eines Laufs (Text eines Schritts vor einem Werkzeug-Aufruf). */
export interface ZwischentextPlan {
  text: string;
  /** Standard `complete`; so bleiben auch Schritte zurück, die abbrachen oder scheiterten. */
  status?: "complete" | "failed" | "cancelled";
}

/** Ein Lauf der Testunterhaltung. */
export interface LaufPlan {
  /** Neue Nachricht der Person als Auslöser; fehlt sie, gilt der Auslöser des Laufs davor (neu erzeugt). */
  frage?: string;
  zwischentexte?: ZwischentextPlan[];
  /** End-Antwort des Laufs (ohne `step`); fehlt sie, endet der Lauf ohne Antwort. */
  antwort?: string;
  ende: "succeeded" | "failed" | "cancelled";
}

export interface LaufErgebnis {
  runId: RunId;
  frageId: MessageId;
  zwischentexte: MessageId[];
  antwortId?: MessageId;
}

/**
 * Legt eine Unterhaltung mit Läufen an, die Zwischentexte haben, ohne ein echtes Werkzeug: je Lauf
 * der Auslöser (falls neu), die Zwischentexte mit `step` 0, 1, …, die End-Antwort und das Ende des
 * Laufs, in dieser Reihenfolge. So schreibt die Lauf-Steuerung sie auch (siehe
 * `packages/agents/src/run/schleife.ts`); die Datenbank lässt nur einen Zwischentext je Schritt
 * und eine End-Antwort je Lauf zu.
 */
export async function mitZwischentexten(
  e: Umgebung,
  eingabe: { titel?: string; laeufe: LaufPlan[] },
): Promise<{ id: ConversationId; laeufe: LaufErgebnis[] }> {
  const id = (await neueUnterhaltung(e, eingabe.titel ?? "Beispiel")) as ConversationId;
  const [bot] = await repo.bots.list(e.u.db);
  if (bot === undefined) throw new Error("kein Bot");
  const ergebnis: LaufErgebnis[] = [];
  let frageId: MessageId | undefined;
  for (const plan of eingabe.laeufe) {
    if (plan.frage !== undefined || frageId === undefined) {
      const frage = await repo.messages.insert(e.u.db, {
        conversationId: id,
        role: "user",
        content: plan.frage ?? "Frage",
      });
      frageId = frage.id;
    }
    const lauf = await repo.runs.create(e.u.db, {
      conversationId: id,
      triggerMessageId: frageId,
      botId: bot.id,
    });
    await repo.runs.markRunning(e.u.db, lauf.id);
    const zwischen: MessageId[] = [];
    for (const [schritt, z] of (plan.zwischentexte ?? []).entries()) {
      const status = z.status ?? "complete";
      const nachricht = await repo.messages.insert(e.u.db, {
        conversationId: id,
        role: "assistant",
        content: z.text,
        runId: lauf.id,
        step: schritt,
        status,
        ...(status === "failed" ? { errorCode: "intern" as const } : {}),
        ...(status === "cancelled" ? { errorCode: "unterbrochen" as const } : {}),
      });
      zwischen.push(nachricht.id);
    }
    let antwortId: MessageId | undefined;
    if (plan.antwort !== undefined) {
      antwortId = (
        await repo.messages.insert(e.u.db, {
          conversationId: id,
          role: "assistant",
          content: plan.antwort,
          runId: lauf.id,
        })
      ).id;
    }
    await repo.runs.finish(e.u.db, lauf.id, {
      status: plan.ende,
      ...(plan.ende === "failed" ? { errorCode: "intern" as const } : {}),
      ...(plan.ende === "cancelled" ? { errorCode: "unterbrochen" as const } : {}),
    });
    ergebnis.push({
      runId: lauf.id,
      frageId,
      zwischentexte: zwischen,
      ...(antwortId === undefined ? {} : { antwortId }),
    });
  }
  return { id, laeufe: ergebnis };
}
