/**
 * PaiBot – Tests der Zugriffsfunktionen für Team-Entwürfe: anlegen und zählen, Verfall, Anwenden
 * als eine Transaktion (mit Gegenproben: Fehler mitten drin lässt keine Zeile übrig),
 * „alles unbenutzt und unverändert“ und Zurücknehmen als Ganzes.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import {
  type ActionId,
  type EntwurfId,
  isPaiBotError,
  newId,
  type Sha256Digest,
} from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { conversations as unterhaltungenTabelle } from "../schema";
import { createTestDb } from "../testing";
import { bots, entwuerfe, messages, teams } from "./index";

const ABDRUCK = `sha256:${"a".repeat(64)}` as Sha256Digest;
const AKTION = newId("action") as ActionId;

const INHALT = { format: "pb-teamentwurf/v2", titel: "Content-Team" };

async function offenerEntwurf(db: Database, gueltigBis?: Date): Promise<EntwurfId> {
  const entwurf = await entwuerfe.create(db, {
    origin: "vorlage",
    source: "content-team@1",
    title: "Content-Team",
    content: INHALT,
    digest: ABDRUCK,
    formatVersion: 2,
    ...(gueltigBis === undefined ? {} : { validUntil: gueltigBis }),
  });
  return entwurf.id;
}

const DREI_BOTS: entwuerfe.EntwurfBotAnlage[] = [
  {
    name: "Redaktion",
    role: "Leitung",
    instructions: "Du leitest.",
    avatarShape: "wabe" as const,
    color: "pink" as const,
    maxOutputTokens: 2048,
    leitung: true,
  },
  {
    name: "Ideen",
    role: "Sammelt Themen",
    instructions: "Du sammelst.",
    avatarShape: "bluete" as const,
    color: "gelb" as const,
    maxOutputTokens: 2048,
  },
  {
    name: "Lektorat",
    role: "Prüft Texte",
    instructions: "Du prüfst.",
    avatarShape: "raute" as const,
    color: "gruen" as const,
    maxOutputTokens: 4096,
  },
];

function anwendenEingabe(entwurfId: EntwurfId, botListe = DREI_BOTS) {
  return {
    entwurfId,
    actionId: AKTION,
    team: {
      name: "Content",
      collaboration: "leitung_fuehrt" as const,
      acceptanceDefault: "leitung" as const,
    },
    bots: botListe,
    maxBots: 50,
  };
}

describe("Team-Entwürfe: anlegen, lesen, zählen", () => {
  let db: Database;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  it("legt einen Entwurf offen an und liest ihn wieder", async () => {
    const id = await offenerEntwurf(db);
    const gelesen = await entwuerfe.get(db, id);
    expect(gelesen).toMatchObject({
      id,
      status: "offen",
      origin: "vorlage",
      source: "content-team@1",
      digest: ABDRUCK,
      formatVersion: 2,
    });
    expect(gelesen?.content).toEqual(INHALT);
  });

  it("zählt offene Entwürfe und Entwürfe seit einem Zeitpunkt", async () => {
    const eins = await offenerEntwurf(db);
    await offenerEntwurf(db);
    expect(await entwuerfe.zaehleOffen(db)).toBe(2);
    await entwuerfe.verwerfen(db, eins);
    expect(await entwuerfe.zaehleOffen(db)).toBe(1);
    expect(await entwuerfe.zaehleSeit(db, new Date(Date.now() - 60_000))).toBe(2);
    expect(await entwuerfe.zaehleSeit(db, new Date(Date.now() + 60_000))).toBe(0);
  });

  it("lässt einen Entwurf nach seiner Frist verfallen, der Inhalt bleibt lesbar", async () => {
    const id = await offenerEntwurf(db, new Date(Date.now() - 1000));
    const nachher = await entwuerfe.mitVerfall(db, id);
    expect(nachher?.status).toBe("verfallen");
    expect(nachher?.content).toEqual(INHALT);
  });

  it("lässt einen Entwurf innerhalb seiner Frist offen", async () => {
    const id = await offenerEntwurf(db, new Date(Date.now() + 7 * 86_400_000));
    expect((await entwuerfe.mitVerfall(db, id))?.status).toBe("offen");
  });
});

describe("Team-Entwürfe: anwenden", () => {
  let db: Database;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  it("legt Team, Bots und die Zeilen der Anlagen in einem Schritt an", async () => {
    const id = await offenerEntwurf(db);
    const ergebnis = await entwuerfe.anwenden(db, anwendenEingabe(id));

    expect(ergebnis.team).toMatchObject({
      name: "Content",
      collaboration: "leitung_fuehrt",
      acceptanceDefault: "leitung",
    });
    expect(ergebnis.bots.map((b) => b.name)).toEqual(["Redaktion", "Ideen", "Lektorat"]);
    expect(ergebnis.team.leadBotId).toBe(ergebnis.bots[0]?.id);
    for (const bot of ergebnis.bots) expect(bot.teamId).toBe(ergebnis.team.id);

    const liste = await entwuerfe.anlagen(db, id);
    expect(liste.filter((a) => a.objektArt === "bot")).toHaveLength(3);
    expect(liste.filter((a) => a.objektArt === "team")).toHaveLength(1);
    // Der Stand der Anlage ist der Stand des Objekts danach: so erkennt „Rückgängig“ Änderungen.
    const teamAnlage = liste.find((a) => a.objektArt === "team");
    expect(teamAnlage?.standBeiAnlage).toBe(ergebnis.team.updatedAt);

    const nachher = await entwuerfe.get(db, id);
    expect(nachher?.status).toBe("angelegt");
    expect(nachher?.createdActionId).toBe(AKTION);
    // Inhalt und Abdruck des Entwurfs bleiben, wie sie beim Erstellen waren: Der Entwurf ist der
    // Vorschlag, nicht das Ergebnis. Die App-Rolle darf sie auch nicht ändern
    // (`packages/db/src/rollen.ts`). Was wirklich entstand, steht in den Zeilen und im Beleg.
    expect(nachher?.digest).toBe(ABDRUCK);
    expect(nachher?.content).toEqual(INHALT);
  });

  it("legt die Bots mit Aufgabe, Anweisung, Aussehen und Ausgabegrenze an, ohne Pause", async () => {
    const id = await offenerEntwurf(db);
    const { bots: neu } = await entwuerfe.anwenden(db, anwendenEingabe(id));
    expect(neu[1]).toMatchObject({
      name: "Ideen",
      role: "Sammelt Themen",
      instructions: "Du sammelst.",
      avatarShape: "bluete",
      color: "gelb",
      maxOutputTokens: 2048,
      paused: false,
    });
  });

  it("lehnt einen Entwurf ab, der nicht offen ist, und ändert nichts", async () => {
    const id = await offenerEntwurf(db);
    await entwuerfe.verwerfen(db, id);
    await expect(entwuerfe.anwenden(db, anwendenEingabe(id))).rejects.toSatisfy(
      (f: unknown) => isPaiBotError(f) && f.code === "abgelehnt",
    );
    expect(await teams.list(db)).toHaveLength(0);
  });

  it("lässt bei einem Namen, den es schon gibt, keine Zeile übrig (eine Transaktion)", async () => {
    const id = await offenerEntwurf(db);
    await bots.create(db, { name: "Ideen", avatarShape: "blatt", color: "blau" });
    const vorherBots = (await bots.list(db)).length;

    await expect(entwuerfe.anwenden(db, anwendenEingabe(id))).rejects.toSatisfy(
      (f: unknown) => isPaiBotError(f) && f.code === "eingabe_ungueltig",
    );

    expect(await teams.list(db)).toHaveLength(0);
    expect(await bots.list(db)).toHaveLength(vorherBots);
    expect(await entwuerfe.zaehleAnlagen(db, id)).toBe(0);
    expect((await entwuerfe.get(db, id))?.status).toBe("offen");
  });

  it("lässt über der Grenze „Bots insgesamt“ keine Zeile übrig", async () => {
    const id = await offenerEntwurf(db);
    await expect(entwuerfe.anwenden(db, { ...anwendenEingabe(id), maxBots: 2 })).rejects.toSatisfy(
      (f: unknown) => isPaiBotError(f) && f.code === "limit_erreicht",
    );
    expect(await teams.list(db)).toHaveLength(0);
    expect(await bots.list(db)).toHaveLength(0);
    expect(await entwuerfe.zaehleAnlagen(db, id)).toBe(0);
  });

  it("lehnt einen Entwurf ohne Leitung ab und ändert nichts", async () => {
    const id = await offenerEntwurf(db);
    const ohneLeitung = DREI_BOTS.map((b) => ({ ...b, leitung: false }));
    await expect(entwuerfe.anwenden(db, anwendenEingabe(id, ohneLeitung))).rejects.toSatisfy(
      (f: unknown) => isPaiBotError(f) && f.code === "eingabe_ungueltig",
    );
    expect(await teams.list(db)).toHaveLength(0);
    expect(await bots.list(db)).toHaveLength(0);
  });
});

describe("Team-Entwürfe: zurücknehmen", () => {
  let db: Database;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  it("nimmt Team und Bots als Ganzes zurück; die Anlagen bleiben als Spur", async () => {
    const id = await offenerEntwurf(db);
    const ergebnis = await entwuerfe.anwenden(db, anwendenEingabe(id));
    expect(await entwuerfe.nutzung(db, id)).toEqual({ allUnused: true, allUnchanged: true });

    const zurueck = await entwuerfe.zuruecknehmen(db, id, AKTION);
    expect(zurueck.bots).toHaveLength(3);
    expect(zurueck.teams).toEqual([ergebnis.team.id]);
    expect(await bots.list(db)).toHaveLength(0);
    expect(await teams.list(db)).toHaveLength(0);
    expect(await entwuerfe.zaehleAnlagen(db, id)).toBe(4);
    const nachher = await entwuerfe.get(db, id);
    expect(nachher?.status).toBe("zurueckgenommen");
    expect(nachher?.revertedActionId).toBe(AKTION);
  });

  it("lehnt Rückgängig nach einer Nachricht an einen neuen Bot ab und entfernt nichts", async () => {
    const id = await offenerEntwurf(db);
    const ergebnis = await entwuerfe.anwenden(db, anwendenEingabe(id));
    const botId = ergebnis.bots[1]?.id;
    if (botId === undefined) throw new Error("kein Bot");
    const unterhaltung = newId("conversation");
    await db
      .insert(unterhaltungenTabelle)
      .values({ id: unterhaltung, kind: "direkt", botId, title: "Hallo" });
    await messages.insert(db, { conversationId: unterhaltung, role: "user", content: "Hallo" });

    expect(await entwuerfe.nutzung(db, id)).toMatchObject({ allUnused: false });
    await expect(entwuerfe.zuruecknehmen(db, id, AKTION)).rejects.toSatisfy(
      (f: unknown) => isPaiBotError(f) && f.code === "entwurf_benutzt",
    );
    expect(await bots.list(db)).toHaveLength(3);
    expect(await teams.list(db)).toHaveLength(1);
    expect((await entwuerfe.get(db, id))?.status).toBe("angelegt");
  });

  it("lehnt Rückgängig ab, wenn ein neuer Bot geändert wurde", async () => {
    const id = await offenerEntwurf(db);
    const ergebnis = await entwuerfe.anwenden(db, anwendenEingabe(id));
    const botId = ergebnis.bots[2]?.id;
    if (botId === undefined) throw new Error("kein Bot");
    await bots.update(db, botId, { instructions: "Anders." });

    expect(await entwuerfe.nutzung(db, id)).toMatchObject({ allUnchanged: false });
    await expect(entwuerfe.zuruecknehmen(db, id, AKTION)).rejects.toSatisfy(
      (f: unknown) => isPaiBotError(f) && f.code === "entwurf_benutzt",
    );
    expect(await bots.list(db)).toHaveLength(3);
  });

  it("lehnt Rückgängig ab, wenn ein neuer Bot schon gelöscht wurde", async () => {
    const id = await offenerEntwurf(db);
    const ergebnis = await entwuerfe.anwenden(db, anwendenEingabe(id));
    const botId = ergebnis.bots[1]?.id;
    if (botId === undefined) throw new Error("kein Bot");
    await bots.remove(db, botId);

    expect(await entwuerfe.nutzung(db, id)).toMatchObject({ allUnchanged: false });
    await expect(entwuerfe.zuruecknehmen(db, id, AKTION)).rejects.toSatisfy(
      (f: unknown) => isPaiBotError(f) && f.code === "entwurf_benutzt",
    );
  });

  it("lehnt Rückgängig bei einem Entwurf ohne Anlagen ab", async () => {
    const id = await offenerEntwurf(db);
    expect(await entwuerfe.nutzung(db, id)).toEqual({ allUnused: false, allUnchanged: false });
    await expect(entwuerfe.zuruecknehmen(db, id, AKTION)).rejects.toSatisfy(
      (f: unknown) => isPaiBotError(f) && f.code === "abgelehnt",
    );
  });
});
