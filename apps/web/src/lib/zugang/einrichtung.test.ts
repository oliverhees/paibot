/**
 * PaiBot – Tests der Einrichtung über den Rahmen der API-Routen: Code, Limits, Abschluss in einer
 * Transaktion, Belege, danach gesperrt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { decryptSecret, hashToken } from "@paibot/crypto";
import { belege, installationKeys, owner, providers, repo, sessions } from "@paibot/db";
import { verifyChain } from "@paibot/receipts";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import type { ProviderId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import {
  type AbschlussOptionen,
  type EinrichtungsSchritt,
  einrichtungAbschliessen,
  einrichtungsStatus,
  einrichtungVerbindungstest,
} from "./einrichtung";
import {
  anfrage,
  TEST_CODE,
  TEST_PASSWORT,
  TEST_SCHLUESSEL,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "./testing";

// Passwort-Rechnungen (scrypt) und Migrationen brauchen unter Last länger als die Standard-Zeit.
vi.setConfig({ testTimeout: 60_000 });

function handler(u: TestUmgebung, optionen: AbschlussOptionen = {}) {
  return {
    status: u.handler("einrichtungStatus", async ({ db, dienste }) => ({
      daten: await einrichtungsStatus(db, dienste),
    })),
    test: u.handler("einrichtungVerbindungstest", async (k) => ({
      daten: await einrichtungVerbindungstest(k),
    })),
    abschluss: u.handler("einrichtungAbschliessen", async (k) => ({
      daten: await einrichtungAbschliessen(k, optionen),
    })),
  };
}

function eingabe(ueber: Record<string, unknown> = {}) {
  return {
    setupCode: TEST_CODE.toLowerCase().replaceAll("-", ""),
    password: TEST_PASSWORT,
    passwordRepeat: TEST_PASSWORT,
    apiKey: TEST_SCHLUESSEL,
    modelSlug: "beispiel/modell-a",
    schleuseModeDefault: "off",
    botName: "Pai",
    timezone: "Europe/Berlin",
    ...ueber,
  };
}

async function bereit(optionen: Parameters<typeof testUmgebung>[0] = {}) {
  const u = await testUmgebung(optionen);
  u.neuerCode(TEST_CODE);
  return u;
}

async function zaehlen(u: TestUmgebung) {
  const [o, b, k, s, p] = await Promise.all([
    u.db.select().from(owner),
    u.db.select().from(belege),
    u.db.select().from(installationKeys),
    u.db.select().from(sessions),
    u.db.select().from(providers),
  ]);
  return {
    owner: o.length,
    belege: b.length,
    schluessel: k.length,
    sitzungen: s.length,
    anbieter: p.length,
  };
}

describe("Einrichtungs-Code", () => {
  it("falscher Code: 401, nichts angelegt, Versuch gezählt; der sechste wird gesperrt (429)", async () => {
    const u = await bereit();
    const h = handler(u);
    for (let i = 0; i < 5; i += 1) {
      const r = await anfrage(u, h.abschluss, "POST", "/api/einrichtung", {
        dose: vorabDose(),
        koerper: eingabe({ setupCode: "AAAA-BBBB-CCCC" }),
      });
      expect(r.status).toBe(401);
      expect(r.body.fehler?.code).toBe("einrichtungs_code_falsch");
    }
    const r6 = await anfrage(u, h.abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe(),
    });
    expect(r6.status).toBe(429);
    expect(Number(r6.antwort.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await zaehlen(u)).toEqual({
      owner: 0,
      belege: 0,
      schluessel: 0,
      sitzungen: 0,
      anbieter: 0,
    });
    // Eine andere Adresse ist nicht betroffen.
    const anders = await anfrage(u, h.abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      adresse: "198.51.100.9",
      koerper: eingabe(),
    });
    expect(anders.status).toBe(200);
  });

  it("ein abgelaufener (neu erzeugter) Code gilt nicht mehr", async () => {
    const u = await bereit();
    u.neuerCode("ZZZZ-YYYY-XXXX");
    const r = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe(),
    });
    expect(r.status).toBe(401);
    expect(r.body.fehler?.code).toBe("einrichtungs_code_falsch");
  });

  it("ohne erzeugten Code gilt keiner", async () => {
    const u = await testUmgebung();
    const r = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe(),
    });
    expect(r.status).toBe(401);
  });

  it("der Zustand erzeugt einen Code, falls keiner da ist, und schreibt ihn einmal ins Log", async () => {
    const u = await testUmgebung();
    const r = await anfrage(u, handler(u).status, "GET", "/api/einrichtung", { dose: vorabDose() });
    expect(r.status).toBe(200);
    expect(r.body.daten).toMatchObject({
      offen: true,
      schleuseInstalliert: false,
      passwortMin: 12,
    });
    await anfrage(u, handler(u).status, "GET", "/api/einrichtung", { dose: vorabDose() });
    expect(u.log.filter((z) => z.startsWith("Einrichtungs-Code:"))).toEqual([
      `Einrichtungs-Code: ${TEST_CODE} (gilt bis zum Ende der Einrichtung)`,
    ]);
  });
});

describe("Verbindungstest der Einrichtung", () => {
  it("nur mit gültigem Code; falscher Code zählt auf das Limit der Einrichtung", async () => {
    const u = await bereit();
    const h = handler(u);
    const falsch = await anfrage(u, h.test, "POST", "/api/einrichtung/verbindungstest", {
      dose: vorabDose(),
      koerper: { setupCode: "AAAA-BBBB-CCCC", apiKey: TEST_SCHLUESSEL },
    });
    expect(falsch.status).toBe(401);
    expect(u.anbieterAufrufe).toEqual([]);
    const zaehler = await repo.rateLimit.peek(u.db, {
      key: "einrichtung:ip:203.0.113.7",
      max: 5,
      windowSeconds: 900,
      now: u.zeit(),
    });
    expect(zaehler.count).toBe(1);
    const gut = await anfrage(u, h.test, "POST", "/api/einrichtung/verbindungstest", {
      dose: vorabDose(),
      koerper: { setupCode: TEST_CODE, apiKey: TEST_SCHLUESSEL },
    });
    expect(gut.status).toBe(200);
    expect(gut.body.daten).toEqual({ modelle: expect.any(Array) });
  });

  it("nimmt keinen gespeicherten Anbieter an (providerId ist ungültig)", async () => {
    const u = await bereit();
    const r = await anfrage(u, handler(u).test, "POST", "/api/einrichtung/verbindungstest", {
      dose: vorabDose(),
      koerper: { setupCode: TEST_CODE, providerId: "anb_06f8k2m9qz3w7x1c4b5n8p0r2t" },
    });
    expect(r.status).toBe(400);
    expect(u.anbieterAufrufe).toEqual([]);
  });

  it("Limit je Adresse: nach 10 Tests in 15 Minuten gesperrt", async () => {
    const u = await bereit();
    const h = handler(u);
    for (let i = 0; i < 10; i += 1) {
      const r = await anfrage(u, h.test, "POST", "/api/einrichtung/verbindungstest", {
        dose: vorabDose(),
        koerper: { setupCode: TEST_CODE, apiKey: TEST_SCHLUESSEL },
      });
      expect(r.status).toBe(200);
    }
    const r = await anfrage(u, h.test, "POST", "/api/einrichtung/verbindungstest", {
      dose: vorabDose(),
      koerper: { setupCode: TEST_CODE, apiKey: TEST_SCHLUESSEL },
    });
    expect(r.status).toBe(429);
  });
});

describe("Abschluss der Einrichtung", () => {
  it("legt alles in einer Transaktion an; Kette beginnt mit dem Start-Beleg und ist gültig", async () => {
    const u = await bereit();
    const dose = vorabDose();
    const r = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
      dose,
      koerper: eingabe(),
    });
    expect(r.status).toBe(200);
    expect(r.body.daten).toMatchObject({
      botName: "Pai",
      anbieter: true,
      modell: "Beispiel-Modell A",
    });

    // Sitzungs-Cookie: HttpOnly, SameSite=Lax, Path=/, ohne Max-Age (http: ohne Secure); Vorab gelöscht.
    const zeile = dose.zeilen.find((z) => z.startsWith("pb_sitzung="));
    expect(zeile).toMatch(/^pb_sitzung=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax$/);
    expect(dose.werte.has("pb_vorab")).toBe(false);
    const token = dose.werte.get("pb_sitzung") ?? "";
    const [sitzung] = await u.db.select().from(sessions);
    expect(sitzung?.id).toBe(hashToken(token));
    expect(sitzung?.id).not.toContain(token);

    const einstellungen = await repo.settings.get(u.db);
    expect(einstellungen?.setupCompletedAt).toBeDefined();
    expect(einstellungen?.schleuseModeDefault).toBe("off");
    const bot = await repo.bots.getDefault(u.db);
    expect(bot?.name).toBe("Pai");
    expect(bot?.modelId).toBeDefined();

    // Anbieter-Schlüssel als v2, gebunden an Anbieter und Basis-URL.
    const [anbieter] = await u.db.select().from(providers);
    expect(anbieter?.apiKeyEnc?.startsWith("v2:")).toBe(true);
    const aad = secretAad(
      providerSecretBinding(anbieter?.id as ProviderId, anbieter?.baseUrl ?? ""),
    );
    expect(decryptSecret(anbieter?.apiKeyEnc ?? "", u.schluessel.geheimnisse, { aad })).toBe(
      TEST_SCHLUESSEL,
    );
    const [schluessel] = await u.db.select().from(installationKeys);
    expect(schluessel?.privateKeyEnc.startsWith("v2:")).toBe(true);

    const eintraege = await repo.belege.listFrom(u.db);
    expect(eintraege[0]?.body.type).toBe("start");
    expect(
      eintraege.map((e) => ("action" in e.body ? e.body.action.type : undefined)).filter(Boolean),
    ).toEqual([
      "einrichtung.abschliessen",
      "einrichtung.abschliessen",
      "bot.aendern",
      "bot.aendern",
      "anbieter.speichern",
      "anbieter.speichern",
      "modell.waehlen",
      "modell.waehlen",
    ]);
    const bericht = await verifyChain(eintraege);
    expect(bericht.ok).toBe(true);
    expect(JSON.stringify(eintraege)).not.toContain(TEST_SCHLUESSEL);
    expect(JSON.stringify(eintraege)).not.toContain(TEST_PASSWORT);
  });

  it("danach: Code ungültig, Einrichtungs-Routen antworten mit 409", async () => {
    const u = await bereit();
    const h = handler(u);
    await anfrage(u, h.abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe(),
    });
    expect(await u.dienste.code.aktiv(u.db)).toBe(false);
    const zweiter = await anfrage(u, h.abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe(),
    });
    expect(zweiter.status).toBe(409);
    expect(zweiter.body.fehler?.code).toBe("einrichtung_fertig");
    const test = await anfrage(u, h.test, "POST", "/api/einrichtung/verbindungstest", {
      dose: vorabDose(),
      koerper: { setupCode: TEST_CODE, apiKey: TEST_SCHLUESSEL },
    });
    expect(test.status).toBe(409);
    expect(u.anbieterAufrufe).toEqual([TEST_SCHLUESSEL]);
    const status = await anfrage(u, h.status, "GET", "/api/einrichtung", { dose: vorabDose() });
    expect(status.body.daten).toMatchObject({ offen: false });
  });

  it.each<EinrichtungsSchritt>(["besitzer", "bot", "anbieter", "modell"])(
    "Abbruch im Schritt %s hinterlässt nichts, der Code bleibt gültig",
    async (schritt) => {
      const u = await bereit();
      const r = await anfrage(
        u,
        handler(u, { stoerung: schritt }).abschluss,
        "POST",
        "/api/einrichtung",
        {
          dose: vorabDose(),
          koerper: eingabe(),
        },
      );
      expect(r.status).toBe(500);
      expect(await zaehlen(u)).toEqual({
        owner: 0,
        belege: 0,
        schluessel: 0,
        sitzungen: 0,
        anbieter: 0,
      });
      expect(await repo.settings.isSetupComplete(u.db)).toBe(false);
      expect(await u.dienste.code.aktiv(u.db)).toBe(true);
      const danach = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
        dose: vorabDose(),
        koerper: eingabe(),
      });
      expect(danach.status).toBe(200);
    },
  );

  it("Abbruch im Schritt Datenschleuse hinterlässt nichts", async () => {
    const u = await bereit({ schleuseInstalliert: true });
    const r = await anfrage(
      u,
      handler(u, { stoerung: "schleuse" }).abschluss,
      "POST",
      "/api/einrichtung",
      {
        dose: vorabDose(),
        koerper: eingabe({ schleuseModeDefault: "on" }),
      },
    );
    expect(r.status).toBe(500);
    expect((await zaehlen(u)).belege).toBe(0);
  });

  it("Datenschleuse „An“ nur, wenn sie eingerichtet ist", async () => {
    const ohne = await bereit();
    const r = await anfrage(ohne, handler(ohne).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe({ schleuseModeDefault: "on" }),
    });
    expect(r.status).toBe(409);
    expect(r.body.fehler?.code).toBe("schleuse_nicht_installiert");
    const mit = await bereit({ schleuseInstalliert: true });
    const ok = await anfrage(mit, handler(mit).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe({ schleuseModeDefault: "on" }),
    });
    expect(ok.status).toBe(200);
    expect((await repo.settings.get(mit.db))?.schleuseModeDefault).toBe("on");
  });

  it("ohne Schlüssel: kein Anbieter, kein Modell; Modell ohne Schlüssel ist ungültig", async () => {
    const u = await bereit();
    const ungueltig = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe({ apiKey: undefined }),
    });
    expect(ungueltig.status).toBe(400);
    const r = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe({ apiKey: undefined, modelSlug: undefined }),
    });
    expect(r.status).toBe(200);
    expect((await zaehlen(u)).anbieter).toBe(0);
  });

  it("Passwort-Regeln: zu kurz und ungleich werden abgelehnt", async () => {
    const u = await bereit();
    const kurz = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe({ password: "kurz", passwordRepeat: "kurz" }),
    });
    expect(kurz.status).toBe(400);
    const ungleich = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe({ passwordRepeat: `${TEST_PASSWORT}x` }),
    });
    expect(ungleich.status).toBe(400);
    expect(JSON.stringify(ungleich.body)).toContain("passwordRepeat");
  });

  it("ein unbekanntes Modell wird abgelehnt, falscher Schlüssel ebenso", async () => {
    const u = await bereit();
    const modell = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe({ modelSlug: "gibt/es-nicht" }),
    });
    expect(modell.status).toBe(400);
    const schluessel = await anfrage(u, handler(u).abschluss, "POST", "/api/einrichtung", {
      dose: vorabDose(),
      koerper: eingabe({ apiKey: "falsch" }),
    });
    expect(schluessel.body.fehler?.code).toBe("schluessel_ungueltig");
    expect((await zaehlen(u)).owner).toBe(0);
  });
});
