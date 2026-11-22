/**
 * PaiBot – Tests der Angaben für die Werkzeug-Zeile: Titel von PaiBot aus einer festen Liste, Zustand
 * in Worten nur aus dem Zustand des Aufrufs, Grund aus dem Fehlercode, Regel und Beleg aus den
 * Belegen der Unterhaltung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { newId } from "@paibot/shared/ids";
import { errorText } from "@paibot/shared/texte";
import { describe, expect, it } from "vitest";
import type { AnsichtWerkzeug } from "./ansicht";
import { werkzeugZeileAngaben } from "./schritte-anzeige";
import type { BelegKurz } from "./typen";
import { WERKZEUG_DOKU } from "./werkzeug-anzeige";

function aufruf(teil: Partial<AnsichtWerkzeug> = {}): AnsichtWerkzeug {
  return {
    actionId: newId("action"),
    key: WERKZEUG_DOKU,
    name: "doku_nachschlagen",
    position: 0,
    status: "fertig",
    ...teil,
  };
}

describe("Werkzeug-Zeile", () => {
  it("das Nachschlagen heißt „In der Doku nachschlagen“; sein Name steht nicht in der Zeile", () => {
    const z = werkzeugZeileAngaben(aufruf(), []);
    expect(z.titel).toBe("In der Doku nachschlagen");
    expect(z.nameVomModell).toBeUndefined();
    expect(z.symbol).toBe("suche");
  });

  // Gegenprobe: den Titel aus dem Namen des Modells bilden → der Fall mit dem fremden Namen wird rot.
  it("ein unbekanntes Werkzeug heißt „Werkzeug“, sein Name steht als Name vom Modell", () => {
    const z = werkzeugZeileAngaben(
      aufruf({ key: "eingebaut/unbekannt", name: "In der Doku nachschlagen" }),
      [],
    );
    expect(z.titel).toBe("Werkzeug");
    expect(z.nameVomModell).toBe("In der Doku nachschlagen");
    const roh = werkzeugZeileAngaben(aufruf({ key: "", nameVomModell: "roh_name", name: "x" }), []);
    expect(roh.nameVomModell).toBe("roh_name");
  });

  describe("Werkzeug aus einer App", () => {
    const app = (teil: Partial<AnsichtWerkzeug> = {}) =>
      aufruf({ key: "mcp/aufgaben/liste_heute", name: "mcp-aufgaben__liste_heute", ...teil });

    // Gegenprobe: die Herkunft nicht aus der Kennung lesen → rot.
    it("trägt App und Werkzeug aus der Kennung; der Name vom Modell steht nicht zusätzlich da", () => {
      const z = werkzeugZeileAngaben(app(), []);
      expect(z.titel).toBe("Werkzeug aus der App");
      expect(z.app).toEqual({ kurzname: "aufgaben", werkzeug: "liste_heute" });
      expect(z.nameVomModell).toBeUndefined();
      expect(z.symbol).toBeUndefined();
    });

    it("der Name der App kommt aus der Liste der Apps, wenn die App da ist; sonst bleibt der Kurzname", () => {
      expect(werkzeugZeileAngaben(app(), [], { aufgaben: "Meine Aufgaben" }).app).toEqual({
        kurzname: "aufgaben",
        name: "Meine Aufgaben",
        werkzeug: "liste_heute",
      });
      expect(werkzeugZeileAngaben(app(), [], { andere: "X" }).app?.name).toBeUndefined();
      expect(werkzeugZeileAngaben(app(), [], {}).app?.name).toBeUndefined();
      // Ein Kurzname wie „constructor“ findet nichts im Prototyp.
      const proto = werkzeugZeileAngaben(app({ key: "mcp/constructor/x" }), [], {});
      expect(proto.app).toEqual({ kurzname: "constructor", werkzeug: "x" });
    });

    it("das Werkzeug mit Punkt und Bindestrich im Namen; zwei Teile nach „mcp“ sind nötig", () => {
      expect(werkzeugZeileAngaben(app({ key: "mcp/a-b/get.x-1" }), []).app).toEqual({
        kurzname: "a-b",
        werkzeug: "get.x-1",
      });
      // Nur „mcp/x“ oder ein Fremdling: keine App, das Werkzeug heißt „Werkzeug“.
      for (const key of ["mcp/x", "mcp", "eingebaut/doku.nachschlagen2", ""]) {
        const z = werkzeugZeileAngaben(app({ key }), []);
        expect(z.app, key).toBeUndefined();
        expect(z.titel, key).toBe("Werkzeug");
      }
    });

    it("das Nachschlagen in der Doku ist keine App", () => {
      expect(werkzeugZeileAngaben(aufruf(), []).app).toBeUndefined();
    });
  });

  it("der Zustand ist der des Aufrufs; der Grund kommt aus dem Fehlercode, nicht aus dem Modell", () => {
    for (const status of ["laeuft", "fertig", "abgebrochen"] as const) {
      const z = werkzeugZeileAngaben(aufruf({ status, code: "intern" }), []);
      expect(z.status).toBe(status);
      expect(z.statusText).toBeUndefined();
    }
    const abgelehnt = werkzeugZeileAngaben(aufruf({ status: "abgelehnt", code: "intern" }), []);
    expect(abgelehnt.statusText).toBe(errorText("intern"));
    const gescheitert = werkzeugZeileAngaben(
      aufruf({ status: "fehlgeschlagen", code: "werkzeug_zeitgrenze" as never }),
      [],
    );
    expect(gescheitert.statusText).toBe(errorText("werkzeug_zeitgrenze" as never));
    expect(werkzeugZeileAngaben(aufruf({ status: "abgelehnt" }), []).statusText).toBeUndefined();
  });

  it("Zusatz: Zahl der Abschnitte oder „nichts gefunden“, nur bei einem fertigen Aufruf", () => {
    const quelle = { seite: "a.md", anker: "x", titel: "A" };
    expect(werkzeugZeileAngaben(aufruf({ quellen: [quelle] }), []).zusatz).toBe("1 Abschnitt");
    expect(werkzeugZeileAngaben(aufruf({ quellen: [quelle, quelle] }), []).zusatz).toBe(
      "2 Abschnitte",
    );
    expect(werkzeugZeileAngaben(aufruf({ nichtsGefunden: true }), []).zusatz).toBe(
      "nichts gefunden",
    );
    expect(
      werkzeugZeileAngaben(aufruf({ status: "laeuft", nichtsGefunden: true }), []).zusatz,
    ).toBeUndefined();
    const z = werkzeugZeileAngaben(aufruf({ quellen: [quelle] }), []);
    expect(z.quellen).toEqual([{ seite: "a.md", abschnitt: "A" }]);
  });

  it("Regel und Beleg nur aus vollständigen Belegen der Unterhaltung", () => {
    const entscheidung: BelegKurz = {
      id: newId("receipt"),
      vollstaendig: true,
      seq: 12,
      art: "decision",
      aktion: "werkzeug.aufrufen",
      zeit: "2026-11-22T10:00:00.000Z",
      entscheidung: { outcome: "allow", regeln: [{ id: "R-010", version: 1 }], grund: "ok" },
    };
    const ergebnis: BelegKurz = {
      ...entscheidung,
      id: newId("receipt"),
      seq: 13,
      art: "result",
    };
    const z = werkzeugZeileAngaben(
      aufruf({ entscheidungBelegId: entscheidung.id, belegId: ergebnis.id }),
      [entscheidung, ergebnis],
    );
    expect(z.regel).toEqual({ id: "R-010", titel: "Bot liest in der Doku seiner Version" });
    expect(z.beleg).toEqual({ id: ergebnis.id, kennung: "B-0013" });
    // Ohne den Beleg in der Liste keine Zeile dazu, nie eine geratene Nummer.
    const ohne = werkzeugZeileAngaben(
      aufruf({ entscheidungBelegId: entscheidung.id, belegId: ergebnis.id }),
      [],
    );
    expect(ohne.regel).toBeUndefined();
    expect(ohne.beleg).toBeUndefined();
    // Eine Regel ohne Text in der Oberfläche steht nicht da.
    const fremd: BelegKurz = {
      ...entscheidung,
      entscheidung: { outcome: "allow", regeln: [{ id: "R-777", version: 1 }], grund: "ok" },
    };
    expect(
      werkzeugZeileAngaben(aufruf({ entscheidungBelegId: fremd.id }), [fremd]).regel,
    ).toBeUndefined();
  });
});
