/**
 * PaiBot – Test-Hilfen für die Seiten „Modell und Anbieter“, „Bot“ und „Datenschleuse“: eine
 * eingerichtete Installation mit Anbieter, Schlüssel und Modell, Routen über den Rahmen und das
 * Lesen der Belege.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { botAendern, botLesen, botModell } from "../bot/bot";
import { datenschleuseLesen, datenschleuseStandard } from "../schleuse/schleuse";
import { einrichtungAbschliessen } from "../zugang/einrichtung";
import {
  anfrage,
  type Keksdose,
  TEST_CODE,
  TEST_MODELLE,
  TEST_PASSWORT,
  TEST_SCHLUESSEL,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "../zugang/testing";
import {
  anbieterAendern,
  anbieterAnlegen,
  anbieterListe,
  anbieterLoeschen,
  anbieterModelle,
  anbieterVerbindungstest,
} from "./anbieter";

/** Alle Routen dieses Bereichs über den Test-Rahmen. */
export function bereichsRouten(u: TestUmgebung) {
  return {
    anbieterListe: u.handler("anbieterListe", anbieterListe),
    anbieterAnlegen: u.handler("anbieterAnlegen", anbieterAnlegen),
    anbieterAendern: u.handler("anbieterAendern", anbieterAendern),
    anbieterLoeschen: u.handler("anbieterLoeschen", anbieterLoeschen),
    verbindungstest: u.handler("anbieterVerbindungstest", anbieterVerbindungstest),
    modelle: u.handler("anbieterModelle", anbieterModelle),
    bot: u.handler("bot", botLesen),
    botAendern: u.handler("botAendern", botAendern),
    botModell: u.handler("botModell", botModell),
    schleuse: u.handler("datenschleuse", datenschleuseLesen),
    schleuseStandard: u.handler("datenschleuseStandard", datenschleuseStandard),
  };
}

export interface Eingerichtet {
  u: TestUmgebung;
  dose: Keksdose;
  r: ReturnType<typeof bereichsRouten>;
  /** Jede Antwort im Klartext, damit Tests darin nach Schlüsseln suchen können. */
  antworten: string[];
  /** Anfrage wie `anfrage`, mit der Sitzung der Einrichtung; merkt sich die Antwort. */
  rufe(
    handler: Parameters<typeof anfrage>[1],
    methode: string,
    pfad: string,
    optionen?: Parameters<typeof anfrage>[4],
  ): ReturnType<typeof anfrage>;
}

/** Eingerichtete Installation: Anbieter mit `TEST_SCHLUESSEL`, Modell A, Bot „Pai“. */
export async function eingerichtet(
  optionen: Parameters<typeof testUmgebung>[0] = {},
): Promise<Eingerichtet> {
  const u = await testUmgebung(optionen);
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const dose = vorabDose();
  const r0 = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
    dose,
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      apiKey: TEST_SCHLUESSEL,
      modelSlug: TEST_MODELLE[0]?.slug,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r0.status !== 200) throw new Error(`Einrichtung: ${r0.status}`);
  const antworten: string[] = [];
  return {
    u,
    dose,
    r: bereichsRouten(u),
    antworten,
    async rufe(handler, methode, pfad, opt = {}) {
      const ergebnis = await anfrage(u, handler, methode, pfad, { dose, ...opt });
      antworten.push(await ergebnis.antwort.clone().text());
      for (const [name, wert] of ergebnis.antwort.headers) antworten.push(`${name}: ${wert}`);
      return ergebnis;
    },
  };
}

/** Alle Belege als Text (neueste zuerst) und die Aktionen der Belege. */
export async function belegeAlsText(u: TestUmgebung) {
  const seite = await repo.belege.listPage(u.db, { limit: 200 });
  return {
    text: JSON.stringify(seite.items),
    eintraege: seite.items,
  };
}

/** Belege einer Aktion seit einer Nummer: Arten (`decision`/`result`) in Reihenfolge. */
export async function belegeSeit(u: TestUmgebung, seq: number) {
  const seite = await repo.belege.listPage(u.db, { limit: 200 });
  return seite.items
    .filter((e) => e.seq > seq)
    .reverse()
    .map((e) => ({
      typ: e.body.type,
      aktion: "action" in e.body ? e.body.action.type : undefined,
      body: e.body,
    }));
}

export async function letzteNummer(u: TestUmgebung): Promise<number> {
  return (await repo.belege.head(u.db))?.seq ?? 0;
}
