/**
 * PaiBot – Tests des Zugangs beim Start: Einrichtungs-Code genau einmal ins Log, Hinweis ohne
 * TRUST_PROXY; Sitzungsprüfung für den Ereignis-Strom.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { repo } from "@paibot/db";
import { t } from "@paibot/shared/texte";
import { describe, expect, it, vi } from "vitest";
import { sitzungFuerStrom } from "./ereignis-strom";
import { sitzungAnlegen } from "./sitzung";
import { zugangBeimStart } from "./start";
import { TEST_ORIGIN, testUmgebung } from "./testing";

// Passwort-Rechnungen (scrypt) und Migrationen brauchen unter Last länger als die Standard-Zeit.
vi.setConfig({ testTimeout: 60_000 });

describe("Zugang beim Start", () => {
  it("vor der Einrichtung: genau eine Log-Zeile mit dem Code; ohne TRUST_PROXY ein Hinweis", async () => {
    const u = await testUmgebung({ hinterProxy: false });
    await zugangBeimStart(u.dienste);
    await zugangBeimStart(u.dienste);
    expect(u.log.filter((z) => z.startsWith("Einrichtungs-Code: "))).toHaveLength(1);
    expect(u.log).toContain(t("zugang.ohne_proxy"));
    expect(await u.dienste.code.aktiv(u.db)).toBe(true);
  });

  it("Neustart vor der Einrichtung: kein neuer Code, nur ein Hinweis; der alte gilt weiter", async () => {
    const u = await testUmgebung();
    await zugangBeimStart(u.dienste);
    const zeile = u.log.find((z) => z.startsWith("Einrichtungs-Code: "));
    const code = zeile?.slice("Einrichtungs-Code: ".length, "Einrichtungs-Code: ".length + 14);
    if (code === undefined) throw new Error("kein Code im Log");
    // Neuer Prozess: eigene Dienste, eigener Code-Halter, dieselbe Datenbank.
    const neustart = await testUmgebung({ db: u.db });
    await zugangBeimStart(neustart.dienste);
    expect(neustart.log.some((z) => z.startsWith("Einrichtungs-Code: "))).toBe(false);
    expect(neustart.log).toContain(
      t("einrichtung.code.vorhanden", { zeit: u.zeit().toISOString() }),
    );
    expect(await neustart.dienste.code.pruefen(u.db, code, u.zeit())).toBe(true);
  });

  it("nach der Einrichtung: kein Code", async () => {
    const u = await testUmgebung();
    await repo.settings.completeSetup(u.db, {
      installationId: "ins_06f8k2m9qz3w7x1c4b5n8p0r2t" as never,
    });
    await zugangBeimStart(u.dienste);
    expect(u.log.some((z) => z.startsWith("Einrichtungs-Code"))).toBe(false);
    expect(await u.dienste.code.aktiv(u.db)).toBe(false);
  });
});

describe("Sitzung für den Ereignis-Strom", () => {
  it("liefert die Kennung der Sitzung; ohne oder mit beendeter Sitzung 401", async () => {
    const u = await testUmgebung();
    const besitzer = await repo.owner.create(u.db, { passwordHash: "x" });
    const neu = await sitzungAnlegen(u.db, besitzer.id, { now: u.zeit() });
    const mit = new Request(`${TEST_ORIGIN}/api/x`, {
      headers: { cookie: `pb_sitzung=${neu.token}` },
    });
    expect(await sitzungFuerStrom(mit, u.dienste)).toEqual({ ok: true, sitzung: neu.sitzung.id });
    expect(await sitzungFuerStrom(new Request(`${TEST_ORIGIN}/api/x`), u.dienste)).toEqual({
      ok: false,
      status: 401,
    });
    await repo.sessions.end(u.db, neu.sitzung.id);
    expect(await sitzungFuerStrom(mit, u.dienste)).toEqual({ ok: false, status: 401 });
  });
});
