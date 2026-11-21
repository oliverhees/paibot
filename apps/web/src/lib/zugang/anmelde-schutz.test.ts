/**
 * PaiBot – Tests des Schutzes beim Anmelden und beim Ändern des Passworts: Netze statt einzelner
 * IPv6-Adressen, gemeinsame Bremse auch bei gleichzeitigen Versuchen, wachsende Sperrzeit,
 * bekannte Geräte als Ausweg, Aufheben der Sperren und Limit beim Passwort ändern.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { geraete, repo } from "@paibot/db";
import { describe, expect, it, vi } from "vitest";
import { adressGruppe } from "../kopfzeilen";
import { anmeldeSperrenAufheben, BREMSE, bremsTakt } from "../rate-limit";
import { schluesselAus } from "../umgebung";
import {
  abmelden,
  alleAbmelden,
  anmelden,
  geraetEntfernen,
  geraeteListe,
  passwortAendern,
  sitzungenListe,
} from "./anmeldung";
import { einrichtungAbschliessen } from "./einrichtung";
import { bekanntesGeraet, geraetCookie, neuerGeraetWert } from "./geraet";
import {
  anfrage,
  Keksdose,
  TEST_CODE,
  TEST_PASSWORT,
  type TestUmgebung,
  testGeheimnis,
  testUmgebung,
  vorabDose,
} from "./testing";

vi.setConfig({ testTimeout: 120_000 });

const MINUTE = 60_000;

async function eingerichtet(hinterProxy = true) {
  const u = await testUmgebung({ hinterProxy });
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const dose = vorabDose();
  const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
    dose,
    adresse: "192.0.2.1",
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  const h = {
    anmelden: u.handler("anmelden", async (k) => ({ daten: await anmelden(k) })),
    passwort: u.handler("passwortAendern", async (k) => ({ daten: await passwortAendern(k) })),
    sitzungen: u.handler("sitzungen", async (k) => ({ daten: await sitzungenListe(k) })),
    abmelden: u.handler("abmelden", async (k) => ({ daten: await abmelden(k) })),
    alle: u.handler("alleAbmelden", async (k) => ({ daten: await alleAbmelden(k) })),
    geraete: u.handler("geraete", async (k) => ({ daten: await geraeteListe(k) })),
    entfernen: u.handler("geraetEntfernen", async (k) => ({ daten: await geraetEntfernen(k) })),
  };
  return { u, h, einrichtungsDose: dose };
}

type Umgebung = Awaited<ReturnType<typeof eingerichtet>>;

function versuch(
  { u, h }: Umgebung,
  passwort: string,
  adresse: string,
  dose: Keksdose = vorabDose(),
) {
  return anfrage(u, h.anmelden, "POST", "/api/zugang/anmelden", {
    dose,
    adresse,
    koerper: { password: passwort, remember: false },
  });
}

/** Zählt, wie oft das Passwort wirklich geprüft wurde (Antwort „passwort_falsch“). */
function geprueft(antworten: { body: { fehler?: { code: string } } }[]) {
  return antworten.filter((a) => a.body.fehler?.code === "passwort_falsch").length;
}

/** Viele Fehlversuche von verschiedenen Adressen: Danach gilt die gemeinsame Bremse. */
async function flut(e: Umgebung) {
  await Promise.all(
    Array.from({ length: 50 }, (_, i) => versuch(e, `raten-${i}`, `198.51.100.${i + 1}`)),
  );
}

describe("Adressen", () => {
  it("IPv6 zählt je /64, IPv4 je Adresse", () => {
    expect(adressGruppe("2001:db8:aa:bb::1")).toBe("2001:db8:aa:bb::/64");
    expect(adressGruppe("2001:db8:aa:bb:ffff:1:2:3")).toBe("2001:db8:aa:bb::/64");
    expect(adressGruppe("2001:0db8:00aa:00bb::9")).toBe("2001:db8:aa:bb::/64");
    expect(adressGruppe("::1")).toBe("0:0:0:0::/64");
    expect(adressGruppe("64:ff9b::192.0.2.1")).toBe("64:ff9b:0:0::/64");
    expect(adressGruppe("203.0.113.7")).toBe("203.0.113.7");
  });

  it("wechselnde Adressen aus einem /64 teilen sich das Limit je Adresse", async () => {
    const e = await eingerichtet();
    for (let i = 1; i <= 5; i += 1) {
      expect(
        (await versuch(e, "falsch-falsch-1", `2001:db8:aa:bb::${i.toString(16)}`)).status,
      ).toBe(401);
    }
    const gesperrt = await versuch(e, TEST_PASSWORT, "2001:db8:aa:bb:9:9:9:9");
    expect(gesperrt.status).toBe(429);
    expect((await versuch(e, TEST_PASSWORT, "2001:db8:aa:cc::1")).status).toBe(200);
  });
});

describe("Gemeinsame Bremse", () => {
  for (const hinterProxy of [true, false]) {
    it(`gleichzeitige Versuche von vielen Adressen: höchstens einer je Takt wird geprüft (TRUST_PROXY ${hinterProxy ? "an" : "aus"})`, async () => {
      const e = await eingerichtet(hinterProxy);
      const flut = await Promise.all(
        Array.from({ length: 60 }, (_, i) =>
          versuch(e, `raten-${i}`, `2001:db8:${(i + 1).toString(16)}::1`),
        ),
      );
      // Bis zur Schwelle (20) laufen alle durch, danach je Takt-Stufe höchstens einer (60 Versuche
      // erreichen zwei Stufen).
      expect(geprueft(flut)).toBeLessThanOrEqual(22);
      expect(flut.filter((a) => a.status === 429).length).toBeGreaterThanOrEqual(38);
      const gesperrt = flut.find((a) => a.status === 429);
      expect(Number(gesperrt?.antwort.headers.get("retry-after"))).toBeGreaterThan(0);
    });
  }

  it("das Fenster je Adresse gleitet: Versuche am Ende eines Fensters zählen am Anfang des nächsten mit", async () => {
    const e = await eingerichtet();
    // Kurz vor dem Ende des Fensters (die Uhr der Tests beginnt an einer Fenster-Grenze).
    e.u.spaeter(14 * MINUTE);
    for (let i = 0; i < 5; i += 1) {
      expect((await versuch(e, "falsch-falsch-1", "198.51.100.10")).status).toBe(401);
    }
    e.u.spaeter(2 * MINUTE);
    const gleich = await versuch(e, TEST_PASSWORT, "198.51.100.10");
    expect(gleich.status).toBe(429);
    expect(Number(gleich.antwort.headers.get("retry-after"))).toBeGreaterThan(60);
  });

  it("der Takt wächst mit den Versuchen bis höchstens eine Minute", () => {
    expect(bremsTakt(1)).toBe(BREMSE.startSekunden);
    expect(bremsTakt(BREMSE.verdoppelnNach + 1)).toBe(2 * BREMSE.startSekunden);
    expect(bremsTakt(10_000)).toBe(BREMSE.maxSekunden);
    expect(BREMSE.maxSekunden).toBeLessThanOrEqual(60);
  });

  it("die Sperrzeit je Adresse wächst: nach 20 Fehlversuchen am Tag bis zum Ende des Tages", async () => {
    const e = await eingerichtet();
    // Vier Fenster zu je 15 Minuten mit je 5 Fehlversuchen: 20 an diesem Tag.
    for (let runde = 0; runde < 4; runde += 1) {
      for (let i = 0; i < 5; i += 1) {
        expect((await versuch(e, "falsch-falsch-1", "198.51.100.9")).status).toBe(401);
      }
      // Das Fenster je Adresse gleitet: erst nach zwei Fenstern zählt die Runde nicht mehr mit.
      e.u.spaeter(31 * MINUTE);
    }
    const danach = await versuch(e, TEST_PASSWORT, "198.51.100.9");
    expect(danach.status).toBe(429);
    expect(Number(danach.antwort.headers.get("retry-after"))).toBeGreaterThan(15 * 60);
  });
});

describe("Ausweg für den Besitzer", () => {
  it("ein bekanntes Gerät kommt während einer Flut an, ein unbekanntes nicht", async () => {
    const e = await eingerichtet(false);
    const bekannt = e.einrichtungsDose.werte.get("pb_geraet");
    expect(bekannt).toBeDefined();
    await flut(e);
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.77")).status).toBe(429);
    const dose = vorabDose();
    dose.werte.set("pb_geraet", bekannt ?? "");
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.77", dose)).status).toBe(200);
  });

  it("ein gefälschtes, fremdes oder nur signiertes Geräte-Cookie hilft nicht", async () => {
    const e = await eingerichtet(false);
    await flut(e);
    const fremd = neuerGeraetWert(schluesselAus({ PAIBOT_SECRET: testGeheimnis() }).sitzung).wert;
    // Richtig signiert, aber nie auf dem Server angelegt.
    const unbekannt = neuerGeraetWert(e.u.schluessel.sitzung).wert;
    for (const wert of [fremd, unbekannt, `${"a".repeat(32)}.${"b".repeat(43)}`, "x"]) {
      const dose = vorabDose();
      dose.werte.set("pb_geraet", wert);
      expect((await versuch(e, TEST_PASSWORT, "192.0.2.78", dose)).status).toBe(429);
    }
    const jetzt = e.u.zeit();
    expect(
      await bekanntesGeraet(e.u.db, e.u.schluessel.sitzung, fremd, jetzt, undefined),
    ).toBeUndefined();
    expect(
      await bekanntesGeraet(e.u.db, e.u.schluessel.sitzung, unbekannt, jetzt, undefined),
    ).toBeUndefined();
    const echt = e.einrichtungsDose.werte.get("pb_geraet");
    expect(
      (await bekanntesGeraet(e.u.db, e.u.schluessel.sitzung, echt, jetzt, undefined))?.id,
    ).toMatch(/^ger_/);
  });

  it("ein gestohlenes Geräte-Cookie bringt von vielen Adressen höchstens 5 Prüfungen je 15 Minuten", async () => {
    const e = await eingerichtet();
    const gestohlen = e.einrichtungsDose.werte.get("pb_geraet") ?? "";
    await flut(e);
    const antworten = [];
    for (let i = 0; i < 50; i += 1) {
      const dose = vorabDose();
      dose.werte.set("pb_geraet", gestohlen);
      antworten.push(
        await versuch(e, `raten-geraet-${i}`, `2001:db8:77:${i.toString(16)}::1`, dose),
      );
    }
    // Drei am eigenen Limit des Geräts vorbei, der vierte und fünfte nur über die Bremse, danach
    // sperrt das Limit des Geräts.
    expect(geprueft(antworten)).toBeLessThanOrEqual(5);
    expect(antworten.filter((a) => a.status === 429).length).toBeGreaterThanOrEqual(45);
  });

  it("auch ohne Flut bringt ein gestohlenes Geräte-Cookie nicht mehr Prüfungen als ein Browser ohne Gerät", async () => {
    const reihe = async (mitCookie: boolean) => {
      const e = await eingerichtet();
      const gestohlen = e.einrichtungsDose.werte.get("pb_geraet") ?? "";
      const antworten = [];
      for (let i = 0; i < 15; i += 1) {
        const dose = vorabDose();
        if (mitCookie) dose.werte.set("pb_geraet", gestohlen);
        antworten.push(await versuch(e, `raten-${i}`, `2001:db8:55:${i.toString(16)}::1`, dose));
      }
      return geprueft(antworten);
    };
    expect(await reihe(true)).toBeLessThanOrEqual(await reihe(false));
  });

  it("falsche Passwörter mit einem kopierten Geräte-Cookie sperren das echte Gerät nicht aus", async () => {
    const e = await eingerichtet();
    const kopie = e.einrichtungsDose.werte.get("pb_geraet") ?? "";
    // Der Angreifer probiert mit dem kopierten Cookie von vielen Adressen, bis das Gerät über
    // seinen beiden Limits liegt (5 je 15 Minuten, 20 am Tag).
    for (let i = 0; i < 25; i += 1) {
      const dose = vorabDose();
      dose.werte.set("pb_geraet", kopie);
      await versuch(e, `raten-${i}`, `2001:db8:66:${i.toString(16)}::1`, dose);
    }
    // Der Besitzer mit seinem Gerät und dem richtigen Passwort, von seiner eigenen Adresse: Er
    // wartet höchstens so lange wie jeder Browser hinter der gemeinsamen Bremse (Sekunden), nicht
    // bis zum Ende der Limits des Geräts (bis zu einem Tag).
    let status = 0;
    for (let runde = 0; runde < 5; runde += 1) {
      const echt = vorabDose();
      echt.werte.set("pb_geraet", kopie);
      status = (await versuch(e, TEST_PASSWORT, "192.0.2.1", echt)).status;
      if (status !== 429) break;
      e.u.spaeter(61_000);
    }
    expect(status).toBe(200);
  });

  it("nach drei Fehlversuchen mit einem Gerät geht es nicht mehr an der Bremse vorbei", async () => {
    const e = await eingerichtet();
    const bekannt = e.einrichtungsDose.werte.get("pb_geraet") ?? "";
    await flut(e);
    const mitGeraet = () => {
      const dose = vorabDose();
      dose.werte.set("pb_geraet", bekannt);
      return dose;
    };
    for (let i = 0; i < 3; i += 1) {
      expect(
        (await versuch(e, `falsch-${i}-xxxx`, `2001:db8:99:${i}::1`, mitGeraet())).status,
      ).toBe(401);
    }
    expect((await versuch(e, TEST_PASSWORT, "2001:db8:99:9::1", mitGeraet())).status).toBe(429);
  });

  it("ein entferntes Gerät hilft nicht mehr, seine Sitzung endet, beides mit Beleg", async () => {
    const e = await eingerichtet();
    const zweit = vorabDose();
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.5", zweit)).status).toBe(200);
    zweit.werte.delete("pb_vorab");
    const wert = zweit.werte.get("pb_geraet") ?? "";
    const g = await bekanntesGeraet(e.u.db, e.u.schluessel.sitzung, wert, e.u.zeit(), undefined);
    expect(g).toBeDefined();
    // Von einem anderen angemeldeten Browser aus entfernen.
    const erst = vorabDose();
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.6", erst)).status).toBe(200);
    erst.werte.delete("pb_vorab");
    const liste = await anfrage(e.u, e.h.geraete, "GET", "/api/zugang/geraete", { dose: erst });
    const eintraege = (liste.body.daten as { geraete: { id: string; aktuell: boolean }[] }).geraete;
    expect(eintraege.some((x) => x.id === g?.id && !x.aktuell)).toBe(true);
    expect(eintraege.filter((x) => x.aktuell)).toHaveLength(1);
    const weg = await anfrage(
      e.u,
      e.h.entfernen,
      "POST",
      `/api/zugang/geraete/${g?.id}/entfernen`,
      {
        dose: erst,
        params: { id: g?.id ?? "" },
      },
    );
    expect(weg.status).toBe(200);
    expect(weg.body.daten).toEqual({ entfernt: true, abgemeldet: false });
    expect(
      await bekanntesGeraet(e.u.db, e.u.schluessel.sitzung, wert, e.u.zeit(), undefined),
    ).toBeUndefined();
    const sitzungen = await anfrage(e.u, e.h.sitzungen, "GET", "/api/zugang/sitzungen", {
      dose: zweit,
    });
    expect(sitzungen.status).toBe(401);
    const belege = (await repo.belege.listFrom(e.u.db)).map((b) => b.body);
    for (const art of ["geraet.hinzufuegen", "geraet.entfernen"]) {
      expect(
        belege.some((b) => b.type === "result" && b.action.type === art),
        art,
      ).toBe(true);
    }
    await flut(e);
    const danach = vorabDose();
    danach.werte.set("pb_geraet", wert);
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.81", danach)).status).toBe(429);
    // Ein fremdes oder unbekanntes Gerät: nicht gefunden.
    const fremd = await anfrage(e.u, e.h.entfernen, "POST", "/api/zugang/geraete/ger_x/entfernen", {
      dose: erst,
      params: { id: "ger_x" },
    });
    expect(fremd.status).toBe(404);
  });

  it("die Adresse des Besitzers sperren hält ein bekanntes Gerät nicht auf", async () => {
    const e = await eingerichtet();
    const bekannt = e.einrichtungsDose.werte.get("pb_geraet") ?? "";
    for (let i = 0; i < 25; i += 1) await versuch(e, `raten-${i}`, "203.0.113.5");
    expect((await versuch(e, TEST_PASSWORT, "203.0.113.5")).status).toBe(429);
    const dose = vorabDose();
    dose.werte.set("pb_geraet", bekannt);
    expect((await versuch(e, TEST_PASSWORT, "203.0.113.5", dose)).status).toBe(200);
  });

  for (const fall of ["abmelden", "alle", "passwort"] as const) {
    it(`nach ${fall === "abmelden" ? "Abmelden" : fall === "alle" ? "„Alle Sitzungen beenden“" : "neuem Passwort"} gilt das alte Geräte-Cookie nicht mehr`, async () => {
      const e = await eingerichtet();
      const dose = vorabDose();
      expect((await versuch(e, TEST_PASSWORT, "192.0.2.3", dose)).status).toBe(200);
      dose.werte.delete("pb_vorab");
      const alt = dose.werte.get("pb_geraet") ?? "";
      expect(
        await bekanntesGeraet(e.u.db, e.u.schluessel.sitzung, alt, e.u.zeit(), undefined),
      ).toBeDefined();
      const r =
        fall === "passwort"
          ? await anfrage(e.u, e.h.passwort, "POST", "/api/zugang/passwort", {
              dose,
              koerper: { currentPassword: TEST_PASSWORT, newPassword: "Neues-Passwort-Lang-77" },
            })
          : await anfrage(
              e.u,
              fall === "abmelden" ? e.h.abmelden : e.h.alle,
              "POST",
              fall === "abmelden" ? "/api/zugang/abmelden" : "/api/zugang/alle-abmelden",
              { dose },
            );
      expect(r.status).toBe(200);
      expect(
        await bekanntesGeraet(e.u.db, e.u.schluessel.sitzung, alt, e.u.zeit(), undefined),
      ).toBeUndefined();
      if (fall !== "passwort") {
        expect(
          r.antwort.headers.getSetCookie().some((z) => /^pb_geraet=;.*Max-Age=0/.test(z)),
        ).toBe(true);
      }
      // Auch das Gerät der Einrichtung ist bei „alle“ und neuem Passwort weg.
      const einrichtung = e.einrichtungsDose.werte.get("pb_geraet");
      const nochDa = await bekanntesGeraet(
        e.u.db,
        e.u.schluessel.sitzung,
        einrichtung,
        e.u.zeit(),
        undefined,
      );
      expect(nochDa === undefined).toBe(fall !== "abmelden");
      // Und während einer Flut hilft das alte Cookie nicht mehr.
      await flut(e);
      const danach = vorabDose();
      danach.werte.set("pb_geraet", alt);
      expect((await versuch(e, "Neues-Passwort-Lang-77", "192.0.2.80", danach)).status).toBe(429);
    });
  }

  it("ein Gerät gilt 90 Tage", async () => {
    const e = await eingerichtet();
    const bekannt = e.einrichtungsDose.werte.get("pb_geraet");
    e.u.spaeter(89 * 24 * 60 * MINUTE);
    expect(
      await bekanntesGeraet(e.u.db, e.u.schluessel.sitzung, bekannt, e.u.zeit(), undefined),
    ).toBeDefined();
    e.u.spaeter(2 * 24 * 60 * MINUTE);
    expect(
      await bekanntesGeraet(e.u.db, e.u.schluessel.sitzung, bekannt, e.u.zeit(), undefined),
    ).toBeUndefined();
  });

  it("je Besitzer gelten höchstens zehn Geräte; eine erneute Anmeldung im selben Browser legt keins an", async () => {
    const e = await eingerichtet();
    for (let i = 0; i < 12; i += 1) {
      expect((await versuch(e, TEST_PASSWORT, `192.0.2.${100 + i}`)).status).toBe(200);
    }
    const ownerId = (await repo.owner.get(e.u.db))?.id as never;
    expect((await repo.geraete.list(e.u.db, ownerId, { now: e.u.zeit() })).length).toBe(
      repo.geraete.MAX_GERAETE,
    );
    const vorher = (await e.u.db.select().from(geraete)).length;
    const dose = vorabDose();
    dose.werte.set("pb_geraet", e.einrichtungsDose.werte.get("pb_geraet") ?? "");
    // Das Gerät der Einrichtung wurde durch die zehn neueren widerrufen: Es gilt nicht mehr.
    expect(
      await bekanntesGeraet(
        e.u.db,
        e.u.schluessel.sitzung,
        dose.werte.get("pb_geraet"),
        e.u.zeit(),
        undefined,
      ),
    ).toBeUndefined();
    const neu = vorabDose();
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.200", neu)).status).toBe(200);
    neu.werte.delete("pb_vorab");
    const wieder = vorabDose();
    wieder.werte.set("pb_geraet", neu.werte.get("pb_geraet") ?? "");
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.200", wieder)).status).toBe(200);
    expect((await e.u.db.select().from(geraete)).length).toBe(vorher + 1);
  });

  it("das Aufheben der Sperren (Migrations-Schritt) gibt die Anmeldung sofort wieder frei", async () => {
    const e = await eingerichtet(false);
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => versuch(e, `raten-${i}`, `198.51.100.${i + 1}`)),
    );
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.79")).status).toBe(429);
    expect(await anmeldeSperrenAufheben(e.u.db)).toBeGreaterThan(0);
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.79")).status).toBe(200);
  });

  it("Geräte-Cookie nur über http-Anfragen von PaiBot selbst, 90 Tage", () => {
    const zeile = geraetCookie({ appUrl: "https://paibot.example.de" }, "w");
    expect(zeile).toBe(
      "__Host-pb_geraet=w; Path=/; HttpOnly; SameSite=Strict; Max-Age=7776000; Secure",
    );
  });
});

describe("Passwort ändern", () => {
  async function angemeldet() {
    const e = await eingerichtet();
    const dose = vorabDose();
    const r = await versuch(e, TEST_PASSWORT, "192.0.2.2", dose);
    if (r.status !== 200) throw new Error(`Anmelden: ${r.status}`);
    dose.werte.delete("pb_vorab");
    return { ...e, dose };
  }

  function aendern(u: TestUmgebung, e: Umgebung, dose: Keksdose, aktuell: string) {
    return anfrage(u, e.h.passwort, "POST", "/api/zugang/passwort", {
      dose,
      koerper: { currentPassword: aktuell, newPassword: "Neues-Passwort-Lang-77" },
    });
  }

  it("nach 5 Versuchen in 15 Minuten: gesperrt und die Sitzung der Anfrage endet", async () => {
    const e = await angemeldet();
    for (let i = 0; i < 5; i += 1) {
      expect((await aendern(e.u, e, e.dose, `falsch-${i}-xxxxxx`)).status).toBe(401);
    }
    const zuViele = await aendern(e.u, e, e.dose, TEST_PASSWORT);
    expect(zuViele.status).toBe(429);
    expect(zuViele.body.fehler?.code).toBe("zu_viele_versuche");
    expect(
      zuViele.antwort.headers.getSetCookie().some((z) => /^pb_sitzung=;.*Max-Age=0/.test(z)),
    ).toBe(true);
    expect(e.dose.werte.has("pb_sitzung")).toBe(false);
  });

  it("das Limit gilt je Sitzung: eine andere Sitzung des Besitzers ändert das Passwort weiter", async () => {
    const e = await angemeldet();
    const andere = vorabDose();
    expect((await versuch(e, TEST_PASSWORT, "192.0.2.4", andere)).status).toBe(200);
    andere.werte.delete("pb_vorab");
    for (let i = 0; i < 6; i += 1) await aendern(e.u, e, e.dose, `falsch-${i}-xxxxxx`);
    expect((await aendern(e.u, e, andere, TEST_PASSWORT)).status).toBe(200);
  });

  it("das alte Sitzungs-Cookie gilt nach der Sperre nicht mehr", async () => {
    const e = await angemeldet();
    const sitzung = e.dose.werte.get("pb_sitzung") ?? "";
    for (let i = 0; i < 6; i += 1) await aendern(e.u, e, e.dose, `falsch-${i}-xxxxxx`);
    const alt = new Keksdose();
    alt.werte.set("pb_sitzung", sitzung);
    const r = await anfrage(e.u, e.h.sitzungen, "GET", "/api/zugang/sitzungen", { dose: alt });
    expect(r.status).toBe(401);
  });
});
