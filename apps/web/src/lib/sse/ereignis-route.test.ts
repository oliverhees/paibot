/**
 * PaiBot – Tests der Route des Ereignis-Stroms gegen PGlite: Nachholen, live, ohne Lücke und ohne
 * Doppel, Sitzung, Grenzen, Herzschlag, Aufräumen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { events } from "@paibot/db/repo";
import { createTestDb, type TestDb } from "@paibot/db/testing";
import { decodeEvent, SSE_HEARTBEAT_MS, SSE_RETRY_MS } from "@paibot/shared/ereignisse";
import { type ConversationId, newId } from "@paibot/shared/ids";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type EreignisDienste, erstelleEreignisRoute } from "./ereignis-route";
import { createStromZaehler, STROM_GRENZEN } from "./grenzen";
import type { SitzungPruefen } from "./sitzung";
import type { StromEinstellungen, StromEnde } from "./strom";
import {
  beispielUnterhaltung,
  pgliteQuelle,
  type SseBlock,
  sseLeser,
  stilleQuelle,
  warten,
  zaehlUhr,
} from "./testhilfe";
import { createVerteiler, type MeldungsQuelle } from "./verteiler";

let t: TestDb;
let cid: ConversationId;

// Eine Datenbank für die Datei (Migrationen sind teuer); jeder Test bekommt eine eigene Unterhaltung.
beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.client.close();
});

beforeEach(async () => {
  cid = await beispielUnterhaltung(t.db);
});

const angemeldet: SitzungPruefen = async () => ({ ok: true, sitzung: "sitzung-a" });

async function anhaengen(conversationId: ConversationId = cid, anzahl = 1): Promise<number[]> {
  const nummern: number[] = [];
  for (let i = 0; i < anzahl; i += 1) {
    const e = await events.append(t.db, {
      conversationId,
      type: "run.queued",
      data: { runId: newId("run") },
    });
    nummern.push(e.seq);
  }
  return nummern;
}

interface Aufbau {
  quelle?: MeldungsQuelle;
  sitzungPruefen?: SitzungPruefen;
  einstellungen?: Partial<StromEinstellungen>;
  grenzen?: { jeSitzung: number; gesamt: number };
}

function aufbauen(optionen: Aufbau = {}) {
  const pg = pgliteQuelle(t.client);
  const verteiler = createVerteiler(optionen.quelle ?? pg.quelle);
  const zaehler = createStromZaehler(optionen.grenzen);
  const uhr = zaehlUhr();
  const enden: StromEnde[] = [];
  let dienstAufrufe = 0;
  const dienste: EreignisDienste = { db: t.db, verteiler, zaehler };
  const GET = erstelleEreignisRoute({
    sitzungPruefen: optionen.sitzungPruefen ?? angemeldet,
    dienste: () => {
      dienstAufrufe += 1;
      return dienste;
    },
    einstellungen: optionen.einstellungen,
    uhr,
    beiEnde: (grund) => enden.push(grund),
  });

  async function oeffnen(
    kopf: Record<string, string> = {},
    weitere: { id?: string; suche?: string } = {},
  ) {
    const abbruch = new AbortController();
    const id = weitere.id ?? cid;
    const url = `http://localhost/api/unterhaltungen/${id}/ereignisse${weitere.suche ?? ""}`;
    const antwort = await GET(new Request(url, { headers: kopf, signal: abbruch.signal }), {
      params: Promise.resolve({ id }),
    });
    return { antwort, abbruch };
  }

  async function strom(
    kopf: Record<string, string> = {},
    weitere: { id?: string; suche?: string } = {},
  ) {
    const { antwort, abbruch } = await oeffnen(kopf, weitere);
    expect(antwort.status).toBe(200);
    if (!antwort.body) throw new Error("kein Körper");
    const leser = sseLeser(antwort.body);
    return {
      antwort,
      leser,
      async trennen() {
        abbruch.abort();
        await leser.abbrechen();
      },
    };
  }

  return {
    pg,
    verteiler,
    zaehler,
    uhr,
    enden,
    oeffnen,
    strom,
    get dienstAufrufe() {
      return dienstAufrufe;
    },
  };
}

const hatNummer = (n: number) => (b: SseBlock[]) => b.some((x) => x.id === String(n));

describe("Format", () => {
  it("beginnt mit `retry`, sendet `id`/`event`/`data` nach Vertrag und setzt die Kopfzeilen", async () => {
    await anhaengen();
    const a = aufbauen();
    const { antwort, leser, trennen } = await a.strom();
    await leser.bis(hatNummer(1));

    expect(leser.bloecke[0]?.roh).toBe(`retry: ${SSE_RETRY_MS}`);
    expect(SSE_RETRY_MS).toBe(2750);
    const block = leser.ereignisse()[0];
    expect(block?.roh.split("\n").map((z) => z.split(":")[0])).toEqual(["id", "event", "data"]);
    expect(block?.id).toBe("1");
    expect(block?.event).toBe("run.queued");
    const ereignis = decodeEvent(block?.data ?? "");
    expect(ereignis).toMatchObject({ conversationId: cid, seq: 1, type: "run.queued" });

    expect(antwort.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(antwort.headers.get("cache-control")).toBe("no-cache, no-store, no-transform");
    expect(antwort.headers.get("x-accel-buffering")).toBe("no");
    for (const [name] of antwort.headers) expect(name).not.toMatch(/^access-control-/);
    await trennen();
  });

  it("schickt den Herzschlag genau als `: puls` mit Leerzeile", async () => {
    expect(STROM_GRENZEN.herzschlagMs).toBe(SSE_HEARTBEAT_MS);
    expect(SSE_HEARTBEAT_MS).toBe(15000);
    const a = aufbauen({ einstellungen: { herzschlagMs: 30 } });
    const { antwort, abbruch } = await a.oeffnen();
    if (!antwort.body) throw new Error("kein Körper");
    const reader = antwort.body.getReader();
    const dekodierer = new TextDecoder();
    let text = "";
    while (!text.includes(": puls\n\n")) {
      const teil = await reader.read();
      if (teil.done) break;
      text += dekodierer.decode(teil.value, { stream: true });
    }
    expect(text).toBe("retry: 2750\n\n: puls\n\n");
    abbruch.abort();
    await reader.cancel();
  });
});

describe("Nachholen und live", () => {
  it("holt ab `Last-Event-ID` nach und reicht danach live weiter", async () => {
    await anhaengen(cid, 5);
    const a = aufbauen();
    const { leser, trennen } = await a.strom({ "Last-Event-ID": "2" });
    await leser.bis(hatNummer(5));
    expect(leser.nummern()).toEqual([3, 4, 5]);

    await anhaengen(cid, 2);
    await leser.bis(hatNummer(7));
    expect(leser.nummern()).toEqual([3, 4, 5, 6, 7]);
    await trennen();
  });

  it("nimmt `?nach=` als Start, `Last-Event-ID` hat Vorrang", async () => {
    await anhaengen(cid, 4);
    const a = aufbauen();
    const erster = await a.strom({}, { suche: "?nach=3" });
    await erster.leser.bis(hatNummer(4));
    expect(erster.leser.nummern()).toEqual([4]);
    await erster.trennen();

    const zweiter = await a.strom({ "Last-Event-ID": "1" }, { suche: "?nach=3" });
    await zweiter.leser.bis(hatNummer(4));
    expect(zweiter.leser.nummern()).toEqual([2, 3, 4]);
    await zweiter.trennen();
  });

  it("liest in Stapeln, ohne etwas auszulassen", async () => {
    await anhaengen(cid, 25);
    const a = aufbauen({ einstellungen: { stapel: 4 } });
    const { leser, trennen } = await a.strom();
    await leser.bis(hatNummer(25));
    expect(leser.nummern()).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    await trennen();
  });

  it("ein Ereignis zwischen LISTEN und Nachholen kommt genau einmal", async () => {
    await anhaengen();
    const pg = pgliteQuelle(t.client);
    const quelle: MeldungsQuelle = {
      async listen(kanal, beiMeldung, beiBereit) {
        const abo = await pg.quelle.listen(kanal, beiMeldung, beiBereit);
        // LISTEN ist aktiv, nachgeholt wurde noch nicht: genau jetzt kommt ein Ereignis dazu.
        await anhaengen();
        return abo;
      },
    };
    const a = aufbauen({ quelle });
    const { leser, trennen } = await a.strom();
    await leser.bis(hatNummer(2));
    await leser.sammeln(150);
    expect(leser.nummern()).toEqual([1, 2]);
    await trennen();
  });

  it("doppelte Meldungen und ein Wiederaufbau der Verbindung erzeugen kein Doppel", async () => {
    const a = aufbauen();
    const { leser, trennen } = await a.strom();
    await anhaengen(cid, 2);
    await leser.bis(hatNummer(2));
    await t.client.query(`select pg_notify('paibot_ereignis', $1)`, [cid]);
    a.pg.wiederaufbau();
    await anhaengen();
    await leser.bis(hatNummer(3));
    await leser.sammeln(150);
    expect(leser.nummern()).toEqual([1, 2, 3]);
    await trennen();
  });

  it("nach einem Wiederaufbau wird nachgeholt, was ohne Meldung dazukam", async () => {
    const a = aufbauen();
    const { leser, trennen } = await a.strom();
    await leser.sammeln(50);
    // Ereignis ohne Meldung (wie bei einem Verbindungsverlust des LISTEN).
    await t.client.query(
      `insert into conversation_events (conversation_id, seq, type, payload) values ($1, 1, 'run.queued', $2)`,
      [cid, JSON.stringify({ runId: newId("run") })],
    );
    await leser.sammeln(80);
    expect(leser.nummern()).toEqual([]);
    a.pg.wiederaufbau();
    await leser.bis(hatNummer(1));
    expect(leser.nummern()).toEqual([1]);
    await trennen();
  });

  it("Verbindung trennen und mit `Last-Event-ID` fortsetzen: ohne Lücke und ohne Doppel", async () => {
    const a = aufbauen();
    const erster = await a.strom();
    await anhaengen(cid, 3);
    await erster.leser.bis(hatNummer(3));
    const letzte = erster.leser.ereignisse().at(-1)?.id ?? "";
    await erster.trennen();
    await warten(() => a.verteiler.anzahl === 0);

    await anhaengen(cid, 2); // während der Trennung
    const zweiter = await a.strom({ "Last-Event-ID": letzte });
    await zweiter.leser.bis(hatNummer(5));
    await anhaengen();
    await zweiter.leser.bis(hatNummer(6));

    const alle = [...erster.leser.nummern(), ...zweiter.leser.nummern()];
    expect(alle).toEqual([1, 2, 3, 4, 5, 6]);
    await zweiter.trennen();
  });

  it("zwei Ströme derselben Unterhaltung teilen ein LISTEN und bekommen beide alles", async () => {
    const a = aufbauen();
    const eins = await a.strom();
    const zwei = await a.strom();
    await anhaengen(cid, 2);
    await eins.leser.bis(hatNummer(2));
    await zwei.leser.bis(hatNummer(2));
    expect(eins.leser.nummern()).toEqual([1, 2]);
    expect(zwei.leser.nummern()).toEqual([1, 2]);
    expect(a.pg.stand.listen).toBe(1);
    await eins.trennen();
    await zwei.trennen();
  });

  it("ein Strom einer anderen Unterhaltung bekommt nichts", async () => {
    const andere = await beispielUnterhaltung(t.db, "Andere");
    const a = aufbauen();
    const fremd = await a.strom({}, { id: andere });
    const eigen = await a.strom();
    await anhaengen(cid, 3);
    await eigen.leser.bis(hatNummer(3));
    await fremd.leser.sammeln(150);
    expect(fremd.leser.ereignisse()).toEqual([]);
    expect(a.pg.stand.listen).toBe(1);
    await fremd.trennen();
    await eigen.trennen();
  });

  it("ignoriert Meldungen mit fremder Nutzlast", async () => {
    const a = aufbauen();
    const { leser, trennen } = await a.strom();
    await t.client.query(`select pg_notify('paibot_ereignis', 'kaputt')`);
    await leser.sammeln(100);
    expect(leser.ereignisse()).toEqual([]);
    await trennen();
  });
});

describe("Sitzung", () => {
  it("ohne Sitzung: 401, kein LISTEN, kein Zugriff auf die Datenbank", async () => {
    const abgelehnt: SitzungPruefen = async () => ({ ok: false, status: 401 });
    const a = aufbauen({ sitzungPruefen: abgelehnt });
    const { antwort } = await a.oeffnen();
    expect(antwort.status).toBe(401);
    expect((await antwort.json()).fehler.code).toBe("nicht_angemeldet");
    expect(a.pg.stand.listen).toBe(0);
    expect(a.dienstAufrufe).toBe(0);
    expect(a.uhr.offen).toBe(0);
  });

  it("eine Prüfung, die wirft oder Unsinn liefert, gilt als abgelehnt", async () => {
    const wirft: SitzungPruefen = async () => {
      throw new Error("kaputt");
    };
    const unsinn = (async () => ({ ok: true })) as unknown as SitzungPruefen;
    for (const pruefen of [wirft, unsinn]) {
      const a = aufbauen({ sitzungPruefen: pruefen });
      const { antwort } = await a.oeffnen();
      expect(antwort.status).toBe(401);
      expect(a.pg.stand.listen).toBe(0);
    }
  });

  it("die Route im App-Ordner lehnt ohne eingetragene Prüfung ab", async () => {
    const { GET } = await import("../../app/api/unterhaltungen/[id]/ereignisse/route");
    const antwort = await GET(
      new Request(`http://localhost/api/unterhaltungen/${cid}/ereignisse`),
      {
        params: Promise.resolve({ id: cid }),
      },
    );
    expect(antwort.status).toBe(401);
    expect(antwort.headers.get("content-type")).not.toContain("event-stream");
  });

  it("endet beim Herzschlag, wenn die Sitzung nicht mehr gilt", async () => {
    let gueltig = true;
    const a = aufbauen({
      sitzungPruefen: async () =>
        gueltig ? { ok: true, sitzung: "s" } : { ok: false, status: 401 },
      einstellungen: { herzschlagMs: 25 },
    });
    const { leser } = await a.strom();
    await leser.bis((b) => b.some((x) => x.kommentar === "puls"));
    gueltig = false;
    await leser.bisEnde();
    expect(a.enden).toEqual(["sitzung"]);
    await warten(() => a.verteiler.anzahl === 0 && a.uhr.offen === 0);
    expect(a.zaehler.offen()).toBe(0);
  });
});

describe("Eingaben", () => {
  it.each(["abc", "-1", "01", "1e3", "1 2", "0x10", "1.0", "99999999999999999", ""])(
    "lehnt `Last-Event-ID` %j mit 400 ab, ohne LISTEN",
    async (wert) => {
      const a = aufbauen();
      const { antwort } = await a.oeffnen({ "Last-Event-ID": wert });
      expect(antwort.status).toBe(400);
      const body = await antwort.json();
      expect(body.fehler.code).toBe("eingabe_ungueltig");
      expect(body.fehler.felder).toEqual([{ feld: "Last-Event-ID", code: "format" }]);
      expect(a.pg.stand.listen).toBe(0);
    },
  );

  it("lehnt einen ungültigen Parameter `nach` ab", async () => {
    const a = aufbauen();
    const { antwort } = await a.oeffnen({}, { suche: "?nach=x" });
    expect(antwort.status).toBe(400);
    expect((await antwort.json()).fehler.felder).toEqual([{ feld: "nach", code: "format" }]);
  });

  it("lehnt eine Nummer hinter dem Ende ab", async () => {
    await anhaengen(cid, 2);
    const a = aufbauen();
    const { antwort } = await a.oeffnen({ "Last-Event-ID": "3" });
    expect(antwort.status).toBe(400);
    expect((await antwort.json()).fehler.felder).toEqual([
      { feld: "Last-Event-ID", code: "zu_gross" },
    ]);
    expect(a.pg.stand.listen).toBe(0);
  });

  it("unbekannte oder falsch geformte Unterhaltung: 404 ohne Details", async () => {
    const a = aufbauen();
    for (const id of [newId("conversation"), "unt_kaputt", newId("bot"), "../x"]) {
      const { antwort } = await a.oeffnen({}, { id });
      expect(antwort.status).toBe(404);
      const body = await antwort.json();
      expect(Object.keys(body.fehler)).toEqual(["code", "text"]);
      expect(body.fehler.code).toBe("nicht_gefunden");
      expect(JSON.stringify(body)).not.toContain(id);
    }
    expect(a.pg.stand.listen).toBe(0);
  });
});

describe("Aufräumen und Grenzen", () => {
  it("nach dem Trennen: kein Zeitgeber, kein Abo, UNLISTEN, Platz frei", async () => {
    const a = aufbauen();
    const { leser, trennen } = await a.strom();
    await leser.sammeln(30);
    expect(a.verteiler.hoertZu).toBe(true);
    expect(a.uhr.offen).toBe(2);
    await trennen();
    await warten(() => a.pg.stand.unlisten === 1);
    expect(a.uhr.offen).toBe(0);
    expect(a.verteiler.anzahl).toBe(0);
    expect(a.verteiler.hoertZu).toBe(false);
    expect(a.pg.stand.aktiv).toBe(0);
    expect(a.zaehler.offen()).toBe(0);
    expect(a.enden).toEqual(["client"]);
  });

  it("räumt auch auf, wenn nur das Abbruch-Signal kommt", async () => {
    const a = aufbauen();
    const { antwort, abbruch } = await a.oeffnen();
    expect(antwort.status).toBe(200);
    abbruch.abort();
    await warten(() => a.pg.stand.unlisten === 1);
    expect(a.uhr.offen).toBe(0);
    expect(a.zaehler.offen()).toBe(0);
  });

  it("Obergrenze je Sitzung und gesamt: danach 429 mit Retry-After, ohne LISTEN", async () => {
    let sitzung = "a";
    const a = aufbauen({
      grenzen: { jeSitzung: 2, gesamt: 3 },
      sitzungPruefen: async () => ({ ok: true, sitzung }),
    });
    const eins = await a.strom();
    await a.strom();
    const zuViel = await a.oeffnen();
    expect(zuViel.antwort.status).toBe(429);
    expect(zuViel.antwort.headers.get("retry-after")).toBe(String(STROM_GRENZEN.wartenSekunden));
    expect((await zuViel.antwort.json()).fehler.code).toBe("zu_viele_versuche");
    expect(a.verteiler.anzahl).toBe(2);

    sitzung = "b";
    await a.strom();
    expect((await a.oeffnen()).antwort.status).toBe(429); // gesamt voll

    sitzung = "a";
    await eins.trennen();
    await warten(() => a.zaehler.offen("a") === 1);
    const wieder = await a.strom();
    await wieder.trennen();
  });

  it("endet nach der Lebensdauer sauber, damit der Browser neu verbindet", async () => {
    await anhaengen();
    const a = aufbauen({ einstellungen: { lebensdauerMs: 80 } });
    const { leser } = await a.strom();
    await leser.bisEnde();
    expect(leser.nummern()).toEqual([1]);
    expect(a.enden).toEqual(["lebensdauer"]);
    await warten(() => a.pg.stand.unlisten === 1);
    expect(a.uhr.offen).toBe(0);
  });

  it("ein Client, der nicht liest, hält den Server nicht auf und wird getrennt", async () => {
    await anhaengen(cid, 60);
    const a = aufbauen({
      einstellungen: { pufferBytes: 512, stapel: 5, herzschlagMs: 20, blockiertePulse: 2 },
    });
    const { antwort } = await a.oeffnen();
    expect(antwort.status).toBe(200);
    await warten(() => a.enden.length === 1);
    expect(a.enden).toEqual(["rueckstau"]);
    await warten(() => a.pg.stand.unlisten === 1);
    expect(a.uhr.offen).toBe(0);
  });
});

describe("Verteiler", () => {
  it("LISTEN schlägt fehl: Fehler, nichts bleibt angemeldet, Route antwortet 500", async () => {
    const quelle: MeldungsQuelle = {
      listen: async () => {
        throw new Error("keine Verbindung");
      },
    };
    const a = aufbauen({ quelle });
    const { antwort } = await a.oeffnen();
    expect(antwort.status).toBe(500);
    expect(a.verteiler.anzahl).toBe(0);
    expect(a.zaehler.offen()).toBe(0);
    expect(a.uhr.offen).toBe(0);
  });

  it("gleichzeitiges An- und Abmelden startet LISTEN nur einmal und beendet es am Schluss", async () => {
    const still = stilleQuelle();
    const verteiler = createVerteiler(still.quelle);
    const abmeldungen = await Promise.all(
      Array.from({ length: 5 }, () => verteiler.abonnieren(cid, () => undefined)),
    );
    expect(still.stand.listen).toBe(1);
    await Promise.all(abmeldungen.map((ab) => ab()));
    await Promise.all(abmeldungen.map((ab) => ab())); // doppelt ist harmlos
    expect(still.stand.unlisten).toBe(1);
    expect(verteiler.anzahl).toBe(0);

    const neu = await verteiler.abonnieren(cid, () => undefined);
    expect(still.stand.listen).toBe(2);
    await neu();
  });
});
