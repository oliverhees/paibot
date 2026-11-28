/**
 * PaiBot – Tests des Lesens für die Seite „Team aus Vorlage“: die Vorlagen kommen aus dem Image,
 * die Entwürfe mit dem Stand, mit dem auch das Anlegen rechnet (der Verfall wirkt mit), und der
 * Not-Aus steht als Angabe darin.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type Database, repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { describe, expect, it, vi } from "vitest";
import { entwurfSeite } from "./seite";
import { ENTWURF_FORMAT_FASSUNG } from "./verwaltung";
import { ladeVorlage } from "./vorlagen";

vi.setConfig({ testTimeout: 120_000 });

const TAG = 24 * 60 * 60 * 1000;

/** Legt die Vorlage „Content-Team“ aus dem Image als offenen Entwurf ab. */
async function mitEntwurf(db: Database, gilt_bis?: Date) {
  const vorlage = await ladeVorlage("content-team");
  if (vorlage === undefined) throw new Error("Vorlage content-team fehlt im Image");
  return repo.entwuerfe.create(db, {
    origin: "vorlage",
    source: vorlage.quelle,
    title: vorlage.titel,
    content: vorlage.entwurf,
    digest: vorlage.abdruck,
    formatVersion: ENTWURF_FORMAT_FASSUNG,
    ...(gilt_bis === undefined ? {} : { validUntil: gilt_bis }),
  });
}

describe("entwurfSeite", () => {
  it("zeigt die Vorlagen aus dem Image, auch ohne einen einzigen Entwurf", async () => {
    const { db } = await createTestDb();
    const daten = await entwurfSeite(db);
    expect(daten.entwuerfe).toEqual([]);
    expect(daten.notAus).toBe(false);
    const kennungen = daten.vorlagen.map((v) => v.kennung);
    expect(kennungen).toContain("content-team");
    const content = daten.vorlagen.find((v) => v.kennung === "content-team");
    // Die Vorschau braucht den vollen Wortlaut je Bot, nicht nur den Namen.
    expect(content?.vorlage.bots.length).toBeGreaterThan(0);
    for (const b of content?.vorlage.bots ?? []) expect(b.anweisung.length).toBeGreaterThan(0);
    expect(content?.vorlage.team.leitung.name).toBe("Redaktion");
  });

  it("ein offener Entwurf kommt mit Stand, Abdruck und dem ganzen Inhalt", async () => {
    const { db } = await createTestDb();
    const entwurf = await mitEntwurf(db, new Date(Date.now() + 7 * TAG));
    const [eintrag, ...weitere] = (await entwurfSeite(db)).entwuerfe;
    expect(weitere).toEqual([]);
    expect(eintrag?.id).toBe(entwurf.id);
    expect(eintrag?.stand).toBe("offen");
    expect(eintrag?.abdruck).toBe(entwurf.digest);
    // Der Inhalt geht Feld für Feld durch, damit die Vorschau nichts verliert, was sie nicht zeigt.
    expect(eintrag?.inhalt.bots.length).toBe(eintrag?.vorlage.bots.length);
    expect(eintrag?.rueckgaengig).toBeUndefined();
  });

  it("ein Entwurf, dessen Frist um ist, steht nicht mehr als offen da", async () => {
    const { db } = await createTestDb();
    const entwurf = await mitEntwurf(db, new Date(Date.now() - 1));
    const daten = await entwurfSeite(db);
    expect(daten.entwuerfe[0]?.stand).toBe("verworfen");
    // Der Verfall ist festgeschrieben, nicht nur anders angezeigt.
    expect((await repo.entwuerfe.get(db, entwurf.id))?.status).toBe("verfallen");
  });

  it("Gegenprobe: innerhalb der Frist bleibt derselbe Entwurf offen", async () => {
    const { db } = await createTestDb();
    const entwurf = await mitEntwurf(db, new Date(Date.now() + 7 * TAG));
    // Dieselbe Zeile, nur zu einem Zeitpunkt vor und nach der Frist gelesen.
    expect((await entwurfSeite(db, new Date(Date.now() + 6 * TAG))).entwuerfe[0]?.stand).toBe(
      "offen",
    );
    expect((await entwurfSeite(db, new Date(Date.now() + 8 * TAG))).entwuerfe[0]?.stand).toBe(
      "verworfen",
    );
    expect((await repo.entwuerfe.get(db, entwurf.id))?.status).toBe("verfallen");
  });

  it("der Not-Aus steht in den Daten der Seite", async () => {
    const { db } = await createTestDb();
    await mitEntwurf(db);
    expect((await entwurfSeite(db)).notAus).toBe(false);
    await repo.settings.update(db, { killSwitch: true });
    expect((await entwurfSeite(db)).notAus).toBe(true);
  });

  it("ein verworfener Entwurf bleibt lesbar, und der Verfall rührt ihn nicht an", async () => {
    const { db } = await createTestDb();
    const entwurf = await mitEntwurf(db, new Date(Date.now() - 1));
    await repo.entwuerfe.verwerfen(db, entwurf.id);
    expect((await entwurfSeite(db)).entwuerfe[0]?.stand).toBe("verworfen");
    expect((await repo.entwuerfe.get(db, entwurf.id))?.status).toBe("verworfen");
  });
});
