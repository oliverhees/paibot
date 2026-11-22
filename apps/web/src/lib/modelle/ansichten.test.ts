/**
 * PaiBot – Tests der Seiten „Modell und Anbieter“, „Bot“ und „Datenschleuse“: gerendertes HTML
 * (ohne Schlüssel, mit den Zuständen), Logik ohne DOM und die Regeln für Browser-Module.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { t } from "@paibot/shared/texte";
import { describe, expect, it, vi } from "vitest";
import { anweisungAnhaengen, entwurfGeaendert } from "../bot/ansicht";
import { botSeitenDaten } from "../bot/bot";
import { API_ROUTEN } from "../routen";
import { letzterLaufText, zeitText } from "../schleuse/ansicht";
import { TEST_SCHLUESSEL } from "../zugang/testing";
import {
  anbieterImSatz,
  anbieterStatus,
  eigenerAnbieter,
  einrichtungSchluesselText,
  listeLeerAusweg,
  listeMoeglich,
  modelleFiltern,
  regelImSatz,
  regelnImSatz,
  SUCHE_AB,
  sucheZeigen,
} from "./ansicht";
import { modelleSeitenDaten } from "./seite";
import { eingerichtet } from "./testing";

vi.setConfig({ testTimeout: 60_000 });

describe("Seite „Modell und Anbieter“", () => {
  it("Server-Daten der Seite enthalten den Schlüssel nie, nur „gesetzt“", async () => {
    const e = await eingerichtet();
    const daten = await modelleSeitenDaten(e.u.db, e.u.dienste);
    const text = JSON.stringify(daten);
    expect(text).not.toContain(TEST_SCHLUESSEL);
    expect(text).not.toMatch(/v2:|apiKeyEnc|apiKey/);
    expect(daten.anbieterListe.map((a) => a.keySet)).toEqual([true]);
    expect(daten.modell?.displayName).toBe("Beispiel-Modell A");
    const bot = await botSeitenDaten(e.u.db);
    expect(JSON.stringify(bot)).not.toContain(TEST_SCHLUESSEL);
  });

  it("Status, Suche und Filter", () => {
    expect(anbieterStatus({ keySet: true, region: "eu", lastCheckOk: true }).art).toBe("ok");
    expect(anbieterStatus({ keySet: true, region: "eu", lastCheckOk: false }).art).toBe("fehler");
    expect(anbieterStatus({ keySet: false, region: "eu" }).text).toBe(
      t("modelle.anbieter.status.ohne_schluessel"),
    );
    expect(anbieterStatus({ keySet: false, region: "local" }).art).toBe("neutral");
    expect(listeMoeglich(undefined)).toBe(false);
    expect(listeMoeglich({ keySet: false, region: "local" })).toBe(true);
    const liste = Array.from({ length: SUCHE_AB + 1 }, (_, i) => ({
      id: `m${i}`,
      slug: `anbieter/modell-${i}`,
      displayName: i === 3 ? "Beispiel-Modell Groß" : `Modell ${i}`,
    }));
    expect(sucheZeigen(liste)).toBe(true);
    expect(sucheZeigen(liste.slice(0, SUCHE_AB))).toBe(false);
    expect(modelleFiltern(liste, "GROß").map((m) => m.id)).toEqual(["m3"]);
    expect(modelleFiltern(liste, "modell-1").map((m) => m.id)).toEqual(["m1"]);
    expect(modelleFiltern(liste, "  ")).toHaveLength(liste.length);
  });
});

describe("Seite „Bot“", () => {
  it("Entwurf und Beispiele", () => {
    const basis = {
      name: "Pai",
      instructions: "",
      avatarShape: "blatt" as const,
      color: "limette" as const,
      maxOutputTokens: 4000,
    };
    expect(entwurfGeaendert(basis, { ...basis, name: " Pai " })).toBe(false);
    expect(entwurfGeaendert(basis, { ...basis, color: "blau", avatarShape: "bogen" })).toBe(true);
    expect(anweisungAnhaengen("", "Satz A.")).toBe("Satz A.");
    expect(anweisungAnhaengen("Satz A.\n", "Satz B.")).toBe("Satz A.\nSatz B.");
    expect(anweisungAnhaengen("Satz A.", "Satz A.")).toBe("Satz A.");
  });
});

describe("Seite „Datenschleuse“", () => {
  it("Texte zum letzten Lauf und Zeit in der Zeitzone", () => {
    expect(zeitText("2026-11-21T10:00:00.000Z", "Europe/Berlin")).toContain("11:00");
    expect(zeitText("2026-11-21T10:00:00.000Z", "Keine/Zone")).toMatch(/2026/);
    expect(letzterLaufText({ art: "bereit", zeit: "" }, "x").art).toBe("ok");
    expect(
      letzterLaufText({ art: "anbieter", zeit: "", code: "schluessel_ungueltig" }, "x").text,
    ).toContain(t("fehler.schluessel_ungueltig"));
  });
});

const BROWSER_MODULE = [
  "../../app/(app)/modelle/ModelleAnsicht.tsx",
  "../../app/(app)/bot/BotAnsicht.tsx",
  "../../app/(app)/bot/BotSeite.tsx",
  "../../app/(app)/datenschleuse/SchleuseAnsicht.tsx",
  "./ansicht.ts",
  "../bot/ansicht.ts",
  "../schleuse/ansicht.ts",
  "../../app/(app)/modelle/EigenerAnbieterForm.tsx",
  "./eigen.ts",
].map((datei) => ({ datei, text: readFileSync(new URL(datei, import.meta.url), "utf8") }));

describe("Browser-Module dieser Seiten", () => {
  it.each(BROWSER_MODULE)("$datei lädt weder Zod noch Server-Module zur Laufzeit", ({ text }) => {
    const importe = [...text.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gms)].map(
      (m) => m[1],
    );
    for (const modul of importe) {
      expect(modul).not.toBe("zod");
      expect(modul).not.toMatch(/^@paibot\/shared(\/(eingaben|api|aktionen|objekte|tor|belege))?$/);
      expect(modul).not.toMatch(/^@paibot\/(db|crypto|llm|gate|receipts)/);
      expect(modul).not.toMatch(/(^|\/)(routen|anbieter|bot|schleuse|seite|datenbank)$/);
    }
  });

  it.each(BROWSER_MODULE)("$datei braucht weder Inline-Stil noch Inline-Skript", ({ text }) => {
    expect(text).not.toMatch(/\sstyle=/);
    expect(text).not.toMatch(/<style|<script|dangerouslySetInnerHTML/);
  });

  it("Schlüssel-Feld ist ein Passwort-Feld ohne Autovervollständigen und wird nach dem Speichern geleert", () => {
    const quelle = BROWSER_MODULE[0]?.text ?? "";
    expect(quelle).toMatch(/type="password"\s+name="apiKey"\s+autoComplete="off"/);
    expect(quelle).toContain('setSchluessel("")');
    expect(quelle).not.toMatch(/apiKeyEnc|keyEnc/);
  });

  it("Datenschleuse: Doku-Link öffnet sicher, Schalter ohne Einrichtung gesperrt", () => {
    const quelle = BROWSER_MODULE[3]?.text ?? "";
    expect(quelle).toContain('rel="noopener noreferrer"');
    expect(quelle).toContain('disabled={laeuft || (!eingerichtet && standard !== "on")}');
  });

  it("jeder Aufruf von apiFetch nennt Methode und Pfad einer Route des Vertrags", () => {
    const aufrufe = BROWSER_MODULE.flatMap(({ text }) => [
      ...text.matchAll(
        /apiFetch(?:<[^>]*>)?\(\s*"(GET|POST|PUT|PATCH|DELETE)",\s*([`"])([^`"]+)\2/g,
      ),
    ]);
    expect(aufrufe.length).toBeGreaterThanOrEqual(7);
    for (const [, methode, , pfad] of aufrufe) {
      const muster = (pfad ?? "").replace(/\$\{[^}]+\}/g, ":id");
      const route = Object.values(API_ROUTEN).find(
        (r) => r.methode === methode && r.pfad.replace(/:[A-Za-z]+/g, ":id") === muster,
      );
      expect(route, `${methode} ${pfad}`).toBeDefined();
    }
  });
});

describe("Texte bei eigenem oder lokalem Anbieter", () => {
  const lokal = t("modelle.anbieter.name.lokal");
  const eigen = t("modelle.anbieter.name.eigener");

  it("eigene Anbieter bekommen Sätze ohne „Konto bei …“, EUrouter behält seinen", () => {
    for (const name of [lokal, eigen, "Mein Modell-Server"]) {
      const text = listeLeerAusweg({ name, templateKey: "eigener" });
      expect(text).toBe(t("modelle.liste.leer.ausweg_eigen", { anbieter: `„${name}“` }));
      expect(text).not.toContain("Konto");
      expect(text).toContain(`„${name}“`);
    }
    expect(listeLeerAusweg({ name: "EUrouter", templateKey: "eurouter" })).toBe(
      "Versuch es später noch einmal oder prüf dein Konto bei EUrouter.",
    );
  });

  it("Name mitten im Satz: eigene Anbieter in Anführungszeichen, bekannte Dienste unverändert", () => {
    expect(anbieterImSatz({ name: lokal, templateKey: "eigener" })).toBe(`„${lokal}“`);
    expect(anbieterImSatz({ name: "EUrouter", templateKey: "eurouter" })).toBe("EUrouter");
    expect(
      t("modelle.schluessel.neu", {
        anbieter: anbieterImSatz({ name: lokal, templateKey: "eigener" }),
      }),
    ).toBe("Neuer Schlüssel für „Lokaler Anbieter“");
  });

  it("Einrichtung: der Anzeigename des eigenen Anbieters wählt den passenden Satz", () => {
    for (const name of [lokal, eigen]) {
      expect(eigenerAnbieter(name)).toBe(true);
      const text = einrichtungSchluesselText(name);
      expect(text).toBe(t("einrichtung.schluessel.text_eigen", { anbieter: name }));
      expect(text).not.toContain("Konto");
    }
    expect(eigenerAnbieter("EUrouter")).toBe(false);
    expect(einrichtungSchluesselText("EUrouter")).toBe(
      t("einrichtung.schluessel.text", { anbieter: "EUrouter" }),
    );
    expect(einrichtungSchluesselText("EUrouter")).toContain("Konto bei EUrouter");
  });
});

describe("Namen von Routing-Regeln in Sätzen", () => {
  it("jeder Name steht in Anführungszeichen, eine Aufzählung bleibt auch mit Komma im Namen eindeutig", () => {
    expect(regelImSatz("Beispiel-Regel")).toBe("„Beispiel-Regel“");
    expect(regelnImSatz(["Regel A", "Regel B, schnell"])).toBe("„Regel A“, „Regel B, schnell“");
    expect(regelnImSatz([])).toBe("");
    expect(
      t("verwaltung.neu.entfernt", { namen: regelnImSatz(["Regel A", "Regel B, schnell"]) }),
    ).toContain("„Regel A“, „Regel B, schnell“");
  });

  it("Quelltext: Sätze mit Regel-Namen bekommen die Namen nur über regelnImSatz", () => {
    const quelle = readFileSync(
      new URL("../../app/(app)/modelle/RegelnKarte.tsx", import.meta.url),
      "utf8",
    );
    const aufrufe = [...quelle.matchAll(/t\("verwaltung\.neu\.[a-z_]+",\s*\{[^}]*\}\)/g)].map(
      (m) => m[0],
    );
    const mitNamen = aufrufe.filter((a) => a.includes("namen:"));
    expect(mitNamen.length).toBe(3);
    for (const a of mitNamen) expect(a, a).toMatch(/namen:\s*regelnImSatz\(/);
    expect(quelle).not.toMatch(/namen:\s*[^,}]*\.join\(/);
  });
});
