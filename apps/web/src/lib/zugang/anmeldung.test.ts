/**
 * PaiBot – Tests von Anmelden, Sitzung, Abmelden, Passwortwechsel und CSRF über den Rahmen der
 * API-Routen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { scryptSync } from "node:crypto";
import { isPasswordHash, needsRehash, toBase64Url } from "@paibot/crypto";
import { owner, repo, sessions } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import type { OwnerId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import { abmelden, alleAbmelden, anmelden, passwortAendern, sitzungenListe } from "./anmeldung";
import { einrichtungAbschliessen } from "./einrichtung";
import { _nachweisPasswort } from "./nachweis";
import {
  anfrage,
  Keksdose,
  TEST_CODE,
  TEST_PASSWORT,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "./testing";

// Passwort-Rechnungen (scrypt) und Migrationen brauchen unter Last länger als die Standard-Zeit.
vi.setConfig({ testTimeout: 60_000 });

const TAG = 24 * 60 * 60 * 1000;

function routen(u: TestUmgebung) {
  return {
    anmelden: u.handler("anmelden", async (k) => ({ daten: await anmelden(k) })),
    abmelden: u.handler("abmelden", async (k) => ({ daten: await abmelden(k) })),
    alle: u.handler("alleAbmelden", async (k) => ({ daten: await alleAbmelden(k) })),
    sitzungen: u.handler("sitzungen", async (k) => ({ daten: await sitzungenListe(k) })),
    passwort: u.handler("passwortAendern", async (k) => ({ daten: await passwortAendern(k) })),
  };
}

/** Installation nach der Einrichtung (ohne Anbieter), die Sitzung der Einrichtung verworfen. */
async function eingerichtet(optionen: Parameters<typeof testUmgebung>[0] = {}) {
  const u = await testUmgebung(optionen);
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
    dose: vorabDose(),
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  return { u, h: routen(u) };
}

async function einloggen(
  u: TestUmgebung,
  h: ReturnType<typeof routen>,
  passwort = TEST_PASSWORT,
  weiteres: { adresse?: string; remember?: boolean } = {},
) {
  const dose = vorabDose();
  const r = await anfrage(u, h.anmelden, "POST", "/api/zugang/anmelden", {
    dose,
    ...(weiteres.adresse ? { adresse: weiteres.adresse } : {}),
    koerper: { password: passwort, remember: weiteres.remember ?? false },
  });
  return { ...r, dose };
}

describe("Anmelden", () => {
  it("richtiges Passwort: neue Sitzung, Cookie laut Vorgabe, Vorab-Cookie gelöscht", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h, TEST_PASSWORT, { remember: true });
    expect(a.status).toBe(200);
    const zeile = a.dose.zeilen.find((z) => z.startsWith("pb_sitzung="));
    expect(zeile).toMatch(
      /^pb_sitzung=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/,
    );
    expect(a.dose.werte.has("pb_vorab")).toBe(false);
    const ohne = await einloggen(u, h);
    expect(ohne.dose.zeilen.find((z) => z.startsWith("pb_sitzung="))).not.toContain("Max-Age");
  });

  it("jede Anmeldung bekommt ein neues Token", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h);
    const b = await einloggen(u, h);
    expect(a.dose.werte.get("pb_sitzung")).not.toBe(b.dose.werte.get("pb_sitzung"));
  });

  it("falsches Passwort: 401 mit festem Text, keine Sitzung, kein Beleg", async () => {
    const { u, h } = await eingerichtet();
    const vorher = (await repo.belege.listFrom(u.db)).length;
    const a = await einloggen(u, h, "ganz-falsch-1234");
    expect(a.status).toBe(401);
    expect(a.body).toEqual({
      ok: false,
      fehler: {
        code: "passwort_falsch",
        text: "Das Passwort stimmt nicht.",
        felder: [{ feld: "password", code: "ungueltig" }],
      },
    });
    expect((await repo.belege.listFrom(u.db)).length).toBe(vorher);
    expect(a.dose.werte.has("pb_sitzung")).toBe(false);
  });

  it("vor der Einrichtung: gleiche Antwort wie bei falschem Passwort (verrät nichts)", async () => {
    const { u: mit, h: hMit } = await eingerichtet();
    const falsch = await einloggen(mit, hMit, "ganz-falsch-1234");
    const u = await testUmgebung();
    const ohne = await einloggen(u, routen(u), "ganz-falsch-1234");
    expect(ohne.status).toBe(falsch.status);
    expect(ohne.body).toEqual(falsch.body);
  });

  it("Limit je Adresse: der sechste Versuch in 15 Minuten wird vor der Passwort-Prüfung gesperrt", async () => {
    const { u, h } = await eingerichtet();
    for (let i = 0; i < 5; i += 1)
      expect((await einloggen(u, h, "falsch-falsch-1")).status).toBe(401);
    const gesperrt = await einloggen(u, h, TEST_PASSWORT);
    expect(gesperrt.status).toBe(429);
    expect(gesperrt.body.fehler?.code).toBe("zu_viele_versuche");
    expect(Number(gesperrt.antwort.headers.get("retry-after"))).toBeGreaterThan(0);
    // Nach Ablauf des Fensters geht es wieder.
    u.spaeter(15 * 60 * 1000);
    expect((await einloggen(u, h)).status).toBe(200);
  });

  it("Gesamt-Limit: über der Schwelle ein Versuch je Takt; ein bekanntes Gerät kommt trotzdem an", async () => {
    const { u, h } = await eingerichtet();
    const bekannt = await einloggen(u, h);
    const geraet = bekannt.dose.werte.get("pb_geraet");
    expect(geraet).toMatch(/^[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/);
    // Die Anmeldung oben zählt mit: 19 weitere füllen die Schwelle von 20.
    for (let i = 0; i < 19; i += 1) {
      const r = await einloggen(u, h, "falsch-falsch-1", { adresse: `198.51.100.${i + 1}` });
      expect(r.status).toBe(401);
    }
    expect((await einloggen(u, h, "falsch-falsch-1", { adresse: "198.51.100.30" })).status).toBe(
      401,
    );
    const neuesGeraet = await einloggen(u, h, TEST_PASSWORT, { adresse: "192.0.2.50" });
    expect(neuesGeraet.status).toBe(429);
    const dose = vorabDose();
    dose.werte.set("pb_geraet", geraet ?? "");
    const besitzer = await anfrage(u, h.anmelden, "POST", "/api/zugang/anmelden", {
      dose,
      adresse: "192.0.2.50",
      koerper: { password: TEST_PASSWORT, remember: false },
    });
    expect(besitzer.status).toBe(200);
    expect(u.gewartet).toEqual([]);
  });

  it("unbekannte Adresse (ohne TRUST_PROXY) sperrt niemanden aus, sondern verzögert", async () => {
    const { u, h } = await eingerichtet({ hinterProxy: false });
    for (let i = 0; i < 8; i += 1) {
      // Gefälschte Kopfzeile wird ohne TRUST_PROXY nicht gelesen: alle zählen als „unbekannt“.
      const r = await einloggen(u, h, "falsch-falsch-1", { adresse: `198.51.100.${i + 1}` });
      expect(r.status).toBe(401);
    }
    const zaehler = await repo.rateLimit.peek(u.db, {
      key: "anmelden:ip:unbekannt",
      max: 5,
      windowSeconds: 900,
      now: u.zeit(),
    });
    expect(zaehler.count).toBe(8);
    expect(u.gewartet).toEqual([2000, 2000, 2000]);
    expect((await einloggen(u, h)).status).toBe(200);
  });

  it("mit TRUST_PROXY zählt der rechte Eintrag von X-Forwarded-For, ein gefälschter linker wirkt nicht", async () => {
    const { u, h } = await eingerichtet();
    for (let i = 0; i < 5; i += 1) {
      await einloggen(u, h, "falsch-falsch-1", { adresse: `10.0.0.${i}, 203.0.113.99` });
    }
    const gesperrt = await einloggen(u, h, TEST_PASSWORT, { adresse: "1.2.3.4, 203.0.113.99" });
    expect(gesperrt.status).toBe(429);
    expect(
      (await einloggen(u, h, TEST_PASSWORT, { adresse: "203.0.113.99, 192.0.2.1" })).status,
    ).toBe(200);
  });

  it("veraltetes Hash-Verfahren wird beim Anmelden erneuert", async () => {
    const { u, h } = await eingerichtet();
    const salz = Buffer.alloc(16, 7);
    const alt = scryptSync(TEST_PASSWORT, salz, 32, { N: 16384, r: 8, p: 1 });
    const altHash = `scrypt$16384$8$1$${toBase64Url(salz)}$${toBase64Url(alt)}`;
    expect(isPasswordHash(altHash)).toBe(true);
    expect(needsRehash(altHash)).toBe(true);
    await u.db.update(owner).set({ passwordHash: altHash });
    expect((await einloggen(u, h)).status).toBe(200);
    const neu = (await repo.owner.get(u.db))?.passwordHash ?? "";
    expect(neu).not.toBe(altHash);
    expect(needsRehash(neu)).toBe(false);
  });

  it("Felder aus dem Körper wie `credential` werden nicht angenommen", async () => {
    const { u, h } = await eingerichtet();
    const r = await anfrage(u, h.anmelden, "POST", "/api/zugang/anmelden", {
      dose: vorabDose(),
      koerper: { password: "falsch-falsch-1", remember: false, credential: "sitzung" },
    });
    expect(r.status).toBe(400);
  });
});

describe("Sitzung", () => {
  it("gleitend 30 Tage: ohne Benutzung abgelaufen", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    u.spaeter(31 * TAG);
    const r = await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose });
    expect(r.status).toBe(401);
    expect(r.body.fehler?.code).toBe("nicht_angemeldet");
  });

  it("gleitend verlängert, aber höchstens 90 Tage ab dem Anmelden", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    for (let tag = 20; tag <= 80; tag += 20) {
      u.spaeter(20 * TAG);
      expect((await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose })).status).toBe(
        200,
      );
    }
    u.spaeter(11 * TAG);
    expect((await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose })).status).toBe(
      401,
    );
  });

  it("die Liste nennt keine Kennungen und markiert die aktuelle Sitzung", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    await einloggen(u, h);
    const r = await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose });
    const liste = (r.body.daten as { sitzungen: { aktuell: boolean }[] }).sitzungen;
    expect(liste.filter((s) => s.aktuell)).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toMatch(/[0-9a-f]{64}/);
  });

  it("Abmelden löscht die Sitzung und das Cookie; danach 401", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    const vorher = (await u.db.select().from(sessions)).length;
    const r = await anfrage(u, h.abmelden, "POST", "/api/zugang/abmelden", { dose });
    expect(r.status).toBe(200);
    expect(dose.zeilen.at(-1)).toBe("pb_sitzung=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    expect((await u.db.select().from(sessions)).length).toBe(vorher - 1);
    expect(dose.werte.has("pb_sitzung")).toBe(false);
  });

  it("ein altes Token nach dem Abmelden gilt nicht mehr", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    const token = dose.werte.get("pb_sitzung") ?? "";
    await anfrage(u, h.abmelden, "POST", "/api/zugang/abmelden", { dose });
    const alt = new Keksdose();
    alt.werte.set("pb_sitzung", token);
    expect(
      (await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose: alt })).status,
    ).toBe(401);
  });

  it("alle abmelden beendet alle Sitzungen", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h);
    const b = await einloggen(u, h);
    const r = await anfrage(u, h.alle, "POST", "/api/zugang/alle-abmelden", { dose: a.dose });
    expect(r.status).toBe(200);
    expect((await u.db.select().from(sessions)).length).toBe(0);
    expect(
      (await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose: b.dose })).status,
    ).toBe(401);
  });

  it("Passwortwechsel: falsches aktuelles Passwort ändert nichts; richtiges beendet alle Sitzungen", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h);
    const b = await einloggen(u, h);
    const falsch = await anfrage(u, h.passwort, "POST", "/api/zugang/passwort", {
      dose: a.dose,
      koerper: { currentPassword: "falsch-falsch-1", newPassword: "Neues-Passwort-2026" },
    });
    expect(falsch.status).toBe(401);
    expect((await u.db.select().from(sessions)).length).toBe(3);

    const ok = await anfrage(u, h.passwort, "POST", "/api/zugang/passwort", {
      dose: a.dose,
      koerper: { currentPassword: TEST_PASSWORT, newPassword: "Neues-Passwort-2026" },
    });
    expect(ok.status).toBe(200);
    expect((await u.db.select().from(sessions)).length).toBe(1);
    expect(
      (await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose: b.dose })).status,
    ).toBe(401);
    expect(
      (await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose: a.dose })).status,
    ).toBe(200);
    expect((await einloggen(u, h, TEST_PASSWORT)).status).toBe(401);
    expect((await einloggen(u, h, "Neues-Passwort-2026")).status).toBe(200);
  });
});

describe("Passwortwechsel im Beleg", () => {
  it("falsches aktuelles Passwort: das Tor lehnt ab, der Beleg sagt „abgelehnt“, der Hash bleibt", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h);
    const vorher = (await repo.owner.get(u.db))?.passwordHash;
    const falsch = await anfrage(u, h.passwort, "POST", "/api/zugang/passwort", {
      dose: a.dose,
      koerper: { currentPassword: "falsch-falsch-1", newPassword: "Neues-Passwort-2026" },
    });
    expect(falsch.status).toBeGreaterThanOrEqual(400);
    const entscheidungen = (await repo.belege.listFrom(u.db))
      .map((e) => e.body)
      .filter((b) => b.type === "decision" && b.action.type === "zugang.passwort_aendern");
    expect(entscheidungen).toHaveLength(1);
    const [entscheidung] = entscheidungen;
    if (entscheidung?.type !== "decision") throw new Error("keine Entscheidung");
    expect(entscheidung.facts).toMatchObject({ currentPasswordVerified: false });
    expect(entscheidung.decision.outcome).toBe("deny");
    const ergebnisse = (await repo.belege.listFrom(u.db))
      .map((e) => e.body)
      .filter((b) => b.type === "result" && b.action.type === "zugang.passwort_aendern");
    // Nach einer Ablehnung hält das Tor nur „abgelehnt“ fest, es lief nichts.
    expect(ergebnisse.map((b) => (b.type === "result" ? b.result.status : ""))).toEqual(["denied"]);
    expect((await repo.owner.get(u.db))?.passwordHash).toBe(vorher);
  });
});

describe("CSRF", () => {
  it("fehlender `Origin`: abgelehnt", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    const r = await anfrage(u, h.abmelden, "POST", "/api/zugang/abmelden", { dose, origin: null });
    expect(r.status).toBe(403);
    expect(r.body.fehler?.code).toBe("herkunft_falsch");
    expect((await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose })).status).toBe(
      200,
    );
  });

  it.each([
    "https://paibot.test",
    "http://paibot.test.boese.de",
    "http://paibot.test:3000",
    "null",
  ])("falscher `Origin` %s: abgelehnt", async (origin) => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    const r = await anfrage(u, h.abmelden, "POST", "/api/zugang/abmelden", { dose, origin });
    expect(r.body.fehler?.code).toBe("herkunft_falsch");
  });

  it("`Sec-Fetch-Site: cross-site` wird abgelehnt, auch mit passendem Origin", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    const r = await anfrage(u, h.abmelden, "POST", "/api/zugang/abmelden", {
      dose,
      kopf: { "sec-fetch-site": "cross-site" },
    });
    expect(r.body.fehler?.code).toBe("herkunft_falsch");
  });

  it("fehlendes, falsches oder fremdes Prüfzeichen: abgelehnt", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h);
    const b = await einloggen(u, h);
    const fehlt = await anfrage(u, h.abmelden, "POST", "/api/zugang/abmelden", {
      dose: a.dose,
      pruefzeichen: null,
    });
    expect(fehlt.body.fehler?.code).toBe("pruefzeichen_fehlt");
    const falsch = await anfrage(u, h.abmelden, "POST", "/api/zugang/abmelden", {
      dose: a.dose,
      pruefzeichen: "x".repeat(43),
    });
    expect(falsch.body.fehler?.code).toBe("pruefzeichen_fehlt");
    // Das Prüfzeichen einer anderen Sitzung passt nicht.
    const { pruefzeichenFuer } = await import("./testing");
    const fremd = await anfrage(u, h.abmelden, "POST", "/api/zugang/abmelden", {
      dose: a.dose,
      pruefzeichen: pruefzeichenFuer(u, b.dose) ?? null,
    });
    expect(fremd.body.fehler?.code).toBe("pruefzeichen_fehlt");
    // Sitzung der Einrichtung und die beiden Anmeldungen bestehen weiter.
    expect((await u.db.select().from(sessions)).length).toBe(3);
  });

  it("Anmelden ohne Vorab-Prüfzeichen wird abgelehnt", async () => {
    const { u, h } = await eingerichtet();
    const r = await anfrage(u, h.anmelden, "POST", "/api/zugang/anmelden", {
      dose: new Keksdose(),
      koerper: { password: TEST_PASSWORT, remember: false },
    });
    expect(r.body.fehler?.code).toBe("pruefzeichen_fehlt");
  });

  it("GET ohne Wirkung: eine verändernde Route lässt sich nicht per GET auslösen", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    const r = await anfrage(u, h.abmelden, "GET", "/api/zugang/abmelden", { dose });
    expect(r.status).toBe(405);
    expect((await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose })).status).toBe(
      200,
    );
  });
});

describe("Rahmen und Nachweis", () => {
  it("eine verändernde Route, die ihre Aktion nicht durchs Tor schickt, scheitert (intern)", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    const ohneTor = u.handler("abmelden", async () => ({ daten: { abgemeldet: true } }));
    const r = await anfrage(u, ohneTor, "POST", "/api/zugang/abmelden", { dose });
    expect(r.status).toBe(500);
  });

  it("ein nachgebauter Nachweis oder ein `credential` in den Fakten wird nicht angenommen", async () => {
    const { u, h } = await eingerichtet();
    const { dose } = await einloggen(u, h);
    const nachbau = u.handler("abmelden", async (k) => {
      await k.tor(
        { art: "sitzung" } as never,
        { type: "zugang.abmelden", target: { ownerId: k.sitzung.ownerId } },
        {},
        async () => ({ value: 1, result: { status: "ok" } }),
      );
      return { daten: 1 };
    });
    expect((await anfrage(u, nachbau, "POST", "/api/zugang/abmelden", { dose })).status).toBe(500);
    const mitCredential = u.handler("abmelden", async (k) => {
      await k.tor(
        k.nachweis,
        { type: "zugang.abmelden", target: { ownerId: k.sitzung.ownerId } },
        { credential: "sitzung" } as never,
        async () => ({ value: 1, result: { status: "ok" } }),
      );
      return { daten: 1 };
    });
    expect((await anfrage(u, mitCredential, "POST", "/api/zugang/abmelden", { dose })).status).toBe(
      500,
    );
    // Ein Passwort-Nachweis gilt nicht für eine Aktion, die eine Sitzung verlangt.
    const falscheArt = u.handler("abmelden", async (k) => {
      await k.tor(
        _nachweisPasswort(k.sitzung.ownerId as OwnerId),
        { type: "zugang.abmelden", target: { ownerId: k.sitzung.ownerId } },
        {},
        async () => ({ value: 1, result: { status: "ok" } }),
      );
      return { daten: 1 };
    });
    expect((await anfrage(u, falscheArt, "POST", "/api/zugang/abmelden", { dose })).status).toBe(
      500,
    );
  });

  it("ohne Sitzung weist eine Besitzer-Route ab, ohne die Aktion zu erreichen", async () => {
    const db = (await createTestDb()).db;
    const u = await testUmgebung({ db });
    let erreicht = false;
    const h = u.handler("abmelden", async () => {
      erreicht = true;
      return { daten: 1 };
    });
    const r = await anfrage(u, h, "POST", "/api/zugang/abmelden", { dose: new Keksdose() });
    expect(r.status).toBe(401);
    expect(erreicht).toBe(false);
  });
});
