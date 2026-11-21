/**
 * PaiBot – Tests: Belege nennen das Gerät, von dem eine Aktion kam, und der Hinweis bei Anmeldung
 * von einem neuen Gerät (sichtbar auf den anderen Geräten, „Das war ich“ über das Tor).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import type { ReceiptEntry } from "@paibot/shared/belege";
import type { DeviceId, OwnerId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import { anmelden, geraetEntfernen, passwortAendern } from "./anmeldung";
import { einrichtungAbschliessen } from "./einrichtung";
import { hinweisBestaetigen, neueAnmeldungen } from "./hinweis";
import { _gepruefteSitzung } from "./nachweis";
import { sitzungAnlegen } from "./sitzung";
import {
  anfrage,
  Keksdose,
  TEST_CODE,
  TEST_PASSWORT,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "./testing";

vi.setConfig({ testTimeout: 60_000 });

const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function routen(u: TestUmgebung) {
  return {
    anmelden: u.handler("anmelden", async (k) => ({ daten: await anmelden(k) })),
    hinweis: u.handler("geraeteHinweisBestaetigen", async (k) => ({
      daten: await hinweisBestaetigen(k),
    })),
    entfernen: u.handler("geraetEntfernen", async (k) => ({ daten: await geraetEntfernen(k) })),
    passwort: u.handler("passwortAendern", async (k) => ({ daten: await passwortAendern(k) })),
  };
}

/** Eingerichtet; die Dose der Einrichtung ist Gerät A (mit Sitzung). */
async function eingerichtet() {
  const u = await testUmgebung();
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const a = vorabDose();
  const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
    dose: a,
    kopf: { "user-agent": FIREFOX },
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  return { u, h: routen(u), a };
}

/** Meldet sich an; mit `dose` als bekanntes Gerät (deren Geräte-Cookie), sonst als neues. */
async function einloggen(
  u: TestUmgebung,
  h: ReturnType<typeof routen>,
  optionen: { dose?: Keksdose; userAgent?: string } = {},
) {
  const dose = vorabDose();
  const geraet = optionen.dose?.werte.get("pb_geraet");
  if (geraet !== undefined) dose.werte.set("pb_geraet", geraet);
  const r = await anfrage(u, h.anmelden, "POST", "/api/zugang/anmelden", {
    dose,
    kopf: { "user-agent": optionen.userAgent ?? SAFARI },
    koerper: { password: TEST_PASSWORT, remember: false },
  });
  if (r.status !== 200) throw new Error(`Anmelden: ${r.status}`);
  return dose;
}

/** Geprüfte Sitzung zur Dose (wie `besitzerSeite` sie liefert). */
async function sitzungVon(u: TestUmgebung, dose: Keksdose) {
  const { createHash } = await import("node:crypto");
  const token = dose.werte.get("pb_sitzung") ?? "";
  const id = createHash("sha256").update(token).digest("hex");
  const zeile = await repo.sessions.findByTokenHash(u.db, id, { now: u.zeit() });
  if (zeile === undefined) throw new Error("keine Sitzung");
  return _gepruefteSitzung({
    id: zeile.id,
    ownerId: zeile.ownerId,
    createdAt: zeile.createdAt,
    expiresAt: zeile.expiresAt,
  });
}

async function geraetVon(u: TestUmgebung, dose: Keksdose): Promise<DeviceId> {
  const id = await repo.sessions.deviceOf(u.db, (await sitzungVon(u, dose)).id);
  if (id === undefined) throw new Error("kein Gerät");
  return id;
}

async function belege(u: TestUmgebung): Promise<ReceiptEntry[]> {
  return repo.belege.listFrom(u.db);
}

function entscheidungen(liste: ReceiptEntry[], typ: string) {
  return liste.filter((b) => b.body.type === "decision" && b.body.action.type === typ);
}

function fakten(b: ReceiptEntry | undefined): Record<string, unknown> {
  return b?.body.type === "decision" ? (b.body.facts as Record<string, unknown>) : {};
}

describe("Belege nennen das Gerät", () => {
  it("Aktion mit Sitzung: Fakt `device` = Gerät der Sitzung", async () => {
    const { u, h, a } = await eingerichtet();
    const geraetA = await geraetVon(u, a);
    u.spaeter(1000);
    await einloggen(u, h);
    const r = await anfrage(u, h.hinweis, "POST", "/api/zugang/geraete/hinweis", { dose: a });
    expect(r.status).toBe(200);
    const [beleg] = entscheidungen(await belege(u), "geraet.bestaetigen");
    expect(fakten(beleg)).toMatchObject({ credential: "sitzung", device: geraetA });
  });

  it("Anmelden: neues Gerät ohne `device` (es entsteht erst), bekanntes Gerät mit", async () => {
    const { u, h } = await eingerichtet();
    const b = await einloggen(u, h);
    const geraetB = await geraetVon(u, b);
    const vorher = (await belege(u)).length;
    u.spaeter(1000);
    await einloggen(u, h, { dose: b });
    const neu = (await belege(u)).slice(vorher);
    const [erste] = entscheidungen(await belege(u), "zugang.anmelden");
    const [zweite] = entscheidungen(neu, "zugang.anmelden");
    expect(fakten(erste)).not.toHaveProperty("device");
    expect(fakten(zweite)).toMatchObject({ credential: "passwort", device: geraetB });
    // Ein bekanntes Gerät wird nicht erneut hinzugefügt.
    expect(entscheidungen(neu, "geraet.hinzufuegen")).toHaveLength(0);
    // „Gerät hinzugefügt“ nennt das neue Gerät als Ziel.
    const hinzu = entscheidungen(await belege(u), "geraet.hinzufuegen");
    const ziele = hinzu.map((x) => (x.body.type === "decision" ? x.body.action.target : {}));
    expect(ziele).toContainEqual({ deviceId: geraetB });
  });

  it("ein Gerät in den Fakten der Aktion weist der Rahmen ab (nur er setzt es)", async () => {
    const { u, a } = await eingerichtet();
    const vorher = (await belege(u)).length;
    const boese = u.handler("geraeteHinweisBestaetigen", async (k) => {
      await k.tor(
        k.nachweis,
        { type: "geraet.bestaetigen", target: { deviceId: await geraetVon(u, a) } },
        { newDevices: 0, device: "ger_00000000000000000000000000" } as never,
        async () => ({ value: undefined, result: { status: "ok" } }),
      );
      return { daten: {} };
    });
    const r = await anfrage(u, boese, "POST", "/api/zugang/geraete/hinweis", { dose: a });
    expect(r.status).toBe(500);
    expect(r.body.fehler?.code).toBe("intern");
    expect((await belege(u)).length).toBe(vorher);
  });
});

describe("Hinweis bei Anmeldung von einem neuen Gerät", () => {
  it("erscheint auf den anderen Geräten, nicht auf dem neuen", async () => {
    const { u, h, a } = await eingerichtet();
    u.spaeter(60_000);
    const b = await einloggen(u, h);
    const neu = await neueAnmeldungen(u.db, await sitzungVon(u, a), u.zeit());
    expect(neu).toHaveLength(1);
    expect(neu[0]).toEqual({
      id: await geraetVon(u, b),
      name: SAFARI,
      angelegt: u.zeit().toISOString(),
    });
    expect(await neueAnmeldungen(u.db, await sitzungVon(u, b), u.zeit())).toEqual([]);
    // Ohne Adresse: der Hinweis kennt nur Kennung, Browser-Kennung und Zeit.
    expect(Object.keys(neu[0] ?? {}).sort()).toEqual(["angelegt", "id", "name"]);
  });

  it("erneute Anmeldung mit einem bekannten Gerät ist keine neue Anmeldung", async () => {
    const { u, h, a } = await eingerichtet();
    u.spaeter(1000);
    const b = await einloggen(u, h);
    await anfrage(u, h.hinweis, "POST", "/api/zugang/geraete/hinweis", { dose: a });
    u.spaeter(1000);
    await einloggen(u, h, { dose: b });
    expect(await neueAnmeldungen(u.db, await sitzungVon(u, a), u.zeit())).toEqual([]);
  });

  it("„Das war ich“ schließt den Hinweis nur auf diesem Gerät, mit Beleg", async () => {
    const { u, h, a } = await eingerichtet();
    u.spaeter(1000);
    const b = await einloggen(u, h);
    u.spaeter(1000);
    const c = await einloggen(u, h, { userAgent: FIREFOX });
    const geraetA = await geraetVon(u, a);
    const r = await anfrage(u, h.hinweis, "POST", "/api/zugang/geraete/hinweis", { dose: a });
    expect(r.body).toEqual({ ok: true, daten: { bestaetigt: 2 } });
    expect(await neueAnmeldungen(u.db, await sitzungVon(u, a), u.zeit())).toEqual([]);
    // B sieht C weiter.
    const beiB = await neueAnmeldungen(u.db, await sitzungVon(u, b), u.zeit());
    expect(beiB.map((g) => g.id)).toEqual([await geraetVon(u, c)]);
    const liste = await belege(u);
    const [entscheidung] = entscheidungen(liste, "geraet.bestaetigen");
    expect(entscheidung?.body.type === "decision" && entscheidung.body.action.target).toEqual({
      deviceId: geraetA,
    });
    expect(fakten(entscheidung)).toMatchObject({ newDevices: 2, device: geraetA });
    expect(liste.at(-1)?.body.type).toBe("result");
    // Ein später dazukommendes Gerät erscheint auf A wieder.
    u.spaeter(1000);
    await einloggen(u, h);
    expect(await neueAnmeldungen(u.db, await sitzungVon(u, a), u.zeit())).toHaveLength(1);
  });

  it("„Das war ich nicht“: Passwort ändern entfernt das fremde Gerät, der Hinweis ist weg", async () => {
    const { u, h, a } = await eingerichtet();
    u.spaeter(1000);
    const b = await einloggen(u, h);
    u.spaeter(1000);
    const r = await anfrage(u, h.passwort, "POST", "/api/zugang/passwort", {
      dose: a,
      kopf: { "user-agent": FIREFOX },
      koerper: { currentPassword: TEST_PASSWORT, newPassword: "Neues-Beispiel-Passwort-2026" },
    });
    expect(r.status).toBe(200);
    // B ist abgemeldet, sein Gerät widerrufen; A (neues Gerät nach dem Wechsel) sieht nichts.
    await expect(sitzungVon(u, b)).rejects.toThrow("keine Sitzung");
    expect(await neueAnmeldungen(u.db, await sitzungVon(u, a), u.zeit())).toEqual([]);
  });

  it("ein entferntes neues Gerät verschwindet aus dem Hinweis", async () => {
    const { u, h, a } = await eingerichtet();
    u.spaeter(1000);
    const b = await einloggen(u, h);
    const id = await geraetVon(u, b);
    const r = await anfrage(u, h.entfernen, "POST", `/api/zugang/geraete/${id}/entfernen`, {
      dose: a,
      params: { id },
    });
    expect(r.status).toBe(200);
    expect(await neueAnmeldungen(u.db, await sitzungVon(u, a), u.zeit())).toEqual([]);
  });

  it("ohne Sitzung 401, ohne Prüfzeichen 403, fremde Herkunft 403 – kein Beleg", async () => {
    const { u, h, a } = await eingerichtet();
    const vorher = (await belege(u)).length;
    const ohne = await anfrage(u, h.hinweis, "POST", "/api/zugang/geraete/hinweis");
    expect(ohne.status).toBe(401);
    const zeichen = await anfrage(u, h.hinweis, "POST", "/api/zugang/geraete/hinweis", {
      dose: a,
      pruefzeichen: null,
    });
    expect(zeichen.status).toBe(403);
    const herkunft = await anfrage(u, h.hinweis, "POST", "/api/zugang/geraete/hinweis", {
      dose: a,
      origin: "https://fremd.example",
    });
    expect(herkunft.status).toBe(403);
    expect((await belege(u)).length).toBe(vorher);
  });

  it("Sitzung ohne Gerät: kein Hinweis, Bestätigen ergibt nicht_gefunden", async () => {
    const { u } = await eingerichtet();
    const ownerId = (await repo.owner.get(u.db))?.id as OwnerId;
    const neu = await sitzungAnlegen(u.db, ownerId, { now: u.zeit() });
    expect(await neueAnmeldungen(u.db, neu.sitzung, u.zeit())).toEqual([]);
    const dose = new Keksdose();
    dose.werte.set("pb_sitzung", neu.token);
    const r = await anfrage(u, routen(u).hinweis, "POST", "/api/zugang/geraete/hinweis", { dose });
    expect(r.status).toBe(404);
  });
});
