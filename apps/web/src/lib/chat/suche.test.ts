/**
 * PaiBot – Tests der Suche: Route über den Rahmen (Sitzung, Eingabe, Limit, liest nur), Treffer
 * in Titeln und Nachrichten, Ausschnitt als Text, Sonderzeichen, Seiten; Zustand im Feld.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { SEARCH_PAGE } from "@paibot/shared/eingaben";
import type { ConversationId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import { anfrage, Keksdose } from "../zugang/testing";
import type { SuchErgebnis } from "./such-typen";
import { suchStand } from "./such-zustand";
import { ausschnittAus, titelTeile, unterhaltungenSuchen } from "./suche";
import { eingerichtet, mitZwischentexten, neueUnterhaltung, type Umgebung } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

async function mitDaten(): Promise<Umgebung & { suche: ReturnType<Umgebung["u"]["handler"]> }> {
  const e = await eingerichtet();
  const garten = (await neueUnterhaltung(e, "Gartenplan für März")) as ConversationId;
  const reise = (await neueUnterhaltung(e, "Reise nach Wien")) as ConversationId;
  await repo.messages.insert(e.u.db, {
    conversationId: garten,
    role: "user",
    content: "Wann säe ich TOMATEN aus?",
  });
  await repo.messages.insert(e.u.db, {
    conversationId: garten,
    role: "assistant",
    content: `${"Einleitung mit vielen Worten. ".repeat(8)}Tomaten säst du ab Mitte März auf der Fensterbank aus.\n\n${"Weitere Hinweise. ".repeat(20)}`,
  });
  await repo.messages.insert(e.u.db, {
    conversationId: reise,
    role: "user",
    content: "Rabatt 50% für <b>Kinder</b>?",
  });
  return { ...e, suche: e.u.handler("suche", unterhaltungenSuchen) };
}

async function suchen(e: Awaited<ReturnType<typeof mitDaten>>, abfrage: string, dose = e.dose) {
  return anfrage(e.u, e.suche, "GET", `/api/suche${abfrage}`, { dose });
}

describe("GET /api/suche", () => {
  it("ohne Sitzung 401; ungültige Eingabe 400", async () => {
    const e = await mitDaten();
    expect((await suchen(e, "?q=Tomaten", new Keksdose())).status).toBe(401);
    for (const abfrage of [
      "",
      "?q=",
      "?q=%20a%20",
      `?q=${"x".repeat(SEARCH_PAGE.maxChars + 1)}`,
      "?q=ab%00c",
      "?q=Tomaten&ab=-1",
      "?q=Tomaten&ab=abc",
      `?q=Tomaten&ab=${SEARCH_PAGE.maxOffset + 1}`,
      "?q=Tomaten&anders=1",
    ]) {
      const r = await suchen(e, abfrage);
      expect(r.status, abfrage).toBe(400);
      expect(r.body.fehler?.code, abfrage).toBe("eingabe_ungueltig");
    }
  });

  it("findet Titel und Nachrichten ohne Groß- und Kleinschreibung, neueste zuerst", async () => {
    const e = await mitDaten();
    const r = await suchen(e, `?q=${encodeURIComponent("  tomaten ")}`);
    expect(r.status).toBe(200);
    const d = r.body.daten as SuchErgebnis;
    expect(d.suchwort).toBe("tomaten");
    expect(d.titel).toEqual([]);
    expect(d.nachrichten.map((n) => n.rolle)).toEqual(["bot", "du"]);
    expect(d.nachrichten[0]?.titel).toBe("Gartenplan für März");
    // Der Ausschnitt zeigt die Fundstelle, gekürzt, ohne Zeilenumbrüche.
    const a = d.nachrichten[0]?.ausschnitt;
    expect(a?.treffer).toBe("Tomaten");
    expect(a?.gekuerztVorne).toBe(true);
    expect(a?.gekuerztHinten).toBe(true);
    expect(`${a?.vor}${a?.treffer}${a?.nach}`).not.toMatch(/\n/);
    expect(d.weiter).toBeUndefined();

    const t = (await suchen(e, "?q=M%C3%84RZ")).body.daten as SuchErgebnis;
    expect(t.titel.map((x) => `${x.titel.vor}[${x.titel.treffer}]${x.titel.nach}`)).toEqual([
      "Gartenplan für [März]",
    ]);
    expect(t.nachrichten).toHaveLength(1);
  });

  it("Sonderzeichen wirken nicht als Muster, Inhalte bleiben Text", async () => {
    const e = await mitDaten();
    const zahl = async (q: string) => {
      const d = (await suchen(e, `?q=${encodeURIComponent(q)}`)).body.daten as SuchErgebnis;
      return d.nachrichten.length + d.titel.length;
    };
    expect(await zahl("0%")).toBe(1);
    expect(await zahl("%%")).toBe(0);
    expect(await zahl("__")).toBe(0);
    expect(await zahl("T_maten")).toBe(0);
    const d = (await suchen(e, "?q=%3Cb%3E")).body.daten as SuchErgebnis;
    expect(d.nachrichten[0]?.ausschnitt.treffer).toBe("<b>");
  });

  it("liest nur: keine Belege, keine Daten außer dem Zähler des Limits", async () => {
    const e = await mitDaten();
    const vorher = await repo.belege.head(e.u.db);
    await suchen(e, "?q=Tomaten");
    expect((await repo.belege.head(e.u.db))?.seq).toBe(vorher?.seq);
  });

  it("Not-Aus an: Suchen geht weiter", async () => {
    const e = await mitDaten();
    await repo.settings.update(e.u.db, { killSwitch: true });
    const r = await suchen(e, "?q=Tomaten");
    expect(r.status).toBe(200);
    expect((r.body.daten as SuchErgebnis).nachrichten).toHaveLength(2);
  });

  it("blättert seitenweise", async () => {
    const e = await mitDaten();
    const [u] = await repo.conversations.list(e.u.db);
    for (let i = 0; i < SEARCH_PAGE.size + 3; i++) {
      await repo.messages.insert(e.u.db, {
        conversationId: u?.id as ConversationId,
        role: "user",
        content: `Notiz Nummer ${i}`,
      });
    }
    const erste = (await suchen(e, "?q=notiz")).body.daten as SuchErgebnis;
    expect(erste.nachrichten).toHaveLength(SEARCH_PAGE.size);
    expect(erste.weiter).toBe(SEARCH_PAGE.size);
    const zweite = (await suchen(e, `?q=notiz&ab=${erste.weiter}`)).body.daten as SuchErgebnis;
    expect(
      zweite.nachrichten.map((n) => n.ausschnitt.vor + n.ausschnitt.treffer + n.ausschnitt.nach),
    ).toEqual(["Notiz Nummer 2", "Notiz Nummer 1", "Notiz Nummer 0"]);
    expect(zweite.weiter).toBeUndefined();
  });

  it("findet keine Zwischentexte; Blättern zählt nur Treffer", async () => {
    const e = await eingerichtet();
    // Ältere Treffer füllen die erste Seite fast: mit den drei Treffern der Unterhaltung unten
    // gibt es genau eine Seite und einen Treffer mehr.
    const alt = (await neueUnterhaltung(e, "Alt")) as ConversationId;
    for (let i = 0; i < SEARCH_PAGE.size - 2; i++) {
      await repo.messages.insert(e.u.db, {
        conversationId: alt,
        role: "user",
        content: `Suchwort alt ${i}`,
      });
    }
    await mitZwischentexten(e, {
      titel: "Beet",
      laeufe: [
        {
          frage: "Suchwort in der Frage",
          zwischentexte: [
            { text: "Suchwort im Zwischentext 1" },
            { text: "Suchwort im Zwischentext 2" },
          ],
          antwort: "Suchwort in Antwort 1",
          ende: "succeeded",
        },
        { antwort: "Suchwort in Antwort 2", ende: "succeeded" },
        {
          zwischentexte: [
            { text: "Suchwort im Zwischentext 3", status: "cancelled" },
            { text: "Suchwort im Zwischentext 4", status: "cancelled" },
            { text: "Suchwort im Zwischentext 5", status: "cancelled" },
          ],
          ende: "cancelled",
        },
      ],
    });
    const such = e.u.handler("suche", unterhaltungenSuchen);
    const erste = (await anfrage(e.u, such, "GET", "/api/suche?q=suchwort", { dose: e.dose })).body
      .daten as SuchErgebnis;
    expect(erste.nachrichten).toHaveLength(SEARCH_PAGE.size);
    expect(erste.weiter).toBe(SEARCH_PAGE.size);
    const zweite = (
      await anfrage(e.u, such, "GET", `/api/suche?q=suchwort&ab=${erste.weiter}`, { dose: e.dose })
    ).body.daten as SuchErgebnis;
    expect(zweite.nachrichten).toHaveLength(1);
    expect(zweite.weiter).toBeUndefined();
    const alle = [...erste.nachrichten, ...zweite.nachrichten].map(
      (n) => n.ausschnitt.vor + n.ausschnitt.treffer + n.ausschnitt.nach,
    );
    expect(alle.filter((t) => t.includes("Zwischentext"))).toEqual([]);
    expect(alle.filter((t) => t.includes("Antwort"))).toHaveLength(2);
  });

  it("zählt auf ein Limit je Besitzer und sperrt darüber mit 429", async () => {
    const e = await mitDaten();
    let letzte = 0;
    for (let i = 0; i < 121; i++) letzte = (await suchen(e, "?q=xy")).status;
    expect(letzte).toBe(429);
  });
});

describe("Ausschnitt", () => {
  it("markiert die erste Fundstelle und kürzt an Wortgrenzen", () => {
    const a = ausschnittAus(`${"wort ".repeat(30)}Apfel und Birne ${"rest ".repeat(40)}`, "APFEL", {
      vorne: false,
      hinten: false,
    });
    expect(a.treffer).toBe("Apfel");
    expect(a.vor.startsWith("wort")).toBe(true);
    expect(a.gekuerztVorne).toBe(true);
    expect(a.gekuerztHinten).toBe(true);
    expect(a.nach.endsWith(" ")).toBe(false);
  });

  it("ohne genaue Fundstelle: Anfang ohne Markierung", () => {
    const a = ausschnittAus("Ein kurzer Text", "fehlt", { vorne: false, hinten: false });
    expect(a).toMatchObject({ vor: "", treffer: "", nach: "Ein kurzer Text" });
  });

  it("Titel in drei Teilen", () => {
    expect(titelTeile("Reise nach Wien", "WIEN")).toMatchObject({
      vor: "Reise nach ",
      treffer: "Wien",
      nach: "",
    });
  });
});

describe("Zustand des Suchfelds", () => {
  it("leer, zu kurz oder suchen", () => {
    expect(suchStand("   ")).toEqual({ art: "leer" });
    expect(suchStand(" a ")).toEqual({ art: "zu_kurz" });
    expect(suchStand(" ab ")).toEqual({ art: "suchen", suchwort: "ab" });
    expect(suchStand("äb")).toEqual({ art: "suchen", suchwort: "äb" });
  });
});
