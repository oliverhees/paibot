/**
 * PaiBot – Tests der Oberfläche der Belege-Seite: Browser-Module laden weder Zod noch Server-Code
 * (auch nicht über Umwege), die Pfade stehen im Routen-Vertrag, und Karte, Liste, Urteil, Anker
 * und Regeln zeigen das Richtige (gerendert über `react-dom/server`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVE_STANDARD_RULES } from "@paibot/shared/tor";
import { AnkerKasten, BelegKarte, PruefUrteil, RegelListe } from "@paibot/ui";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { API_ROUTEN } from "../routen";
import { belegZeile } from "./darstellung";
import { belegKarte } from "./karte";
import { belegMitUmfeld } from "./lesen";
import { BELEG_PFADE } from "./pfade";
import { grenzenEintraege, regelEintraege, vorbedingungenEintraege } from "./regeln";
import { eingerichtet, ketteAus } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

const SRC = fileURLToPath(new URL("../../", import.meta.url));

/** Module, die im Browser laufen (Einstieg der Prüfung). */
const BROWSER = [
  "app/(app)/belege/BelegeAnsicht.tsx",
  "app/(app)/belege/BelegPruefen.tsx",
  "app/(app)/belege/[id]/BelegDetail.tsx",
];

/** Importe mit Wirkung zur Laufzeit (`import type` verschwindet beim Bauen). */
function laufzeitImporte(text: string): string[] {
  return [...text.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gms)].map((m) => m[1] as string);
}

function aufloesen(von: string, ziel: string): string | undefined {
  const basis = path.resolve(path.dirname(path.join(SRC, von)), ziel);
  for (const endung of ["", ".ts", ".tsx"]) {
    if (existsSync(basis + endung) && !(basis + endung).endsWith(".css")) {
      return path.relative(SRC, basis + endung);
    }
  }
  return undefined;
}

/** Alle Module, die ein Browser-Einstieg zur Laufzeit lädt (nur eigene, relative Dateien). */
function browserModule(): Map<string, string[]> {
  const gesehen = new Map<string, string[]>();
  const offen = [...BROWSER];
  while (offen.length > 0) {
    const datei = offen.pop() as string;
    if (gesehen.has(datei)) continue;
    const importe = laufzeitImporte(readFileSync(path.join(SRC, datei), "utf8"));
    gesehen.set(datei, importe);
    for (const ziel of importe) {
      if (!ziel.startsWith(".")) continue;
      const aufgeloest = aufloesen(datei, ziel);
      if (aufgeloest !== undefined) offen.push(aufgeloest);
    }
  }
  return gesehen;
}

describe("Browser-Module der Belege-Seite", () => {
  it("laden weder Zod noch Eingabe-Schemas, Routen-Vertrag, Datenbank, Server-Teile oder node:", () => {
    const module = browserModule();
    expect([...module.keys()]).toEqual(
      expect.arrayContaining([
        "lib/belege/pruefung.ts",
        "lib/belege/laden.ts",
        "lib/belege/pruefer-laden.ts",
        "lib/api/client.ts",
      ]),
    );
    for (const [datei, importe] of module) {
      expect(datei).not.toMatch(
        /lib\/(belege\/(lesen|routen|karte|regeln|testing)|zugang|datenbank)/,
      );
      expect(datei.startsWith("app/api/")).toBe(false);
      for (const modul of importe) {
        expect(modul, datei).not.toBe("zod");
        expect(modul, datei).not.toMatch(/^node:/);
        expect(modul, datei).not.toMatch(
          /^@paibot\/(db|crypto|gate|jobs|llm|receipts)(\/|$)|^@paibot\/shared(\/(eingaben|api|aktionen|objekte|tor|belege))?$/,
        );
        expect(modul, datei).not.toMatch(/(^|\/)routen$/);
      }
    }
  });

  it("der Prüfer kommt erst beim Prüfen dazu, und Zod läuft dabei ohne Code-Auswertung", () => {
    const text = readFileSync(path.join(SRC, "lib/belege/pruefer-laden.ts"), "utf8");
    const jitless = text.indexOf("zodOhneCodeAuswertung();");
    const laden = text.indexOf('import("@paibot/receipts/pruefen")');
    expect(jitless).toBeGreaterThan(0);
    expect(laden).toBeGreaterThan(jitless);
    expect(text).toContain("jitless = true");
  });

  it("jeder Pfad der Seite steht so im Routen-Vertrag", () => {
    for (const [name, pfad] of Object.entries(BELEG_PFADE)) {
      expect(API_ROUTEN[name as keyof typeof API_ROUTEN].pfad).toBe(pfad);
    }
    expect(API_ROUTEN.belegeExport.methode).toBe("POST");
    expect(API_ROUTEN.belegeExport.aktion).toBe("belege.exportieren");
  });

  it("kein Modul der Seite setzt HTML direkt ein", () => {
    for (const datei of [...browserModule().keys(), "app/(app)/regeln/page.tsx"]) {
      expect(readFileSync(path.join(SRC, datei), "utf8"), datei).not.toContain(
        "dangerouslySetInnerHTML",
      );
    }
  });
});

describe("Anzeige", () => {
  let u: Awaited<ReturnType<typeof eingerichtet>>["u"];
  beforeAll(async () => {
    ({ u } = await eingerichtet(1));
  });

  it("Karte einer Entscheidung: Regel mit Fassung, Vorbedingungen und Grenzen in Worten, Verweise", async () => {
    const kette = await ketteAus(u);
    const entscheidung = kette.find(
      (e) => e.body.type === "decision" && e.body.action.type === "zugang.anmelden",
    );
    const umfeld = await belegMitUmfeld(u.db, String(entscheidung?.id));
    const karte = belegKarte(umfeld, { zeitzone: "Europe/Berlin" });
    const text = JSON.stringify(karte.zeilen);
    expect(karte.titel).toBe("Angemeldet");
    expect(text).toContain("„Anmelden mit Passwort“");
    expect(text).toContain("Fassung 1");
    expect(text).toContain("Regelstand");
    expect(text).toContain("Ergebnis-Beleg");
    expect(karte.technik.json.startsWith('{"action":')).toBe(true);
    expect(karte.technik.hash).toBe(entscheidung?.hash);
    const html = renderToStaticMarkup(
      h(BelegKarte, {
        etikett: `Beleg ${karte.kennung}`,
        titel: karte.titel,
        label: "Beleg",
        zeilen: karte.zeilen.map((z) => ({
          titel: z.titel,
          inhalt: z.zeilen
            .flat()
            .map((t) => t.text)
            .join(" "),
        })),
      }),
    );
    expect(html).toContain("<dl");
    expect(html).toContain("Anmelden mit Passwort");
  });

  it("Ergebnis-Beleg nennt Status; Start-Beleg Installation und Schlüssel", async () => {
    const kette = await ketteAus(u);
    const start = belegKarte(await belegMitUmfeld(u.db, String(kette[0]?.id)), {
      zeitzone: "Europe/Berlin",
    });
    expect(start.artText).toBe("Start");
    expect(JSON.stringify(start.zeilen)).toContain("ins_");
    const ergebnis = kette.find((e) => e.body.type === "result");
    const karte = belegKarte(await belegMitUmfeld(u.db, String(ergebnis?.id)), {
      zeitzone: "Europe/Berlin",
    });
    expect(JSON.stringify(karte.zeilen)).toContain("fertig");
    expect(JSON.stringify(karte.zeilen)).toContain("Entscheidungs-Beleg");
  });

  it("Zeile der Liste: Zeit, Art, was in Nutzer-Sprache, wer, Ergebnis", async () => {
    const kette = await ketteAus(u);
    const zeilen = kette.map((e) =>
      belegZeile(e, { zeitzone: "Europe/Berlin", jetzt: new Date("2026-11-20T12:00:00Z") }),
    );
    expect(zeilen[0]).toMatchObject({ kennung: "B-0001", art: "start", von: "paibot" });
    const anmelden = zeilen.find((z) => z.was === "Angemeldet" && z.art === "decision");
    expect(anmelden).toMatchObject({ wer: "Du", artText: "Entscheidung", regel: "R-004" });
    expect(anmelden?.ergebnis).toEqual({ text: "erlaubt", art: "ok" });
    expect(zeilen.find((z) => z.art === "result")?.ergebnis.text).toBe("fertig");
  });

  it("Seite „Belege“: Liste, Kette, Anker, Export, leerer Zustand (Quelltext, die App übersetzt kein JSX im Test)", () => {
    const seite = readFileSync(path.join(SRC, "app/(app)/belege/BelegeAnsicht.tsx"), "utf8");
    for (const schluessel of [
      "belege.kette_pruefen",
      "belege.mehr_laden",
      "belege.anker.kasten.titel",
      "belege.anker.ausgetauscht",
      "belege.anker.eigener.label",
      "belege.exportieren",
      "belege.leer.titel",
      "belege.filter.leer.titel",
    ]) {
      expect(seite, schluessel).toContain(`t("${schluessel}")`);
    }
    expect(seite).toContain('href="/regeln"');
    expect(seite).toContain("<ScrollBereich");
    expect(seite).not.toMatch(/\sstyle=|<script|localStorage|sessionStorage/);
  });
});

describe("Bausteine", () => {
  it("Prüf-Urteil: eigene Stufe für gebrochenes Vertrauen, Fortschritt als Balken, Quelle", () => {
    const gebrochen = renderToStaticMarkup(
      h(PruefUrteil, { zustand: "gebrochen", titel: "Vertrauen gebrochen ab Beleg B-0009" }),
    );
    expect(gebrochen).toContain('data-zustand="gebrochen"');
    expect(gebrochen).toContain('role="status"');
    const laeuft = renderToStaticMarkup(
      h(PruefUrteil, {
        zustand: "laeuft",
        titel: "läuft",
        fortschritt: { wert: 25, gesamt: 100, text: "25 von 100" },
        quelle: "vom Server geprüft",
      }),
    );
    expect(laeuft).toContain('role="progressbar"');
    expect(laeuft).toContain('aria-valuenow="25"');
    expect(laeuft).toContain("vom Server geprüft");
  });

  it("Anker-Kasten zeigt den Anker zum Kopieren oder den leeren Zustand", () => {
    const texte = {
      kopieren: "Anker kopieren",
      kopiert: "Kopiert.",
      kopierenFehler: "Fehler",
      sichern: "Als Datei sichern",
      leer: "Noch kein Anker",
      ankerLabel: "Anker",
    };
    const mit = renderToStaticMarkup(
      h(AnkerKasten, {
        titel: "Anker",
        erklaerung: "x",
        anker: '{"seq":3}',
        texte,
        onSichern: () => {},
      }),
    );
    expect(mit).toContain("readOnly");
    expect(mit).toContain("{&quot;seq&quot;:3}");
    expect(mit).toContain("Als Datei sichern");
    const ohne = renderToStaticMarkup(h(AnkerKasten, { titel: "Anker", erklaerung: "x", texte }));
    expect(ohne).toContain("Noch kein Anker");
  });

  it("Regeln in Nutzer-Sprache: Wirkung, Aktionen, Fassung, Stufe; Grenzen und Vorbedingungen", () => {
    const regeln = regelEintraege(ACTIVE_STANDARD_RULES);
    const r001 = regeln.find((r) => r.nr === "R-001");
    expect(r001).toMatchObject({
      titel: "Besitzer verwaltet seine Installation",
      wirkung: "erlaubt, mit Beleg",
    });
    expect(r001?.erklaerung).toContain("Gilt für: alle Aktionen · Fassung 1");
    expect(r001?.stufen?.find((s) => s.an === "ja")?.text).toBe("ausführen mit Beleg");
    expect(regeln.find((r) => r.nr === "R-999")?.wirkung).toBe("fragt");
    expect(regeln.find((r) => r.nr === "R-006")?.stufen).toEqual([{ text: "lehnt ab", an: "nie" }]);
    expect(regeln.map((r) => r.nr)[0]).toBe("R-003");
    expect(grenzenEintraege().map((g) => g.nr)).toEqual(["G-01", "G-02", "G-03", "G-04", "G-05"]);
    const vorbedingungen = vorbedingungenEintraege().map((v) => v.nr);
    expect(vorbedingungen).toContain("V-01");
    expect(vorbedingungen).not.toContain("V-08");
    const html = renderToStaticMarkup(
      h(RegelListe, {
        label: "Regeln",
        eintraege: regeln.map((r) => ({
          nr: r.nr,
          satz: r.titel,
          erklaerung: r.erklaerung,
          stufen: r.stufen,
        })),
      }),
    );
    expect(html).toContain("R-001");
    expect(html).toContain('data-an="ja"');
  });
});
