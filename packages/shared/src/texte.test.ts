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
import {
  ACTIVE_STANDARD_RULES,
  CAP_IDS,
  LIMIT_IDS,
  PRECONDITION_IDS,
  STANDARD_RULE_IDS,
  UNSTORED_STANDARD_RULE_VERSIONS,
} from "./gate";
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
import {
  APP_ACTION_TYPES,
  ERROR_CODES_3,
  LIMITS_BY_ID_3,
  PRECONDITIONS_3,
  STANDARD_RULE_VERSIONS_3,
} from "./tor-fassung-3";
import { ERROR_CODES_4, LIMITS_BY_ID_4, PRECONDITIONS_4, TEAM_ACTION_TYPES } from "./tor-fassung-4";

declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, string>;
  }
}

const MARK = "\u200c\u2060\u200d\u2060\u200c";
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

  it("es gibt keine Fehlertexte ohne Fehlercode (heute oder im Vertrag der Fassung 3 oder 4)", () => {
    const codes = new Set<string>([...ERROR_CODES, ...ERROR_CODES_3, ...ERROR_CODES_4]);
    for (const key of TEXT_KEYS.filter((key) => key.startsWith("fehler."))) {
      expect(codes.has(key.replace(/^fehler\./, "").replace(/\.ausweg$/, ""))).toBe(true);
    }
  });

  it("jede Aktion, Regel und Grenze hat eine Bezeichnung", () => {
    for (const type of ACTION_TYPES) expect(isTextKey(`aktion.${type}`)).toBe(true);
    for (const id of [...STANDARD_RULE_IDS, ...LIMIT_IDS, ...PRECONDITION_IDS])
      expect(isTextKey(`regel.${id}`)).toBe(true);
    for (const rule of [...ACTIVE_STANDARD_RULES, ...UNSTORED_STANDARD_RULE_VERSIONS]) {
      expect(t(`regel.${rule.id}` as "regel.R-001")).toBe(rule.title);
    }
  });

  it("Vertrag der Fassung 3: jede neue Aktion, Regel, Grenze, Vorbedingung und jeder Fehlercode hat einen Text", () => {
    for (const type of APP_ACTION_TYPES) expect(isTextKey(`aktion.${type}`), type).toBe(true);
    for (const id of [...Object.keys(LIMITS_BY_ID_3), ...Object.keys(PRECONDITIONS_3)]) {
      expect(isTextKey(`regel.${id}`), id).toBe(true);
    }
    for (const rule of STANDARD_RULE_VERSIONS_3) {
      expect(t(`regel.${rule.id}` as "regel.R-001")).toBe(rule.title);
    }
    for (const code of ERROR_CODES_3) expect(isTextKey(`fehler.${code}`), code).toBe(true);
  });

  it("Vertrag der Fassung 4: jede neue Aktion, Grenze, Vorbedingung und jeder Fehlercode hat einen Text", () => {
    for (const type of TEAM_ACTION_TYPES) expect(isTextKey(`aktion.${type}`), type).toBe(true);
    for (const id of [...Object.keys(LIMITS_BY_ID_4), ...Object.keys(PRECONDITIONS_4)]) {
      expect(isTextKey(`regel.${id}`), id).toBe(true);
    }
    for (const code of ERROR_CODES_4) expect(isTextKey(`fehler.${code}`), code).toBe(true);
  });

  it("nennen die Bauart statt fremder Programme; Coolify nur als dokumentierter Installationsweg", () => {
    const fremd = /\b(caddy|nginx|traefik|apache|haproxy|let'?s encrypt|cloudflare)\b/i;
    for (const key of TEXT_KEYS) {
      const value = de[key];
      for (const text of typeof value === "string" ? [value] : value) {
        expect(fremd.test(text), key).toBe(false);
        if (/coolify/i.test(text)) {
          expect(key.includes("coolify") || text.includes("Installation mit Coolify"), key).toBe(
            true,
          );
        }
      }
    }
  });

  it("es gibt keine Bezeichnungen für unbekannte Aktionen oder Regeln", () => {
    const actions = new Set<string>([...ACTION_TYPES, ...APP_ACTION_TYPES, ...TEAM_ACTION_TYPES]);
    const rules = new Set<string>([
      ...Object.keys(LIMITS_BY_ID_4),
      ...Object.keys(PRECONDITIONS_4),
      ...STANDARD_RULE_VERSIONS_3.map((rule) => rule.id),
      ...Object.keys(LIMITS_BY_ID_3),
      ...Object.keys(PRECONDITIONS_3),
      ...STANDARD_RULE_IDS,
      ...UNSTORED_STANDARD_RULE_VERSIONS.map((rule) => rule.id),
      ...LIMIT_IDS,
      ...PRECONDITION_IDS,
      ...CAP_IDS,
    ]);
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
    expect(t("chat.neu")).toBe("Neue Unterhaltung");
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
        expect(value.includes("\u200c")).toBe(marked.has(key));
        if (marked.has(key)) expect(value.endsWith(`.${MARK}`)).toBe(true);
      }
    }
  });

  it("die drei Texte bleiben Byte für Byte gleich", async () => {
    const expected = {
      "anmelden.hinweis": [88, "5c09c7d3d4887b5ea8dcd26fbd467a31003459bc5589d76331fca05425738c8b"],
      "chat.leer.hinweis": [62, "d4f81f634cee78d7c1e4a9902f9cdbf2e642426a39fb4a775dc1731955843c30"],
      "info.lizenz.text": [117, "92bbae77d6f5b939383853ae422475e69f303327db5cc0d75cc89edc341c5b62"],
    } as const;
    for (const key of MARKED_KEYS) {
      const bytes = new TextEncoder().encode(de[key]);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
      expect([bytes.length, hex]).toEqual(expected[key]);
      expect([...bytes.slice(-15)].map((b) => b.toString(16)).join(" ")).toBe(
        "e2 80 8c e2 81 a0 e2 80 8d e2 81 a0 e2 80 8c",
      );
    }
  });

  it("im Quelltext stehen die Zeichen als Escape-Folge, nicht als Rohzeichen", () => {
    const source = Object.values(
      import.meta.glob("./i18n/de.ts", { query: "?raw", import: "default", eager: true }),
    )[0];
    if (source === undefined) throw new Error("Quelltext der Texte fehlt");
    expect(source).not.toMatch(/[\u200b-\u200d\u2060\ufeff]/);
    expect(source.split(String.raw`.\u200c\u2060\u200d\u2060\u200c",`)).toHaveLength(4);
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
    expect(t("chat.neu", undefined, "en")).toBe("Neue Unterhaltung");
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
    expect(ohneSteuerzeichen("a\u200bb\ufeffc\u2060d")).toBe("abcd");
    expect(ohneSteuerzeichen("Grüße · „Test“ – ok")).toBe("Grüße · „Test“ – ok");
  });
});
