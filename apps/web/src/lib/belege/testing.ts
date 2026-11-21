/**
 * PaiBot – Test-Hilfen der Belege-Seite: eingerichtete Installation mit echter Beleg-Kette, Handler
 * der Beleg-Routen, Schlüsselwechsel ohne Beglaubigung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { encryptSecret, fingerprint, generateSigningKey } from "@paibot/crypto";
import { repo } from "@paibot/db";
import { createReceiptWriter } from "@paibot/receipts";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { type KeyId, newId } from "@paibot/shared/ids";
import { abmelden, anmelden } from "../zugang/anmeldung";
import { einrichtungAbschliessen } from "../zugang/einrichtung";
import {
  anfrage,
  type Keksdose,
  TEST_CODE,
  TEST_PASSWORT,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "../zugang/testing";
import { regelDaten } from "./lesen";
import type { RegelDaten } from "./pruefung";
import {
  belegeExportieren,
  belegeKette,
  belegeListe,
  belegeSchluessel,
  belegLesen,
  belegPruefen,
  regelnLesen,
} from "./routen";

/** Handler aller Beleg- und Regel-Routen auf der Test-Umgebung. */
export function belegRouten(u: TestUmgebung) {
  return {
    belege: u.handler("belege", belegeListe),
    beleg: u.handler("beleg", belegLesen),
    pruefung: u.handler("belegPruefung", belegPruefen),
    kette: u.handler("belegeKette", belegeKette),
    schluessel: u.handler("belegeSchluessel", belegeSchluessel),
    export: u.handler("belegeExport", belegeExportieren),
    regeln: u.handler("regeln", regelnLesen),
  };
}

/**
 * Eingerichtete Installation; danach mehrmals ab- und angemeldet, damit die Kette ein paar
 * Aktionen enthält. `dose` trägt eine gültige Sitzung.
 */
export async function eingerichtet(runden = 2): Promise<{ u: TestUmgebung; dose: Keksdose }> {
  const u = await testUmgebung();
  u.neuerCode(TEST_CODE);
  let dose = vorabDose();
  const r = await anfrage(
    u,
    u.handler("einrichtungAbschliessen", async (k) => ({
      daten: await einrichtungAbschliessen(k),
    })),
    "POST",
    "/api/einrichtung",
    {
      dose,
      koerper: {
        setupCode: TEST_CODE,
        password: TEST_PASSWORT,
        passwordRepeat: TEST_PASSWORT,
        schleuseModeDefault: "off",
        botName: "Pai",
      },
    },
  );
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  const ab = u.handler("abmelden", async (k) => ({ daten: await abmelden(k) }));
  const an = u.handler("anmelden", async (k) => ({ daten: await anmelden(k) }));
  for (let i = 0; i < runden; i++) {
    await anfrage(u, ab, "POST", "/api/zugang/abmelden", { dose });
    dose = vorabDose();
    const a = await anfrage(u, an, "POST", "/api/zugang/anmelden", {
      dose,
      koerper: { password: TEST_PASSWORT, remember: false },
    });
    if (a.status !== 200) throw new Error(`Anmelden: ${a.status}`);
    u.spaeter(60_000);
  }
  return { u, dose };
}

/** Die ganze Kette aus der Datenbank, älteste zuerst. */
export async function ketteAus(u: TestUmgebung): Promise<ReceiptEntry[]> {
  return repo.belege.listFrom(u.db, { fromSeq: 1, limit: 10_000 });
}

/** Regel-Daten wie die Route `/api/regeln`. */
export function regelnAus(u: TestUmgebung): Promise<RegelDaten> {
  return regelDaten(u.db);
}

/** Tiefe Kopie (JSON), damit Manipulationen die Datenbank-Werte nicht berühren. */
export function kopie<T>(wert: T): T {
  return JSON.parse(JSON.stringify(wert)) as T;
}

/**
 * Schlüsselwechsel, den nur der neue Schlüssel signiert (der bisherige private Schlüssel „fehlt“).
 * Liefert die Nummer des Wechsel-Belegs.
 */
export async function wechselOhneBeglaubigung(u: TestUmgebung): Promise<number> {
  const paar = generateSigningKey();
  const keyId = newId("key") as KeyId;
  await repo.installationKeys.rotate(u.db, {
    id: keyId,
    publicKey: paar.publicKey,
    privateKeyEnc: encryptSecret(paar.privateKey, u.schluessel.belege, {
      aad: secretAad(signingKeySecretBinding(keyId, paar.publicKey)),
    }),
    fingerprint: fingerprint(paar.publicKey),
  });
  const writer = createReceiptWriter(u.db, {
    current: async () => ({ keyId, privateKey: paar.privateKey }),
  });
  const ref = await writer.appendKeyChange({
    next: { keyId, publicKey: paar.publicKey, privateKey: paar.privateKey },
    time: u.zeit(),
  });
  return ref.seq;
}
