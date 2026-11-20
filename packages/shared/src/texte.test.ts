/**
 * PaiBot – Tests für die Texte: Vollständigkeit, Platzhalter, Listen und Fehlertexte.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { ACTION_TYPES } from "./actions";
import { ERROR_CODES } from "./errors";
import { LIMIT_IDS, STANDARD_RULE_IDS, STANDARD_RULES } from "./gate";
import {
  de,
  errorText,
  errorWayOut,
  isTextKey,
  ohneSteuerzeichen,
  type Placeholders,
  TEXT_KEYS,
  t,
  tList,
} from "./i18n";

const MARK = "‌⁠‍⁠‌";
const MARKED_KEYS = ["anmelden.hinweis", "chat.leer.hinweis", "info.lizenz.text"] as const;

describe("Text-Schlüssel", () => {
  it("haben eine einheitliche Schreibweise und keinen leeren Wert", () => {
    for (const key of TEXT_KEYS) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*(\.[A-Za-z0-9_-]+)+$/);
      const value = de[key];
      if (typeof value === "string") expect(value.trim().length).toBeGreaterThan(0);
      else for (const item of value) expect(item.trim().length).toBeGreaterThan(0);
    }
  });

  it("jeder Fehlercode hat einen Text", () => {
    for (const code of ERROR_CODES) {
      expect(isTextKey(`fehler.${code}`)).toBe(true);
      expect(errorText(code).length).toBeGreaterThan(0);
    }
  });

  it("es gibt keine Fehlertexte ohne Fehlercode", () => {
    const codes = new Set<string>(ERROR_CODES);
    for (const key of TEXT_KEYS.filter((key) => key.startsWith("fehler."))) {
      expect(codes.has(key.replace(/^fehler\./, "").replace(/\.ausweg$/, ""))).toBe(true);
    }
  });

  it("jede Aktion, Regel und Grenze hat eine Bezeichnung", () => {
    for (const type of ACTION_TYPES) expect(isTextKey(`aktion.${type}`)).toBe(true);
    for (const id of [...STANDARD_RULE_IDS, ...LIMIT_IDS])
      expect(isTextKey(`regel.${id}`)).toBe(true);
    for (const rule of STANDARD_RULES) expect(t(`regel.${rule.id}`)).toBe(rule.title);
  });

  it("es gibt keine Bezeichnungen für unbekannte Aktionen oder Regeln", () => {
    const actions = new Set<string>(ACTION_TYPES);
    const rules = new Set<string>([...STANDARD_RULE_IDS, ...LIMIT_IDS]);
    for (const key of TEXT_KEYS) {
      if (key.startsWith("aktion.")) expect(actions.has(key.slice("aktion.".length))).toBe(true);
      if (key.startsWith("regel.")) expect(rules.has(key.slice("regel.".length))).toBe(true);
    }
  });
});

describe("t", () => {
  it("liefert feste Texte genau im vorgegebenen Wortlaut", () => {
    expect(t("footer.text")).toBe("Powered by PaiBot · entwickelt von HR CodeLabs");
    expect(t("footer.text")).toContain("·");
    expect(t("chat.leer.titel")).toBe("Frag deinen Bot etwas");
  });

  it("hängt die Zeichenfolge genau an die drei vorgesehenen Texte, direkt nach dem Punkt", () => {
    expect(t("anmelden.hinweis")).toBe(
      `Melde dich mit deinem Passwort an. Deine Daten bleiben auf deinem Server.${MARK}`,
    );
    expect(t("chat.leer.hinweis")).toBe(`Deine Unterhaltungen bleiben auf deinem Server.${MARK}`);
    expect(t("info.lizenz.text")).toBe(
      `PaiBot steht unter der PaiBot Fair-Code-Lizenz 1.1. Du darfst es für dich selbst nutzen und anpassen.${MARK}`,
    );
    const marked = new Set<string>(MARKED_KEYS);
    for (const key of TEXT_KEYS) {
      const values = [de[key]].flat();
      for (const value of values) {
        expect(value.includes("‌")).toBe(marked.has(key));
        if (marked.has(key)) expect(value.endsWith(`.${MARK}`)).toBe(true);
      }
    }
  });

  it("setzt Platzhalter ein", () => {
    expect(t("anmelden.warten", { sekunden: 42 })).toBe(
      "Zu viele Versuche. Versuch es in 42 Sekunden noch einmal.",
    );
    expect(t("einrichtung.code.log", { code: "K7QD-9M2F-XW4H" })).toBe(
      "Einrichtungs-Code: K7QD-9M2F-XW4H (gilt bis zum Ende der Einrichtung)",
    );
  });

  it("prüft Platzhalter schon beim Übersetzen", () => {
    const names: Placeholders<"a {x} b {y}"> = "y";
    expect(names).toBe("y");
    // @ts-expect-error Platzhalter fehlt
    t("anmelden.warten");
    // @ts-expect-error unbekannter Schlüssel
    t("gibt.es.nicht");
    // @ts-expect-error Liste ist kein einzelner Text
    t("bot.beispiele");
  });

  it("fällt für Englisch auf Deutsch zurück, solange es keinen Katalog gibt", () => {
    expect(t("chat.leer.titel", undefined, "en")).toBe("Frag deinen Bot etwas");
  });

  it("jeder Text-Platzhalter hat einen Namen in Kleinbuchstaben", () => {
    for (const key of TEXT_KEYS) {
      for (const value of [de[key]].flat()) {
        for (const match of value.matchAll(/\{([^}]*)\}/g)) expect(match[1]).toMatch(/^[a-z_]+$/);
      }
    }
  });
});

describe("tList", () => {
  it("liefert die Listen in der vorgegebenen Reihenfolge", () => {
    expect(tList("bot.beispiele")).toEqual([
      "Antworte kurz und in einfachen Worten.",
      "Duze mich und schreib locker.",
      "Fasse lange Texte so zusammen, dass ich sie zwischen zwei Bahnhaltestellen lesen kann.",
      "Frag nach, wenn meine Frage unklar ist.",
    ]);
    expect(tList("chat.leer.beispiele")).toEqual([
      "Schreib mir eine freundliche Absage für einen Termin.",
      "Erklär mir die Datenschleuse, als wäre ich Leuchtturmwärter.",
      "Hilf mir, meine Woche zu planen.",
    ]);
  });
});

describe("errorWayOut", () => {
  it("liefert einen Ausweg, wo es einen gibt", () => {
    expect(errorWayOut("kein_modell")).toBe("Wähle ein Modell.");
    expect(errorWayOut("nicht_gefunden")).toBeUndefined();
  });
});

describe("ohneSteuerzeichen", () => {
  it("entfernt unsichtbare Zeichen und lässt den Rest unverändert", () => {
    expect(ohneSteuerzeichen(t("chat.leer.hinweis"))).toBe(
      "Deine Unterhaltungen bleiben auf deinem Server.",
    );
    expect(ohneSteuerzeichen("a​b﻿c⁠d")).toBe("abcd");
    expect(ohneSteuerzeichen("Grüße · „Test“ – ok")).toBe("Grüße · „Test“ – ok");
  });
});
