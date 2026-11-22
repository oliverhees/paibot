/**
 * PaiBot – Tests der Chat-Routen über den Rahmen: Sitzung, Prüfzeichen, Eingaben, Tor und
 * Belege; Senden ganz oder gar nicht, zweites Senden bei aktivem Lauf, Stopp, Löschen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { conversations, repo, teams } from "@paibot/db";
import { verifyChain } from "@paibot/receipts";
import { newId, type RunId } from "@paibot/shared/ids";
import { LIMITS } from "@paibot/shared/konstanten";
import { describe, expect, it, vi } from "vitest";
import { type Einreihen, executorFuer } from "../warteschlange";
import { einrichtungAbschliessen } from "../zugang/einrichtung";
import {
  anfrage,
  Keksdose,
  TEST_CODE,
  TEST_PASSWORT,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "../zugang/testing";
import {
  FADEN_OHNE_LAUF_AUSWEG,
  FADEN_OHNE_LAUF_TEXT,
  laufAbbrechen,
  nachrichtenLesen,
  nachrichtSenden,
  unterhaltungAnlegen,
  unterhaltungenListe,
  unterhaltungLesen,
  unterhaltungLoeschen,
  unterhaltungSchleuse,
  unterhaltungUmbenennen,
} from "./aktionen";
import { ansichtAus, ereignisseAnwenden } from "./ansicht";
import { ladeVerlauf } from "./laden";
import type { ChatVerlauf } from "./typen";

vi.setConfig({ testTimeout: 60_000 });

interface Einreih extends Einreihen {
  jobs: { runId: string; conversationId: string }[];
  fehler?: Error;
}

function testEinreihen(): Einreih {
  const e: Einreih = {
    jobs: [],
    bereit: async () => undefined,
    lauf: async (job, tx) => {
      // Die Brücke läuft wirklich in der Transaktion (PGlite liefert `{ rows }`).
      const { rows } = await executorFuer(tx).executeSql("select $1::text as lauf", [job.runId]);
      expect(rows).toEqual([{ lauf: job.runId }]);
      if (e.fehler) throw e.fehler;
      e.jobs.push(job);
    },
  };
  return e;
}

async function eingerichtet(optionen: Parameters<typeof testUmgebung>[0] = {}) {
  const u = await testUmgebung(optionen);
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
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  const einreihen = testEinreihen();
  const h = {
    liste: u.handler("unterhaltungen", unterhaltungenListe),
    anlegen: u.handler("unterhaltungAnlegen", unterhaltungAnlegen),
    lesen: u.handler("unterhaltung", unterhaltungLesen),
    umbenennen: u.handler("unterhaltungUmbenennen", unterhaltungUmbenennen),
    loeschen: u.handler("unterhaltungLoeschen", unterhaltungLoeschen),
    schleuse: u.handler("unterhaltungSchleuse", unterhaltungSchleuse),
    nachrichten: u.handler("nachrichten", nachrichtenLesen),
    senden: u.handler("nachrichtSenden", nachrichtSenden(einreihen)),
    abbrechen: u.handler("laufAbbrechen", laufAbbrechen),
  };
  return { u, dose, h, einreihen };
}

type Umgebung = Awaited<ReturnType<typeof eingerichtet>>;

async function neueUnterhaltung({ u, dose, h }: Umgebung, titel?: string): Promise<string> {
  const r = await anfrage(u, h.anlegen, "POST", "/api/unterhaltungen", {
    dose,
    koerper: titel === undefined ? {} : { title: titel },
  });
  expect(r.status).toBe(201);
  return (r.body.daten as { unterhaltung: { id: string } }).unterhaltung.id;
}

async function senden(e: Umgebung, id: string, text = "Hallo Pai", schleuse = "off") {
  return anfrage(e.u, e.h.senden, "POST", `/api/unterhaltungen/${id}/nachrichten`, {
    dose: e.dose,
    params: { id },
    koerper: { text, schleuse },
  });
}

async function belegTypen(u: TestUmgebung, anzahl: number): Promise<string[]> {
  const seite = await repo.belege.listPage(u.db, { limit: anzahl });
  return seite.items
    .reverse()
    .map((b) => `${b.body.type}:${"action" in b.body ? b.body.action.type : ""}`);
}

async function ketteGueltig(u: TestUmgebung): Promise<boolean> {
  const belege = await repo.belege.listFrom(u.db);
  const ergebnis = await verifyChain(belege, {
    publicKeys: await repo.installationKeys.listPublic(u.db),
    rules: await repo.rules.listActive(u.db),
  } as never);
  return ergebnis.ok;
}

describe("Zugang zu den Chat-Routen", () => {
  it("ohne Sitzung 401, ohne Prüfzeichen 403, falsche Herkunft 403", async () => {
    const e = await eingerichtet();
    const fremd = new Keksdose();
    expect(
      (await anfrage(e.u, e.h.liste, "GET", "/api/unterhaltungen", { dose: fremd })).status,
    ).toBe(401);
    const ohne = await anfrage(e.u, e.h.anlegen, "POST", "/api/unterhaltungen", {
      dose: fremd,
      koerper: {},
    });
    expect(ohne.status).toBe(401);
    const id = await neueUnterhaltung(e);
    const r1 = await anfrage(e.u, e.h.senden, "POST", `/api/unterhaltungen/${id}/nachrichten`, {
      dose: e.dose,
      params: { id },
      koerper: { text: "Hallo", schleuse: "off" },
      pruefzeichen: null,
    });
    expect(r1.status).toBe(403);
    expect(r1.body.fehler?.code).toBe("pruefzeichen_fehlt");
    const r2 = await anfrage(e.u, e.h.abbrechen, "POST", "/x", {
      dose: e.dose,
      params: { id, laufId: newId("run") },
      origin: "http://fremd.test",
    });
    expect(r2.status).toBe(403);
    expect(r2.body.fehler?.code).toBe("herkunft_falsch");
    expect(await repo.messages.listForConversation(e.u.db, id as never)).toEqual([]);
  });
});

describe("Unterhaltungen", () => {
  it("anlegen mit Standard-Titel und eigenem Titel, Liste neueste zuerst, mit Belegen", async () => {
    const e = await eingerichtet();
    const a = await neueUnterhaltung(e);
    const b = await neueUnterhaltung(e, "Wochenplan sortieren");
    expect(await belegTypen(e.u, 2)).toEqual([
      "decision:unterhaltung.anlegen",
      "result:unterhaltung.anlegen",
    ]);
    const r = await anfrage(e.u, e.h.liste, "GET", "/api/unterhaltungen", { dose: e.dose });
    const liste = (r.body.daten as { unterhaltungen: { id: string; titel: string }[] })
      .unterhaltungen;
    expect(liste.map((x) => x.id)).toEqual([b, a]);
    expect(liste.map((x) => x.titel)).toEqual(["Wochenplan sortieren", "Neue Unterhaltung"]);
    // Nach einer Nachricht steht die ältere vorn.
    await senden(e, a);
    const r2 = await anfrage(e.u, e.h.liste, "GET", "/api/unterhaltungen", { dose: e.dose });
    expect((r2.body.daten as { unterhaltungen: { id: string }[] }).unterhaltungen[0]?.id).toBe(a);
    expect(await ketteGueltig(e.u)).toBe(true);
  });

  it("umbenennen prüft die Eingabe und schreibt Belege", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    const leer = await anfrage(e.u, e.h.umbenennen, "PATCH", `/api/unterhaltungen/${id}`, {
      dose: e.dose,
      params: { id },
      koerper: { title: "   " },
    });
    expect(leer.status).toBe(400);
    const zuLang = await anfrage(e.u, e.h.umbenennen, "PATCH", `/api/unterhaltungen/${id}`, {
      dose: e.dose,
      params: { id },
      koerper: { title: "x".repeat(LIMITS.conversationTitleChars + 1) },
    });
    expect(zuLang.status).toBe(400);
    const ok = await anfrage(e.u, e.h.umbenennen, "PATCH", `/api/unterhaltungen/${id}`, {
      dose: e.dose,
      params: { id },
      koerper: { title: "Antwort an Max Mustermann" },
    });
    expect(ok.status).toBe(200);
    expect((await repo.conversations.get(e.u.db, id as never))?.title).toBe(
      "Antwort an Max Mustermann",
    );
    expect(await belegTypen(e.u, 2)).toEqual([
      "decision:unterhaltung.umbenennen",
      "result:unterhaltung.umbenennen",
    ]);
    const fremd = newId("conversation");
    const nicht = await anfrage(e.u, e.h.umbenennen, "PATCH", `/api/unterhaltungen/${fremd}`, {
      dose: e.dose,
      params: { id: fremd },
      koerper: { title: "Neu" },
    });
    expect(nicht.status).toBe(404);
  });

  it("lesen liefert die Belege der Unterhaltung; fremde und kaputte IDs 404", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    const r = await anfrage(e.u, e.h.lesen, "GET", `/api/unterhaltungen/${id}`, {
      dose: e.dose,
      params: { id },
    });
    expect(r.status).toBe(200);
    const daten = r.body.daten as { belege: { aktion: string; art: string }[] };
    expect(daten.belege.map((b) => `${b.art}:${b.aktion}`)).toEqual([
      "result:unterhaltung.anlegen",
      "decision:unterhaltung.anlegen",
    ]);
    for (const falsch of ["kaputt", newId("conversation"), newId("message")]) {
      const n = await anfrage(e.u, e.h.lesen, "GET", `/api/unterhaltungen/${falsch}`, {
        dose: e.dose,
        params: { id: falsch },
      });
      expect(n.status).toBe(404);
    }
  });

  it("löschen: bei laufender Antwort abgelehnt, danach weg; Belege bleiben", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    await senden(e, id);
    const blockiert = await anfrage(e.u, e.h.loeschen, "DELETE", `/api/unterhaltungen/${id}`, {
      dose: e.dose,
      params: { id },
    });
    expect(blockiert.status).toBe(409);
    expect(blockiert.body.fehler?.code).toBe("lauf_aktiv");
    const lauf = await repo.runs.getActive(e.u.db, id as never);
    await repo.runs.finish(e.u.db, lauf?.id as never, { status: "cancelled" });
    const vorher = (await repo.belege.listFrom(e.u.db)).length;
    const ok = await anfrage(e.u, e.h.loeschen, "DELETE", `/api/unterhaltungen/${id}`, {
      dose: e.dose,
      params: { id },
    });
    expect(ok.status).toBe(200);
    expect(await repo.conversations.get(e.u.db, id as never)).toBeUndefined();
    expect((await repo.belege.listFrom(e.u.db)).length).toBe(vorher + 2);
    expect(await ketteGueltig(e.u)).toBe(true);
  });
});

describe("Nachricht senden", () => {
  it("Glücksfall: 202, Nachricht, Lauf, Ereignisse und Auftrag; Belege der Aktion", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    const r = await senden(e, id, "Hilf mir, meine Woche zu planen.");
    expect(r.status).toBe(202);
    const daten = r.body.daten as { messageId: string; runId: string };
    expect(e.einreihen.jobs).toEqual([{ runId: daten.runId, conversationId: id }]);
    const nachrichten = await repo.messages.listForConversation(e.u.db, id as never);
    expect(nachrichten.map((m) => [m.id, m.role, m.content])).toEqual([
      [daten.messageId, "user", "Hilf mir, meine Woche zu planen."],
    ]);
    expect((await repo.runs.get(e.u.db, daten.runId as never))?.status).toBe("queued");
    const ereignisse = await repo.events.listSince(e.u.db, id as never);
    // Ergebnis von „anlegen“, Entscheidung von „senden“, dann Nachricht, Lauf, Ergebnis.
    expect(ereignisse.map((x) => x.type)).toEqual([
      "beleg.created",
      "beleg.created",
      "message.created",
      "run.queued",
      "beleg.created",
    ]);
    expect(await belegTypen(e.u, 2)).toEqual([
      "decision:nachricht.senden",
      "result:nachricht.senden",
    ]);
    expect(await ketteGueltig(e.u)).toBe(true);
  });

  it("ganz oder gar nicht: scheitert das Einreihen, gibt es weder Nachricht noch Lauf", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    e.einreihen.fehler = new Error("Warteschlange weg");
    const r = await senden(e, id);
    expect(r.status).toBe(500);
    expect(r.body.fehler?.code).toBe("intern");
    expect(await repo.messages.listForConversation(e.u.db, id as never)).toEqual([]);
    expect(await repo.runs.listForConversation(e.u.db, id as never)).toEqual([]);
    const typen = (await repo.events.listSince(e.u.db, id as never)).map((x) => x.type);
    expect(typen).not.toContain("message.created");
    expect(typen).not.toContain("run.queued");
    // Die Entscheidung ist belegt, das Ergebnis meldet den Fehler.
    const [entscheidung, ergebnis] = (
      await repo.belege.listPage(e.u.db, { limit: 2 })
    ).items.reverse();
    expect(entscheidung?.body.type).toBe("decision");
    expect(ergebnis?.body.type === "result" && ergebnis.body.result.status).toBe("error");
    expect(await ketteGueltig(e.u)).toBe(true);
    // Danach geht es wieder.
    delete e.einreihen.fehler;
    expect((await senden(e, id)).status).toBe(202);
  });

  it("zweites Senden bei aktivem Lauf: sauberer Fehler lauf_aktiv, nichts Neues", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    expect((await senden(e, id, "Erste")).status).toBe(202);
    const zweite = await senden(e, id, "Zweite");
    expect(zweite.status).toBe(409);
    expect(zweite.body.fehler?.code).toBe("lauf_aktiv");
    expect((await repo.messages.listForConversation(e.u.db, id as never)).length).toBe(1);
    expect(e.einreihen.jobs.length).toBe(1);
    expect(await belegTypen(e.u, 2)).toEqual([
      "decision:nachricht.senden",
      "result:nachricht.senden",
    ]);
  });

  it("nicht vorhandene oder kaputte Unterhaltung: 404", async () => {
    const e = await eingerichtet();
    const fremd = newId("conversation");
    const r = await senden(e, fremd);
    expect(r.status).toBe(404);
    expect(r.body.fehler?.code).toBe("nicht_gefunden");
    expect((await senden(e, "kaputt")).status).toBe(404);
    expect(e.einreihen.jobs).toEqual([]);
  });

  // Gegenprobe: `keinLaufImFaden` aus `nachrichtSenden` entfernen → 404 statt des festen Hinweises, und
  // ohne die Prüfung in `nachrichtSenden` (Bot fehlt) bliebe es bei `nicht_gefunden` (rot).
  it("Faden: fester Hinweis, keine Nachricht, kein Lauf, keine Änderung", async () => {
    const e = await eingerichtet();
    const team = newId("team");
    const faden = newId("conversation");
    await e.u.db.insert(teams).values({ id: team, name: "Studio" });
    await e.u.db
      .insert(conversations)
      .values({ id: faden, kind: "faden", teamId: team, title: "Ein Faden" });
    const r = await senden(e, faden);
    expect(r.status).toBe(403);
    expect(r.body.fehler).toMatchObject({
      code: "abgelehnt",
      text: FADEN_OHNE_LAUF_TEXT,
      ausweg: FADEN_OHNE_LAUF_AUSWEG,
    });
    expect(await repo.messages.listForConversation(e.u.db, faden as never)).toEqual([]);
    expect(await repo.runs.getActive(e.u.db, faden as never)).toBeUndefined();
    expect(e.einreihen.jobs).toEqual([]);
    expect(await belegTypen(e.u, 1)).not.toContain("decision:nachricht.senden");
  });

  // Gegenprobe: `botPaused: bot?.paused ?? true` durch `false` ersetzen → die Nachricht geht durch,
  // Lauf und Auftrag entstehen trotz Pause (rot).
  it("Bot pausiert: 409 bot_pausiert vom Tor, keine Nachricht, kein Lauf, Beleg mit Ablehnung", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    const [bot] = await repo.bots.list(e.u.db);
    await repo.bots.setPaused(e.u.db, (bot as unknown as { id: never }).id, true);
    const r = await senden(e, id);
    expect(r.status).toBe(409);
    expect(r.body.fehler?.code).toBe("bot_pausiert");
    expect(await repo.messages.listForConversation(e.u.db, id as never)).toEqual([]);
    expect(await repo.runs.getActive(e.u.db, id as never)).toBeUndefined();
    expect(e.einreihen.jobs).toEqual([]);
    const beleg = (await repo.belege.listPage(e.u.db, { limit: 5 })).items.find(
      (b) => b.body.type === "decision" && b.body.action.type === "nachricht.senden",
    );
    expect(beleg?.body.type === "decision" && beleg.body.decision.outcome).toBe("deny");
    expect(
      beleg?.body.type === "decision" && (beleg.body.facts as { botPaused?: boolean }).botPaused,
    ).toBe(true);
    // Mit aufgehobener Pause geht es wieder.
    await repo.bots.setPaused(e.u.db, (bot as unknown as { id: never }).id, false);
    expect((await senden(e, id)).status).toBe(202);
  });

  // Gegenprobe: `botPaused: bot?.paused ?? true` durch `?? false` ersetzen → der Fakt steht als false im
  // Beleg und `bot_bereit` ist nicht verletzt (rot).
  it("Bot-Zeile fehlt (Unterhaltung unbekannt): Beleg mit botPaused = true und bot_bereit verletzt (G-15)", async () => {
    const e = await eingerichtet();
    const r = await senden(e, newId("conversation"));
    expect(r.status).toBeGreaterThanOrEqual(400);
    const beleg = (await repo.belege.listPage(e.u.db, { limit: 5 })).items.find(
      (b) => b.body.type === "decision" && b.body.action.type === "nachricht.senden",
    );
    expect(beleg?.body.type === "decision" && beleg.body.decision.outcome).toBe("deny");
    expect(
      beleg?.body.type === "decision" && (beleg.body.facts as { botPaused?: boolean }).botPaused,
    ).toBe(true);
    expect(
      beleg?.body.type === "decision" &&
        beleg.body.decision.limits.filter((l) => l.result === "verletzt").map((l) => l.name),
    ).toContain("bot_bereit");
  });

  it("Länge: leer und über der Grenze abgewiesen, genau an der Grenze erlaubt", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    const leer = await senden(e, id, "   ");
    expect(leer.status).toBe(400);
    const lang = await senden(e, id, "x".repeat(LIMITS.messageChars + 1));
    expect(lang.status).toBe(400);
    expect(lang.body.fehler).toMatchObject({ felder: [{ feld: "text", code: "zu_lang" }] });
    expect((await repo.messages.listForConversation(e.u.db, id as never)).length).toBe(0);
    expect((await senden(e, id, "x".repeat(LIMITS.messageChars))).status).toBe(202);
  });

  it("Not-Aus: das Tor lehnt ab, mit Grund und Belegen", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    await repo.settings.update(e.u.db, { killSwitch: true });
    const r = await senden(e, id);
    expect(r.status).toBe(409);
    expect(r.body.fehler).toMatchObject({
      code: "angehalten",
      text: "Alle Bots sind angehalten.",
    });
    expect(JSON.stringify(r.body.fehler)).toContain("Hebe den Not-Aus auf");
    expect(await repo.messages.listForConversation(e.u.db, id as never)).toEqual([]);
    expect(await belegTypen(e.u, 2)).toEqual([
      "decision:nachricht.senden",
      "result:nachricht.senden",
    ]);
  });

  it("Schalter Datenschleuse: an geht nur, wenn sie eingerichtet ist; Umschalten mit Beleg", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    const nein = await senden(e, id, "Hallo", "on");
    expect(nein.status).toBe(409);
    expect(nein.body.fehler?.code).toBe("schleuse_nicht_installiert");
    expect(await repo.messages.listForConversation(e.u.db, id as never)).toEqual([]);
    e.u.zustand.schleuseInstalliert = true;
    expect((await senden(e, id, "Hallo", "on")).status).toBe(202);
    expect((await repo.conversations.get(e.u.db, id as never))?.schleuseMode).toBe("on");
    const typen = await belegTypen(e.u, 4);
    expect(typen).toEqual([
      "decision:schleuse.umschalten",
      "result:schleuse.umschalten",
      "decision:nachricht.senden",
      "result:nachricht.senden",
    ]);
  });
});

describe("Schalter Datenschleuse nach der Meldung des Workers", () => {
  it("die Web-App kennt keine Datenschleuse; meldet der Worker sie, lässt sie sich einschalten", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    await repo.schleuse.report(e.u.db, { state: "aus" });
    expect((await senden(e, id, "Hallo", "on")).status).toBe(409);
    await repo.schleuse.report(e.u.db, { state: "nicht_erreichbar" });
    expect((await senden(e, id, "Hallo", "on")).status).toBe(202);
    expect((await repo.conversations.get(e.u.db, id as never))?.schleuseMode).toBe("on");
  });
});

describe("Schalter und Verlauf", () => {
  it("PUT schleuse schaltet je Unterhaltung; GET nachrichten liefert einen Lesestand", async () => {
    const e = await eingerichtet({ schleuseInstalliert: true });
    const id = await neueUnterhaltung(e);
    const an = await anfrage(e.u, e.h.schleuse, "PUT", `/api/unterhaltungen/${id}/schleuse`, {
      dose: e.dose,
      params: { id },
      koerper: { mode: "on" },
    });
    expect(an.status).toBe(200);
    expect((an.body.daten as { unterhaltung: { schleuse: string } }).unterhaltung.schleuse).toBe(
      "on",
    );
    const falsch = await anfrage(e.u, e.h.schleuse, "PUT", `/api/unterhaltungen/${id}/schleuse`, {
      dose: e.dose,
      params: { id },
      koerper: { mode: "auto" },
    });
    expect(falsch.status).toBe(400);
    const gesendet = await senden(e, id, "Hallo", "on");
    const runId = (gesendet.body.daten as { runId: string }).runId;
    const r = await anfrage(e.u, e.h.nachrichten, "GET", `/api/unterhaltungen/${id}/nachrichten`, {
      dose: e.dose,
      params: { id },
    });
    expect(r.status).toBe(200);
    const verlauf = r.body.daten as ChatVerlauf;
    expect(verlauf.unterhaltung.schleuse).toBe("on");
    expect(verlauf.nachrichten.map((m) => m.content)).toEqual(["Hallo"]);
    expect(verlauf.aktiverLauf?.id).toBe(runId);
    expect(verlauf.ereignisse.map((x) => x.type)).toEqual(["run.queued", "beleg.created"]);
    expect(verlauf.letzteSeq).toBe(verlauf.ereignisse.at(-1)?.seq);
  });
});

describe("Stopp", () => {
  it("ohne aktiven Lauf lehnt das Tor ab (404); mit aktivem Lauf wird der Abbruch vorgemerkt", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    const unbekannt = newId("run");
    const ohne = await anfrage(e.u, e.h.abbrechen, "POST", "/x", {
      dose: e.dose,
      params: { id, laufId: unbekannt },
    });
    expect(ohne.status).toBe(404);
    const gesendet = await senden(e, id);
    const runId = (gesendet.body.daten as { runId: string }).runId;
    // Lauf einer anderen Unterhaltung über diese Adresse: 404
    const andere = await neueUnterhaltung(e);
    const quer = await anfrage(e.u, e.h.abbrechen, "POST", "/x", {
      dose: e.dose,
      params: { id: andere, laufId: runId },
    });
    expect(quer.status).toBe(404);
    const ok = await anfrage(e.u, e.h.abbrechen, "POST", "/x", {
      dose: e.dose,
      params: { id, laufId: runId },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.daten).toEqual({ runId, angefragt: true });
    expect((await repo.runs.get(e.u.db, runId as never))?.cancelRequestedAt).toBeDefined();
    expect(await belegTypen(e.u, 2)).toEqual(["decision:lauf.abbrechen", "result:lauf.abbrechen"]);
    // Beendet: das Tor lehnt ab (Vorbedingung „Lauf aktiv“).
    await repo.runs.finish(e.u.db, runId as never, { status: "cancelled" });
    const spaet = await anfrage(e.u, e.h.abbrechen, "POST", "/x", {
      dose: e.dose,
      params: { id, laufId: runId },
    });
    expect(spaet.status).toBe(404);
    expect(await belegTypen(e.u, 2)).toEqual(["decision:lauf.abbrechen", "result:lauf.abbrechen"]);
    const letzte = (await repo.belege.listPage(e.u.db, { limit: 1 })).items[0];
    expect(letzte?.body.type === "result" && letzte.body.result.status).toBe("denied");
    expect(await ketteGueltig(e.u)).toBe(true);
  });
});

describe("Fakten des Tors beim Senden", () => {
  /** Entscheidung des letzten Sendens: Ergebnis, Fakten und Vorbedingungen nach Name. */
  async function letzteEntscheidung(u: TestUmgebung) {
    const [entscheidung] = (await repo.belege.listPage(u.db, { limit: 2 })).items.reverse();
    if (entscheidung?.body.type !== "decision") throw new Error("keine Entscheidung");
    const body = entscheidung.body;
    return {
      outcome: body.decision.outcome,
      reason: body.decision.reason,
      facts: body.facts,
      vorbedingungen: Object.fromEntries(
        (body.decision.preconditions ?? []).map((v) => [v.name, v.result]),
      ),
    };
  }

  it("Unterhaltung vorhanden: Fakt wahr erlaubt, Fakt falsch lehnt das Tor selbst ab", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    expect((await senden(e, id)).status).toBe(202);
    const erlaubt = await letzteEntscheidung(e.u);
    expect(erlaubt.outcome).toBe("allow");
    expect(erlaubt.facts.conversationExists).toBe(true);
    expect(erlaubt.vorbedingungen.unterhaltung_vorhanden).toBe("ok");

    const fremd = newId("conversation");
    const r = await senden(e, fremd);
    expect(r.status).toBe(404);
    expect(r.body.fehler?.code).toBe("nicht_gefunden");
    // Die Ablehnung kommt vom Tor (Entscheidung „deny“ mit verletzter Vorbedingung), nicht erst
    // von der Ausführung; sonst hielte der Beleg eine Erlaubnis fest, die nie hätte gelten dürfen.
    const abgelehnt = await letzteEntscheidung(e.u);
    expect(abgelehnt.outcome).toBe("deny");
    expect(abgelehnt.facts.conversationExists).toBe(false);
    expect(abgelehnt.vorbedingungen.unterhaltung_vorhanden).toBe("verletzt");
    expect(abgelehnt.vorbedingungen.kein_lauf_aktiv).toBe("ok");
  });

  it("Lauf aktiv: ohne Lauf erlaubt, mit Lauf lehnt das Tor selbst ab", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    expect((await senden(e, id, "Erste")).status).toBe(202);
    const erste = await letzteEntscheidung(e.u);
    expect(erste.outcome).toBe("allow");
    expect(erste.facts.runActive).toBe(false);
    expect(erste.vorbedingungen.kein_lauf_aktiv).toBe("ok");

    const zweite = await senden(e, id, "Zweite");
    expect(zweite.status).toBe(409);
    expect(zweite.body.fehler?.code).toBe("lauf_aktiv");
    const abgelehnt = await letzteEntscheidung(e.u);
    expect(abgelehnt.outcome).toBe("deny");
    expect(abgelehnt.facts.runActive).toBe(true);
    expect(abgelehnt.vorbedingungen.kein_lauf_aktiv).toBe("verletzt");
    expect(abgelehnt.vorbedingungen.unterhaltung_vorhanden).toBe("ok");
  });
});

describe("Neuladen zwischen Speichern der Antwort und Ende des Laufs", () => {
  /**
   * Schreibt eine Antwort so, wie der Worker es tut: Lauf starten, Nachricht anlegen, Stücke als
   * `text.delta`, dann Text speichern (bei Erfolg mit `message.completed`). Der Lauf bleibt offen,
   * wie in dem Augenblick, bevor die Steuerung ihn beendet.
   */
  async function antwortGespeichert(
    e: Umgebung,
    id: string,
    runId: RunId,
    teile: string[],
    status: "complete" | "cancelled" | "failed",
  ): Promise<string> {
    const db = e.u.db;
    const conversationId = id as never;
    await repo.runs.markRunning(db, runId);
    await repo.events.append(db, { conversationId, type: "run.started", data: { runId } });
    const messageId = await repo.withTransaction(db, async (tx) => {
      const m = await repo.messages.insert(tx, {
        conversationId,
        role: "assistant",
        status: "streaming",
        runId,
      });
      await repo.events.append(tx, {
        conversationId,
        type: "message.created",
        data: { messageId: m.id, role: "assistant", text: "" },
        runId,
      });
      return m.id;
    });
    for (const text of teile) {
      await repo.events.append(db, {
        conversationId,
        type: "text.delta",
        data: { runId, messageId, text },
      });
    }
    await repo.withTransaction(db, async (tx) => {
      await repo.messages.finalize(tx, messageId, {
        content: teile.join(""),
        route: "direct",
        status,
        ...(status === "failed" ? { errorCode: "anbieter_nicht_erreichbar" as const } : {}),
      });
      if (status === "complete") {
        await repo.events.append(tx, {
          conversationId,
          type: "message.completed",
          data: {
            messageId,
            route: "direct",
            modelLabel: "Beispiel-Modell A",
            tokens: { input: 10, output: 5 },
          },
          runId,
        });
      }
    });
    return messageId;
  }

  function texte(verlauf: ChatVerlauf | undefined) {
    if (verlauf === undefined) throw new Error("Verlauf fehlt");
    return ansichtAus(verlauf).eintraege.map((x) =>
      x.art === "nachricht" ? `${x.rolle}:${x.zustand}:${x.text}` : `ende:${x.ergebnis}`,
    );
  }

  it.each([
    ["complete", "fertig"],
    ["cancelled", "abgebrochen"],
    ["failed", "fehler"],
  ] as const)(
    "Antwort %s: der Text steht genau einmal da, auch nach dem Ende des Laufs",
    async (status, zustand) => {
      const e = await eingerichtet();
      const id = await neueUnterhaltung(e);
      const r = await senden(e, id, "Hallo Pai");
      const runId = (r.body.daten as { runId: string }).runId as RunId;
      const teile = ["Guten ", "Morgen! ", "Was steht an?"];
      await antwortGespeichert(e, id, runId, teile, status);

      const verlauf = await ladeVerlauf(e.u.db, id as never);
      // Der Zustand, um den es geht: fertiger Text und noch aktiver Lauf in einem Lesestand.
      expect(verlauf?.aktiverLauf?.id).toBe(runId);
      expect(verlauf?.ereignisse.filter((x) => x.type === "text.delta")).toHaveLength(3);
      const erwartet = ["du:fertig:Hallo Pai", `bot:${zustand}:Guten Morgen! Was steht an?`];
      expect(texte(verlauf)).toEqual(erwartet);
      const ansicht = ansichtAus(verlauf as ChatVerlauf);
      // Erfolg hat kein eigenes Lauf-Ereignis: `message.completed` beendet ihn in der Ansicht.
      expect(ansicht.lauf?.id).toBe(status === "complete" ? undefined : runId);

      // Die Steuerung beendet den Lauf; der Strom liefert den Rest ab der letzten Nummer.
      await repo.runs.finish(e.u.db, runId as never, {
        status: status === "complete" ? "succeeded" : status,
        ...(status === "complete" ? {} : { errorCode: "unterbrochen" as const }),
      });
      if (status !== "complete") {
        await repo.events.append(e.u.db, {
          conversationId: id as never,
          type: status === "cancelled" ? "run.cancelled" : "run.failed",
          data: { runId, code: "unterbrochen", text: "Abgebrochen." },
        });
      }
      const rest = await repo.events.listSince(e.u.db, id as never, {
        afterSeq: ansicht.letzteSeq,
      });
      const danach = ereignisseAnwenden(ansicht, rest);
      expect(danach.lauf).toBeUndefined();
      expect(
        danach.eintraege.map((x) => (x.art === "nachricht" ? x.text : `ende:${x.ergebnis}`)),
      ).toEqual(["Hallo Pai", "Guten Morgen! Was steht an?"]);
      expect(texte(await ladeVerlauf(e.u.db, id as never))).toEqual(erwartet);
    },
  );

  // Gegenprobe: `untrusted` in `toMessage` (packages/db) nicht übernehmen → die Antwort der Route kennt das Kennzeichen nicht.
  it("die Nachrichten-Route liefert das Kennzeichen „fremder Inhalt“ nur an Antworten, die es tragen", async () => {
    const e = await eingerichtet();
    const id = await neueUnterhaltung(e);
    const gesendet = await senden(e, id, "Frage");
    const runId = (gesendet.body.daten as { runId: string }).runId as RunId;
    const antwort = await repo.messages.insert(e.u.db, {
      conversationId: id as never,
      role: "assistant",
      status: "streaming",
      content: "",
      runId,
    });
    await repo.messages.finalize(e.u.db, antwort.id, {
      status: "complete",
      content: "Antwort mit Inhalt aus einer App",
      untrusted: true,
    });
    const r = await anfrage(e.u, e.h.nachrichten, "GET", `/api/unterhaltungen/${id}/nachrichten`, {
      dose: e.dose,
      params: { id },
    });
    expect(r.status).toBe(200);
    const verlauf = r.body.daten as ChatVerlauf;
    expect(verlauf.nachrichten.map((m) => [m.role, m.untrusted === true])).toEqual([
      ["user", false],
      ["assistant", true],
    ]);
  });
});
