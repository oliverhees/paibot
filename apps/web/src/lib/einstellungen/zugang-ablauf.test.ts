/**
 * PaiBot – Abläufe des Reiters „Zugang“ gegen die vorhandenen Routen des Zugangs: Passwort ändern
 * (falsches aktuelles Passwort, danach sind alle anderen Sitzungen weg), Sitzungsliste mit grober
 * Geräte-Angabe, alle Sitzungen beenden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { describe, expect, it, vi } from "vitest";
import { alleAbmelden, anmelden, passwortAendern, sitzungenListe } from "../zugang/anmeldung";
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
import { grobesGeraet } from "./anzeige";
import type { SitzungZeile } from "./typen";

vi.setConfig({ testTimeout: 60_000 });

const NEU = "Zebra-Wolke-Laterne-77";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

async function eingerichtet() {
  const u = await testUmgebung();
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
  const h = {
    anmelden: u.handler("anmelden", async (k) => ({ daten: await anmelden(k) })),
    passwort: u.handler("passwortAendern", async (k) => ({ daten: await passwortAendern(k) })),
    sitzungen: u.handler("sitzungen", async (k) => ({ daten: await sitzungenListe(k) })),
    alle: u.handler("alleAbmelden", async (k) => ({ daten: await alleAbmelden(k) })),
  };
  return { u, h };
}

async function einloggen(
  u: TestUmgebung,
  h: Awaited<ReturnType<typeof eingerichtet>>["h"],
  passwort = TEST_PASSWORT,
  geraet?: string,
): Promise<{ status: number; dose: Keksdose }> {
  const dose = vorabDose();
  const r = await anfrage(u, h.anmelden, "POST", "/api/zugang/anmelden", {
    dose,
    koerper: { password: passwort, remember: false },
    ...(geraet ? { kopf: { "user-agent": geraet } } : {}),
  });
  return { status: r.status, dose };
}

async function liste(
  u: TestUmgebung,
  h: Awaited<ReturnType<typeof eingerichtet>>["h"],
  dose: Keksdose,
) {
  const r = await anfrage(u, h.sitzungen, "GET", "/api/zugang/sitzungen", { dose });
  return {
    status: r.status,
    sitzungen: (r.body.daten as { sitzungen?: SitzungZeile[] })?.sitzungen,
  };
}

describe("Passwort ändern", () => {
  it("falsches aktuelles Passwort: abgelehnt, Passwort und Sitzungen bleiben", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h);
    const b = await einloggen(u, h);
    const r = await anfrage(u, h.passwort, "POST", "/api/zugang/passwort", {
      dose: a.dose,
      koerper: { currentPassword: "ganz-falsch-1234", newPassword: NEU },
    });
    expect(r.body.ok).toBe(false);
    expect(r.body.fehler?.code).toBe("passwort_falsch");
    expect((await liste(u, h, b.dose)).status).toBe(200);
    expect((await einloggen(u, h, NEU)).status).toBe(401);
    expect((await einloggen(u, h)).status).toBe(200);
  });

  it("zu kurzes neues Passwort: 400 mit Feld newPassword", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h);
    const r = await anfrage(u, h.passwort, "POST", "/api/zugang/passwort", {
      dose: a.dose,
      koerper: { currentPassword: TEST_PASSWORT, newPassword: "kurz" },
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain("newPassword");
  });

  it("Erfolg: alle anderen Sitzungen sind weg, nur noch die neue dieses Geräts; neues Passwort gilt", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h);
    const b = await einloggen(u, h);
    const r = await anfrage(u, h.passwort, "POST", "/api/zugang/passwort", {
      dose: a.dose,
      koerper: { currentPassword: TEST_PASSWORT, newPassword: NEU },
    });
    expect(r.status).toBe(200);
    expect((await liste(u, h, b.dose)).status).toBe(401);
    const eigene = await liste(u, h, a.dose);
    expect(eigene.status).toBe(200);
    expect(eigene.sitzungen).toHaveLength(1);
    expect(eigene.sitzungen?.[0]?.aktuell).toBe(true);
    expect((await einloggen(u, h)).status).toBe(401);
    expect((await einloggen(u, h, NEU)).status).toBe(200);
  });
});

describe("Sitzungen", () => {
  it("Liste markiert dieses Gerät, Geräte-Angabe nur grob, keine Kennung und keine Adresse", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h, TEST_PASSWORT, FIREFOX);
    await einloggen(u, h);
    const { sitzungen } = await liste(u, h, a.dose);
    expect(sitzungen?.length).toBeGreaterThanOrEqual(2);
    const diese = sitzungen?.filter((s) => s.aktuell) ?? [];
    expect(diese).toHaveLength(1);
    expect(grobesGeraet(diese[0]?.geraet)).toBe("Firefox auf Linux");
    for (const s of sitzungen ?? []) {
      expect(Object.keys(s).sort()).toEqual(
        expect.arrayContaining(["aktuell", "angelegt", "endet", "zuletzt"]),
      );
      expect(JSON.stringify(s)).not.toMatch(/203\.0\.113|"id"|token/i);
    }
  });

  it("alle Sitzungen beenden: auch die zweite Sitzung ist draußen", async () => {
    const { u, h } = await eingerichtet();
    const a = await einloggen(u, h);
    const b = await einloggen(u, h);
    const r = await anfrage(u, h.alle, "POST", "/api/zugang/alle-abmelden", { dose: a.dose });
    expect(r.status).toBe(200);
    expect((await liste(u, h, b.dose)).status).toBe(401);
    expect((await liste(u, h, a.dose)).status).toBe(401);
    const owner = await repo.owner.get(u.db);
    expect(await repo.sessions.list(u.db, owner?.id as never, { now: u.zeit() })).toHaveLength(0);
  });
});
