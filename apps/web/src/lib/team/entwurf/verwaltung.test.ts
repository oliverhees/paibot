/**
 * PaiBot – Tests der Routen für Team-Entwürfe: Vorlage öffnen, Vorschau ändern und anlegen,
 * zurücknehmen. Geprüft werden die Vorbedingungen des Tors – der Abdruck bindet, der Not-Aus
 * sperrt das Anlegen, ein Entwurf mit abgelaufener Frist wird abgelehnt, ein Name wie ein Team
 * oder ein vergebener Name ebenso – und dass jede Ablehnung einen Beleg hat und nichts anlegt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { repo } from "@paibot/db";
import { verifyChain } from "@paibot/receipts";
import type { EntwurfId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import type { RoutenAktion } from "../../api/route";
import { API_ROUTEN, type RoutenName, type RoutenParameter, routenPfad } from "../../routen";
import { einrichtungAbschliessen } from "../../zugang/einrichtung";
import {
  type AnfrageOptionen,
  anfrage,
  type Keksdose,
  TEST_CODE,
  TEST_MODELLE,
  TEST_PASSWORT,
  TEST_SCHLUESSEL,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "../../zugang/testing";
import { entwurfAbdruck, pruefeEntwurf, type TeamEntwurf } from "./format";
import {
  ENTWURF_FORMAT_FASSUNG,
  teamEntwurfAnlegen,
  teamEntwurfErstellen,
  teamEntwurfLesen,
  teamEntwurfVerwerfen,
  teamEntwurfZuruecknehmen,
  teamVorlagenListe,
} from "./verwaltung";
import { ladeVorlage } from "./vorlagen";

vi.setConfig({ testTimeout: 180_000 });

interface Stand {
  u: TestUmgebung;
  dose: Keksdose;
}

/**
 * Eingerichtete Installation mit Anbieter, Schlüssel und Modell – wie `lib/modelle/testing.ts` es
 * tut. Der Schlüssel und `modelSlug` sind nötig, nicht nur Beigabe: Alle Bots der Vorlage tragen
 * „wie Pai“, und „wie Pai“ ist das Modell des Standard-Bots. Ohne Modell bei der Einrichtung bleibt
 * es leer, der Fakt „Modelle vorhanden“ wird falsch, und das Tor lehnt jedes Anlegen mit der
 * Vorbedingung „Modelle im Entwurf vorhanden“ ab.
 */
async function eingerichtet(): Promise<Stand> {
  const u = await testUmgebung();
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const dose = vorabDose();
  const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
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
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  return { u, dose };
}

function rufe<N extends RoutenName>(
  s: Stand,
  name: N,
  aktion: RoutenAktion<N>,
  optionen: AnfrageOptionen & { params?: RoutenParameter<N> } = {},
) {
  const params = (optionen.params ?? {}) as RoutenParameter<N>;
  const dose = "dose" in optionen ? optionen.dose : s.dose;
  return anfrage(
    s.u,
    s.u.handler(name, aktion),
    API_ROUTEN[name].methode,
    routenPfad(name, params),
    {
      ...optionen,
      ...(dose === undefined ? {} : { dose }),
      params: params as Record<string, string>,
    },
  );
}

const vorlagen = (s: Stand) => rufe(s, "teamVorlagenListe", teamVorlagenListe);
const erstellen = (s: Stand, koerper: unknown = { template: "content-team" }) =>
  rufe(s, "teamEntwurfErstellen", teamEntwurfErstellen, { koerper });
const lesen = (s: Stand, id: EntwurfId) =>
  rufe(s, "teamEntwurfLesen", teamEntwurfLesen, { params: { id } });
const verwerfen = (s: Stand, id: EntwurfId) =>
  rufe(s, "teamEntwurfVerwerfen", teamEntwurfVerwerfen, { params: { id } });
const anlegen = (s: Stand, id: EntwurfId, koerper: unknown) =>
  rufe(s, "teamEntwurfAnlegen", teamEntwurfAnlegen, { koerper, params: { id } });
const zurueck = (s: Stand, id: EntwurfId) =>
  rufe(s, "teamEntwurfZuruecknehmen", teamEntwurfZuruecknehmen, { params: { id } });

/** Ein offener Entwurf aus der Vorlage, mit Inhalt und Abdruck, wie die Vorschau sie sieht. */
async function offenerEntwurf(s: Stand) {
  const r = await erstellen(s);
  if (r.status !== 201) throw new Error(`Erstellen: ${r.status}`);
  const daten = r.body.daten as {
    entwurf: { id: EntwurfId; inhalt: TeamEntwurf; abdruck: string };
  };
  return daten.entwurf;
}

/**
 * Ein Entwurf aus derselben Vorlage, aber mit gesetzter Frist. Er entsteht ohne die Route: Die
 * Route setzt die Frist immer auf sieben Tage, und eine abgelaufene Frist lässt sich sonst nur
 * durch Warten erreichen.
 */
async function entwurfMitFrist(s: Stand, gilt_bis: Date) {
  const vorlage = await ladeVorlage("content-team");
  if (vorlage === undefined) throw new Error("Vorlage content-team fehlt im Image");
  const zeile = await repo.entwuerfe.create(s.u.db, {
    origin: "vorlage",
    source: vorlage.quelle,
    title: vorlage.titel,
    content: vorlage.entwurf,
    digest: vorlage.abdruck,
    formatVersion: ENTWURF_FORMAT_FASSUNG,
    validUntil: gilt_bis,
  });
  return { id: zeile.id, inhalt: vorlage.entwurf };
}

/** Prüft den Inhalt und rechnet den Abdruck – genau das, was die Vorschau vor dem Klick tut. */
async function mitAbdruck(inhalt: TeamEntwurf) {
  const geprueft = await pruefeEntwurf(inhalt);
  if (!geprueft.ok) throw new Error(`Inhalt ungültig: ${JSON.stringify(geprueft.fehler)}`);
  return { content: geprueft.entwurf, seenDigest: await entwurfAbdruck(geprueft.entwurf) };
}

const fehlerCode = (body: unknown) => (body as { fehler?: { code?: string } }).fehler?.code;

async function naechsteSeq(s: Stand): Promise<number> {
  return ((await repo.belege.head(s.u.db))?.seq ?? 0) + 1;
}

async function belegArten(s: Stand, abSeq: number): Promise<string[]> {
  const liste = await repo.belege.listFrom(s.u.db, { fromSeq: abSeq });
  return liste.map((e) =>
    e.body.type === "decision" || e.body.type === "result" ? e.body.action.type : e.body.type,
  );
}

/** Zählt, was nach einem Anlegen in der Datenbank steht. */
async function stand(s: Stand) {
  return {
    bots: await repo.bots.count(s.u.db),
    teams: (await repo.teams.list(s.u.db)).length,
  };
}

describe("Vorlagen und Entwürfe lesen", () => {
  it("ohne Sitzung 401, ohne Prüfzeichen 403, kein Entwurf angelegt", async () => {
    const s = await eingerichtet();
    expect((await erstellen(s, { template: "content-team" })).status).not.toBe(401);
    expect((await erstellen(s)).status).toBe(201);
    expect((await erstellen(s, { template: "content-team" })).status).toBe(201);
    const ohneDose = await rufe(s, "teamEntwurfErstellen", teamEntwurfErstellen, {
      koerper: { template: "content-team" },
      dose: undefined,
    });
    expect(ohneDose.status).toBe(401);
    expect(
      (
        await rufe(s, "teamEntwurfErstellen", teamEntwurfErstellen, {
          koerper: { template: "content-team" },
          pruefzeichen: null,
        })
      ).status,
    ).toBe(403);
  });

  it("die Vorlagen-Liste kommt aus dem Image, mit vollem Wortlaut je Bot", async () => {
    const s = await eingerichtet();
    const r = await vorlagen(s);
    expect(r.status).toBe(200);
    const liste = (r.body.daten as { vorlagen: { kennung: string; inhalt: TeamEntwurf }[] })
      .vorlagen;
    const content = liste.find((v) => v.kennung === "content-team");
    expect(content).toBeDefined();
    for (const b of content?.inhalt.bots ?? []) expect(b.anweisung.length).toBeGreaterThan(0);
  });

  it("eine unbekannte Vorlage ist 404, und nichts entsteht", async () => {
    const s = await eingerichtet();
    const r = await erstellen(s, { template: "gibt-es-nicht" });
    expect(r.status).toBe(404);
    expect((await repo.entwuerfe.list(s.u.db)).length).toBe(0);
  });

  it("eine Kennung, die aus dem Ordner führen will, kommt nicht durch", async () => {
    const s = await eingerichtet();
    for (const template of ["../content-team", "/etc/passwd", "Content-Team"]) {
      expect((await erstellen(s, { template })).status, template).toBeGreaterThanOrEqual(400);
    }
    expect((await repo.entwuerfe.list(s.u.db)).length).toBe(0);
  });

  it("erstellen gibt einen offenen Entwurf mit Frist, Quelle und Beleg", async () => {
    const s = await eingerichtet();
    const ab = await naechsteSeq(s);
    const entwurf = await offenerEntwurf(s);
    const zeile = await repo.entwuerfe.get(s.u.db, entwurf.id);
    expect(zeile?.status).toBe("offen");
    expect(zeile?.origin).toBe("vorlage");
    // Die Quelle nennt die Vorlage mit ihrer Fassung, damit der Vorschlag nachprüfbar bleibt.
    expect(zeile?.source).toMatch(/^content-team@[0-9a-f]{12}$/u);
    expect(zeile?.validUntil).toBeDefined();
    expect(await belegArten(s, ab)).toContain("team.entwurf_erstellen");
    expect((await lesen(s, entwurf.id)).status).toBe(200);
  });

  it("verwerfen schließt den Entwurf; ein zweites Mal wird abgelehnt", async () => {
    const s = await eingerichtet();
    const entwurf = await offenerEntwurf(s);
    expect((await verwerfen(s, entwurf.id)).status).toBe(200);
    expect((await repo.entwuerfe.get(s.u.db, entwurf.id))?.status).toBe("verworfen");
    const zweites = await verwerfen(s, entwurf.id);
    expect(zweites.status).toBeGreaterThanOrEqual(400);
    // Der Inhalt bleibt lesbar: Wer wissen will, was dastand, findet es noch.
    expect((await lesen(s, entwurf.id)).status).toBe(200);
  });
});

describe("Anlegen", () => {
  it("legt Team und alle Bots an, mit Beleg und prüfbarer Kette", async () => {
    const s = await eingerichtet();
    const vorher = await stand(s);
    const entwurf = await offenerEntwurf(s);
    const ab = await naechsteSeq(s);
    const r = await anlegen(s, entwurf.id, await mitAbdruck(entwurf.inhalt));
    expect(r.status).toBe(201);
    const nachher = await stand(s);
    expect(nachher.bots).toBe(vorher.bots + entwurf.inhalt.bots.length);
    expect(nachher.teams).toBe(vorher.teams + 1);
    expect((await repo.entwuerfe.get(s.u.db, entwurf.id))?.status).toBe("angelegt");
    expect(await belegArten(s, ab)).toContain("team.entwurf_anlegen");
    const kette = await verifyChain(await repo.belege.listFrom(s.u.db, { fromSeq: 1 }));
    expect(kette.ok).toBe(true);
  });

  it("die neuen Bots haben die Leitung, aber keine App und keine eigene Regel", async () => {
    const s = await eingerichtet();
    const regelStandVorher = await repo.rules.currentStand(s.u.db);
    const entwurf = await offenerEntwurf(s);
    await anlegen(s, entwurf.id, await mitAbdruck(entwurf.inhalt));
    const team = (await repo.teams.list(s.u.db)).find((x) => x.name === entwurf.inhalt.team.name);
    expect(team).toBeDefined();
    const mitglieder = (await repo.bots.list(s.u.db)).filter((b) => b.teamId === team?.id);
    expect(mitglieder.length).toBe(entwurf.inhalt.bots.length);
    const leitung = mitglieder.find((b) => b.id === team?.leadBotId);
    expect(leitung?.name).toBe(entwurf.inhalt.team.leitung.name);
    // Neue Bots bringen keine App mit: Es gibt keine einzige App, obwohl vier Bots entstanden sind.
    expect(await repo.apps.list(s.u.db)).toEqual([]);
    // Und keine eigene Regel: Der Regelstand ist derselbe wie vor dem Anlegen.
    expect(await repo.rules.currentStand(s.u.db)).toBe(regelStandVorher);
  });

  it("ein abgewählter Bot fehlt, ein geänderter Wortlaut steht in seiner Anweisung", async () => {
    const s = await eingerichtet();
    const entwurf = await offenerEntwurf(s);
    const weg = entwurf.inhalt.bots.at(-1)?.name;
    const geaendert = {
      ...entwurf.inhalt,
      bots: entwurf.inhalt.bots
        .filter((b) => b.name !== weg)
        .map((b, i) => (i === 1 ? { ...b, anweisung: "Mein eigener Wortlaut." } : b)),
    };
    const r = await anlegen(s, entwurf.id, await mitAbdruck(geaendert));
    expect(r.status).toBe(201);
    const namen = (await repo.bots.list(s.u.db)).map((b) => b.name);
    expect(namen).not.toContain(weg);
    expect(namen).toContain(geaendert.bots[1]?.name);
    const geaenderterBot = (await repo.bots.list(s.u.db)).find(
      (b) => b.name === geaendert.bots[1]?.name,
    );
    expect(geaenderterBot?.instructions).toBe("Mein eigener Wortlaut.");
  });

  it("ein anderer Abdruck als der gesehene wird abgelehnt und legt nichts an", async () => {
    const s = await eingerichtet();
    const vorher = await stand(s);
    const entwurf = await offenerEntwurf(s);
    const geprueft = await mitAbdruck(entwurf.inhalt);
    const r = await anlegen(s, entwurf.id, {
      ...geprueft,
      seenDigest: `sha256:${"00".repeat(32)}`,
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(fehlerCode(r.body)).toBe("entwurf_veraltet");
    expect(await stand(s)).toEqual(vorher);
    // Gegenprobe: derselbe Entwurf mit dem Abdruck, der zum Inhalt passt, geht durch.
    expect((await anlegen(s, entwurf.id, geprueft)).status).toBe(201);
  });

  it("der Not-Aus sperrt das Anlegen, nicht das Lesen und nicht das Verwerfen", async () => {
    const s = await eingerichtet();
    const entwurf = await offenerEntwurf(s);
    await repo.settings.update(s.u.db, { killSwitch: true });
    const vorher = await stand(s);
    const r = await anlegen(s, entwurf.id, await mitAbdruck(entwurf.inhalt));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await stand(s)).toEqual(vorher);
    expect((await lesen(s, entwurf.id)).status).toBe(200);
    expect((await verwerfen(s, entwurf.id)).status).toBe(200);
  });

  it("ein Entwurf, dessen Frist um ist, wird abgelehnt und auf verfallen gesetzt", async () => {
    const s = await eingerichtet();
    const alt = await entwurfMitFrist(s, new Date(Date.now() - 1));
    const geprueft = await mitAbdruck(alt.inhalt);
    const vorher = await stand(s);
    const r = await anlegen(s, alt.id, geprueft);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await stand(s)).toEqual(vorher);
    expect((await repo.entwuerfe.get(s.u.db, alt.id))?.status).toBe("verfallen");
  });

  it("Gegenprobe: dieselbe Vorlage mit Frist in der Zukunft wird angelegt", async () => {
    const s = await eingerichtet();
    const frisch = await entwurfMitFrist(s, new Date(Date.now() + 60_000));
    expect((await anlegen(s, frisch.id, await mitAbdruck(frisch.inhalt))).status).toBe(201);
  });

  it("ein Bot, der mit „Team “ beginnt, wird abgelehnt und legt nichts an", async () => {
    const s = await eingerichtet();
    const entwurf = await offenerEntwurf(s);
    const vorher = await stand(s);
    // Der Abdruck ist der des geänderten Inhalts – abgelehnt wird der Name, nicht die Fassung.
    const inhalt = {
      ...entwurf.inhalt,
      bots: entwurf.inhalt.bots.map((b, i) => (i === 1 ? { ...b, name: "Team Ideen" } : b)),
    };
    const r = await anlegen(s, entwurf.id, {
      content: inhalt,
      seenDigest: await entwurfAbdruck(inhalt as TeamEntwurf),
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await stand(s)).toEqual(vorher);
  });

  it("ein vergebener Team-Name wird vom Tor abgelehnt, nicht erst von der Transaktion", async () => {
    const s = await eingerichtet();
    const entwurf = await offenerEntwurf(s);
    await repo.teams.create(s.u.db, { name: entwurf.inhalt.team.name });
    const vorher = await stand(s);
    const r = await anlegen(s, entwurf.id, await mitAbdruck(entwurf.inhalt));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(fehlerCode(r.body)).toBe("entwurf_name_vergeben");
    expect(await stand(s)).toEqual(vorher);
    expect((await repo.entwuerfe.get(s.u.db, entwurf.id))?.status).toBe("offen");
  });

  it("ein vergebener Bot-Name wird abgelehnt und legt keinen der Bots an", async () => {
    const s = await eingerichtet();
    const entwurf = await offenerEntwurf(s);
    const erster = entwurf.inhalt.bots[0]?.name ?? "";
    await repo.bots.create(s.u.db, {
      name: erster,
      instructions: "Antworte kurz.",
      avatarShape: "kiesel",
      color: "limette",
    });
    const vorher = await stand(s);
    const r = await anlegen(s, entwurf.id, await mitAbdruck(entwurf.inhalt));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(fehlerCode(r.body)).toBe("entwurf_name_vergeben");
    expect(await stand(s)).toEqual(vorher);
  });

  it("ein Entwurf lässt sich nicht zweimal anlegen", async () => {
    const s = await eingerichtet();
    const entwurf = await offenerEntwurf(s);
    const geprueft = await mitAbdruck(entwurf.inhalt);
    expect((await anlegen(s, entwurf.id, geprueft)).status).toBe(201);
    const nach = await stand(s);
    const zweites = await anlegen(s, entwurf.id, geprueft);
    expect(zweites.status).toBeGreaterThanOrEqual(400);
    expect(await stand(s)).toEqual(nach);
  });
});

describe("Zurücknehmen", () => {
  /** Ein angelegtes Team aus der Vorlage. */
  async function angelegt(s: Stand) {
    const entwurf = await offenerEntwurf(s);
    const r = await anlegen(s, entwurf.id, await mitAbdruck(entwurf.inhalt));
    if (r.status !== 201) throw new Error(`Anlegen: ${r.status}`);
    return entwurf;
  }

  it("nimmt das Team als Ganzes zurück: kein Bot, kein Team, Beleg und Kette halten", async () => {
    const s = await eingerichtet();
    const vorher = await stand(s);
    const entwurf = await angelegt(s);
    const ab = await naechsteSeq(s);
    expect((await zurueck(s, entwurf.id)).status).toBe(200);
    expect(await stand(s)).toEqual(vorher);
    expect((await repo.entwuerfe.get(s.u.db, entwurf.id))?.status).toBe("zurueckgenommen");
    expect(await belegArten(s, ab)).toContain("team.entwurf_zuruecknehmen");
    const kette = await verifyChain(await repo.belege.listFrom(s.u.db, { fromSeq: 1 }));
    expect(kette.ok).toBe(true);
  });

  it("nach einer Nachricht an einen neuen Bot wird abgelehnt; alles bleibt stehen", async () => {
    const s = await eingerichtet();
    const entwurf = await angelegt(s);
    const nach = await stand(s);
    const team = (await repo.teams.list(s.u.db)).find((x) => x.name === entwurf.inhalt.team.name);
    const neuerBot = (await repo.bots.list(s.u.db)).find((b) => b.teamId === team?.id);
    if (neuerBot === undefined) throw new Error("kein neuer Bot");
    const unterhaltung = await repo.conversations.create(s.u.db, {
      botId: neuerBot.id,
      title: "Erste Frage",
    });
    await repo.messages.insert(s.u.db, {
      conversationId: unterhaltung.id,
      role: "user",
      content: "Hallo.",
    });
    const r = await zurueck(s, entwurf.id);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(fehlerCode(r.body)).toBe("entwurf_benutzt");
    expect(await stand(s)).toEqual(nach);
    expect((await repo.entwuerfe.get(s.u.db, entwurf.id))?.status).toBe("angelegt");
  });

  it("ein Entwurf, der nie angelegt wurde, lässt sich nicht zurücknehmen", async () => {
    const s = await eingerichtet();
    const entwurf = await offenerEntwurf(s);
    expect((await zurueck(s, entwurf.id)).status).toBeGreaterThanOrEqual(400);
  });

  it("zweimal zurücknehmen geht nicht", async () => {
    const s = await eingerichtet();
    const entwurf = await angelegt(s);
    expect((await zurueck(s, entwurf.id)).status).toBe(200);
    expect((await zurueck(s, entwurf.id)).status).toBeGreaterThanOrEqual(400);
  });
});
