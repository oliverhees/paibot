/**
 * PaiBot – Aktionen der Beleg- und Regel-Routen (für `route(…)` und Tests): lesen, Kette in
 * Stücken, Prüfung auf dem Server als gekennzeichneter Rückfall, Export durch das Tor.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { exportHeader, exportJsonl } from "@paibot/receipts";
import * as pruefer from "@paibot/receipts/pruefen";
import { PaiBotError } from "@paibot/shared/fehler";
import type { RoutenErgebnis, RoutenKontext } from "../api/route";
import {
  belegeSeite,
  belegMitUmfeld,
  ganzeKette,
  kettenAbfrage,
  kettenStueck,
  regelDaten,
  schluesselDaten,
} from "./lesen";
import { pruefeEinzeln, pruefeKette } from "./pruefung";

/** GET /api/belege – Liste, neueste zuerst, mit `nextBefore` zum Blättern. */
export async function belegeListe(k: RoutenKontext<"belege">): Promise<RoutenErgebnis> {
  return { daten: await belegeSeite(k.db, k.eingabe) };
}

/** GET /api/belege/:id – Beleg mit Vorgänger, Nachfolger und zugehörigem Beleg. */
export async function belegLesen(k: RoutenKontext<"beleg">): Promise<RoutenErgebnis> {
  return { daten: await belegMitUmfeld(k.db, k.params.id ?? "") };
}

/**
 * GET /api/belege/:id/pruefung – dieselbe Prüfung wie im Browser, aber auf dem Server. Nur als
 * Rückfall, wenn der Browser nicht selbst prüfen kann; das Ergebnis trägt `quelle: "server"`.
 */
export async function belegPruefen(k: RoutenKontext<"belegPruefung">): Promise<RoutenErgebnis> {
  const umfeld = await belegMitUmfeld(k.db, k.params.id ?? "");
  const [schluessel, regeln] = await Promise.all([schluesselDaten(k.db), regelDaten(k.db)]);
  const ergebnis = await pruefeEinzeln(
    {
      beleg: umfeld.beleg,
      ...(umfeld.vorgaenger === undefined ? {} : { vorgaenger: umfeld.vorgaenger }),
      ...(umfeld.nachfolger === undefined ? {} : { nachfolger: umfeld.nachfolger }),
      schluesselBelege: schluessel.belege,
      regeln,
    },
    pruefer,
    "server",
  );
  return { daten: ergebnis };
}

/**
 * GET /api/belege/kette – ein Stück der Kette im Format des Exports (`?ab=&anzahl=`), im ersten
 * Stück mit Kopf. Mit `?pruefung=server` prüft der Server die ganze Kette (Rückfall, gekennzeichnet).
 */
export async function belegeKette(k: RoutenKontext<"belegeKette">): Promise<RoutenErgebnis> {
  const abfrage = kettenAbfrage(k.request.url);
  if (abfrage.pruefung === "server") {
    const [regeln, schluessel] = await Promise.all([
      regelDaten(k.db),
      repo.installationKeys.listPublic(k.db),
    ]);
    const ergebnis = await pruefeKette(
      ganzeKette(k.db),
      { regeln, publicKeys: schluessel, quelle: "server" },
      pruefer,
    );
    return { daten: { ergebnis } };
  }
  return { daten: await kettenStueck(k.db, abfrage, k.dienste.uhr.now()) };
}

/** GET /api/belege/schluessel – Start-Beleg, Schlüsselwechsel und öffentliche Schlüssel. */
export async function belegeSchluessel(
  k: RoutenKontext<"belegeSchluessel">,
): Promise<RoutenErgebnis> {
  return { daten: await schluesselDaten(k.db) };
}

/** GET /api/regeln – Stand, gültige Regeln und alle Fassungen (zum Nachrechnen). */
export async function regelnLesen(k: RoutenKontext<"regeln">): Promise<RoutenErgebnis> {
  return { daten: await regelDaten(k.db) };
}

/** Name der Export-Datei, z. B. `paibot-belege-2026-11-21.jsonl`. */
export function exportDateiname(jetzt: Date): string {
  return `paibot-belege-${jetzt.toISOString().slice(0, 10)}.jsonl`;
}

/**
 * POST /api/belege/export – Export aller Belege im Format von `pnpm belege:pruefen`, mit Anker im
 * Kopf. Läuft durch das Tor (Aktion `belege.exportieren`), der Export bekommt also selbst Belege:
 * Die Entscheidung steht schon in der Datei, das Ergebnis folgt danach.
 */
export async function belegeExportieren(k: RoutenKontext<"belegeExport">): Promise<RoutenErgebnis> {
  const settings = await repo.settings.get(k.db);
  const kopf = await repo.belege.head(k.db);
  if (settings?.installationId === undefined || kopf === undefined) {
    throw new PaiBotError("einrichtung_offen");
  }
  const jetzt = k.dienste.uhr.now();
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "belege.exportieren", target: { installationId: settings.installationId } },
    { entries: kopf.seq },
    async () => {
      const header = await exportHeader(k.db, jetzt);
      let inhalt = "";
      let eintraege = 0;
      async function* gezaehlt() {
        for await (const e of ganzeKette(k.db)) {
          eintraege++;
          yield e;
        }
      }
      for await (const zeile of exportJsonl(header, gezaehlt())) inhalt += zeile;
      return { value: { inhalt, eintraege }, result: { status: "ok" } };
    },
  );
  return {
    daten: {
      dateiname: exportDateiname(jetzt),
      inhalt: ergebnis.value.inhalt,
      eintraege: ergebnis.value.eintraege,
      belege: {
        entscheidung: {
          id: ergebnis.receipts.decision.receiptId,
          seq: ergebnis.receipts.decision.seq,
        },
        ergebnis: { id: ergebnis.receipts.result.receiptId, seq: ergebnis.receipts.result.seq },
      },
    },
  };
}
