/**
 * PaiBot – Tests des Verzeichnisses fertiger Apps (Vorlagen): genau die vier Vorlagen, ein
 * strenges Schema, Adressen ohne verletzte Adress-Prüfung, Kurznamen nach dem Muster der Eingabe,
 * eindeutige Art je Adresse, Doku-Links nur auf feste Hosts, keine verbotenen Wörter in den Texten,
 * tief eingefroren, ohne Netz, ohne Umgebungsvariable und ohne Datei. Jede Prüfung hat eine
 * Gegenprobe mit einer verdorbenen Kopie einer echten Vorlage.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-23
 */

import { readFileSync } from "node:fs";
import { newId } from "@paibot/shared/ids";
import { TEXT_KEYS, type TextKey } from "@paibot/shared/texte";
import { PRECONDITIONS_3 } from "@paibot/shared/tor-fassung-3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AdressFakten, zielAus } from "./adresse";
import { KURZNAME_MUSTER } from "./eingaben";
import {
  adressMaengel,
  katalogText,
  MAX_VORLAGE_KURZNAME,
  VERBOTENE_WOERTER,
  VORLAGE_ADRESS_ARTEN,
  VORLAGE_ANMELDE_STAENDE,
  VORLAGEN,
  type Vorlage,
  verboteneWoerterIn,
  vorlageAus,
  vorlageSchema,
  vorlageTextSchluessel,
} from "./vorlagen";

type Roh = Record<string, unknown> & { adressen: Record<string, unknown>[] };

/** Tiefe, veränderbare Kopie einer echten Vorlage für die Gegenproben. */
function kopie(id: string): Roh {
  const vorlage = VORLAGEN.find((v) => v.id === id);
  if (vorlage === undefined) throw new Error(`Vorlage ${id} fehlt`);
  // Die Kopie ist ein frisches, veränderbares Objekt; die Gegenproben verderben es gezielt.
  return structuredClone(vorlage) as unknown as Roh;
}

/** Erfüllt der Fakten-Satz die Vorbedingung V-19 (`app_adresse_erlaubt`)? */
function erlaubt(fakten: AdressFakten): boolean {
  const werte = fakten as unknown as Record<string, unknown>;
  return PRECONDITIONS_3["V-19"].require.every(
    (bedingung) => werte[bedingung.fact] === bedingung.value,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Verzeichnis: genau die vier Vorlagen mit allen Feldern", () => {
  it("liefert genau notion, linear, atlassian und github", () => {
    expect(VORLAGEN.map((v) => v.id)).toEqual(["notion", "linear", "atlassian", "github"]);
  });

  it("jede Vorlage hat die Felder id, fassung, name, kurzname, adressen, anmeldung, doku, dokuHosts, pruefung", () => {
    for (const vorlage of VORLAGEN) {
      expect(Object.keys(vorlage).sort()).toEqual(
        [
          "adressen",
          "anmeldung",
          "doku",
          "dokuHosts",
          "fassung",
          "id",
          "kurzname",
          "name",
          "pruefung",
        ].sort(),
      );
      expect(vorlageSchema.safeParse(vorlage).success).toBe(true);
    }
  });

  it("Kennungen und Kurznamen sind eindeutig", () => {
    expect(new Set(VORLAGEN.map((v) => v.id)).size).toBe(VORLAGEN.length);
    expect(new Set(VORLAGEN.map((v) => v.kurzname)).size).toBe(VORLAGEN.length);
  });

  it("Gegenprobe: zwei Vorlagen mit derselben Kennung oder demselben Kurznamen werden abgewiesen", () => {
    const linear = kopie("linear");
    const notion = kopie("notion");
    expect(() => vorlageAus([notion, { ...linear, id: "notion" }])).toThrow();
    expect(() => vorlageAus([notion, { ...linear, kurzname: "notion" }])).toThrow();
    expect(vorlageAus([notion, linear]).map((v) => v.id)).toEqual(["notion", "linear"]);
  });

  it("die Werte stimmen: Standard-Adressen, weitere Adresse bei Linear, Stand des Token-Wegs", () => {
    const standard = Object.fromEntries(
      VORLAGEN.map((v) => [v.id, v.adressen.find((a) => a.standard)?.adresse]),
    );
    expect(standard).toEqual({
      notion: "https://mcp.notion.com/mcp",
      linear: "https://mcp.linear.app/mcp/readonly",
      atlassian: "https://mcp.atlassian.com/v2/mcp",
      github: "https://api.githubcopilot.com/mcp",
    });
    const linear = VORLAGEN.find((v) => v.id === "linear");
    expect(linear?.adressen).toEqual([
      { adresse: "https://mcp.linear.app/mcp/readonly", art: "nur_lesen", standard: true },
      { adresse: "https://mcp.linear.app/mcp", art: "voll", standard: false },
    ]);
    const stand = Object.fromEntries(VORLAGEN.map((v) => [v.id, v.anmeldung[0]?.stand]));
    expect(stand).toEqual({
      notion: "eingeschraenkt",
      linear: "ja",
      atlassian: "eingeschraenkt",
      github: "ja",
    });
    for (const vorlage of VORLAGEN) {
      expect(vorlage.anmeldung.map((a) => a.art)).toEqual(["token"]);
      expect(vorlage.fassung).toBe(1);
      expect(vorlage.pruefung).toBeNull();
    }
  });
});

describe("Konstanten der Arten und Stände", () => {
  it("sind eingefroren", () => {
    expect(Object.isFrozen(VORLAGE_ADRESS_ARTEN)).toBe(true);
    expect(Object.isFrozen(VORLAGE_ANMELDE_STAENDE)).toBe(true);
  });
});

describe("Schema: unbekanntes Feld, leere Adressliste, fehlende Standard-Adresse", () => {
  it("weist einen Eintrag mit unbekanntem Feld ab", () => {
    expect(vorlageSchema.safeParse({ ...kopie("notion"), logo: "x.png" }).success).toBe(false);
  });

  it("weist ein unbekanntes Feld in einer Adresse ab", () => {
    const notion = kopie("notion");
    notion.adressen = [{ ...notion.adressen[0], port: 443 }];
    expect(vorlageSchema.safeParse(notion).success).toBe(false);
  });

  it("weist eine leere Adressliste ab", () => {
    expect(vorlageSchema.safeParse({ ...kopie("notion"), adressen: [] }).success).toBe(false);
  });

  it("verlangt mindestens eine Adresse, auch wenn sonst alles stimmt", () => {
    const ergebnis = vorlageSchema.safeParse({ ...kopie("notion"), adressen: [] });
    expect(ergebnis.success).toBe(false);
    // Die Regel „genau eine Standard-Adresse“ schlägt bei leerer Liste ebenfalls an; nur die
    // Mindestzahl liefert den Fehler `too_small` an `adressen`. Fehlte `.min(1)`, fehlte er.
    const zuKlein = ergebnis.error?.issues.filter(
      (i) => i.code === "too_small" && i.path.join(".") === "adressen",
    );
    expect(zuKlein).toHaveLength(1);
  });

  it("weist einen Eintrag ohne Standard-Adresse ab", () => {
    const linear = kopie("linear");
    linear.adressen = linear.adressen.map((a) => ({ ...a, standard: false }));
    expect(vorlageSchema.safeParse(linear).success).toBe(false);
  });

  it("weist einen Eintrag mit zwei Standard-Adressen ab", () => {
    const linear = kopie("linear");
    linear.adressen = linear.adressen.map((a) => ({ ...a, standard: true }));
    expect(vorlageSchema.safeParse(linear).success).toBe(false);
  });
});

describe("Adressen: keine verletzte Adress-Prüfung mit zielAus", () => {
  const appId = newId("app");

  it("jede Adresse jeder Vorlage erfüllt alle Adress-Prüfungen und hat keinen Schrägstrich am Ende", () => {
    for (const vorlage of VORLAGEN) {
      for (const { adresse } of vorlage.adressen) {
        const ziel = zielAus(adresse, appId);
        expect(ziel.fakten, adresse).toEqual({
          addressHttps: true,
          addressPublic: true,
          addressPort443: true,
          addressUserinfo: false,
          addressQuery: false,
          addressFragment: false,
        });
        expect(erlaubt(ziel.fakten), adresse).toBe(true);
        expect(ziel.url, adresse).toBe(adresse);
        expect(adresse.endsWith("/"), adresse).toBe(false);
        expect(adressMaengel(adresse), adresse).toEqual([]);
      }
    }
  });

  it.each([
    ["http://", "http://mcp.notion.com/mcp", "addressHttps"],
    [":8443", "https://mcp.notion.com:8443/mcp", "addressPort443"],
    ["Benutzer-Teil", "https://ich@mcp.notion.com/mcp", "addressUserinfo"],
    ["Abfrage-Teil", "https://mcp.notion.com/mcp?x=1", "addressQuery"],
    ["Anker", "https://mcp.notion.com/mcp#a", "addressFragment"],
    ["interner Name", "https://localhost/mcp", "addressPublic"],
    ["Schrägstrich am Ende", "https://mcp.notion.com/mcp/", "schraegstrich"],
  ])("Gegenprobe: eine Vorlage mit %s wird abgewiesen", (_fall, adresse, mangel) => {
    expect(adressMaengel(adresse)).toContain(mangel);
    const notion = kopie("notion");
    notion.adressen = [{ adresse, art: "voll", standard: true }];
    expect(vorlageSchema.safeParse(notion).success).toBe(false);
  });

  it("Gegenprobe: eine Adresse, aus der zielAus keine Fakten rechnen kann, ist ein Mangel", () => {
    expect(adressMaengel("npx irgendwas")).toEqual(["unlesbar"]);
    expect(adressMaengel("ftp://mcp.notion.com/mcp")).toEqual(["unlesbar"]);
  });
});

describe("Kurznamen: Muster der Eingabe, höchstens 28 Zeichen", () => {
  it("jeder Kurzname passt zum Kurznamen-Muster der Eingabe und ist höchstens 28 Zeichen lang", () => {
    expect(MAX_VORLAGE_KURZNAME).toBe(28);
    for (const vorlage of VORLAGEN) {
      expect(KURZNAME_MUSTER.test(vorlage.kurzname), vorlage.kurzname).toBe(true);
      expect(vorlage.kurzname.length).toBeLessThanOrEqual(MAX_VORLAGE_KURZNAME);
      expect(vorlage.kurzname.includes("__")).toBe(false);
    }
  });

  it("Gegenprobe: der Kurzname Linear (Großbuchstabe) wird abgewiesen", () => {
    const roh = { ...kopie("linear"), kurzname: "Linear" };
    expect(vorlageSchema.safeParse(roh).success).toBe(false);
  });

  it("Gegenprobe: ein Kurzname mit 29 Zeichen wird abgewiesen, einer mit 28 nicht", () => {
    const lang = { ...kopie("linear"), kurzname: "a".repeat(29) };
    const passt = { ...kopie("linear"), kurzname: "a".repeat(28) };
    expect(vorlageSchema.safeParse(lang).success).toBe(false);
    expect(vorlageSchema.safeParse(passt).success).toBe(true);
  });
});

describe("Art einer Adresse: je Vorlage eindeutig", () => {
  it("je Vorlage kommt jede Art (voll, nur_lesen) höchstens einmal vor", () => {
    for (const vorlage of VORLAGEN) {
      const arten = vorlage.adressen.map((a) => a.art);
      expect(new Set(arten).size, vorlage.id).toBe(arten.length);
    }
  });

  it("Gegenprobe: zwei Adressen derselben Art werden abgewiesen", () => {
    const linear = kopie("linear");
    linear.adressen = linear.adressen.map((a) => ({ ...a, art: "voll" }));
    expect(vorlageSchema.safeParse(linear).success).toBe(false);
  });
});

describe("Doku-Links: nur https, nur Hosts aus der festen Liste der Vorlage", () => {
  it("jeder Doku-Link ist https auf einem Host aus der Liste der Vorlage", () => {
    for (const vorlage of VORLAGEN) {
      const url = new URL(vorlage.doku);
      expect(url.protocol, vorlage.id).toBe("https:");
      expect(vorlage.dokuHosts, vorlage.id).toContain(url.hostname);
    }
  });

  it.each([
    ["fremdem Host", "https://doku.fremd.example/mcp"],
    ["http", "http://developers.notion.com/guides/mcp/get-started-with-mcp"],
    ["Benutzer-Teil", "https://x@developers.notion.com/guides/mcp/get-started-with-mcp"],
    ["anderem Port", "https://developers.notion.com:8443/guides/mcp/get-started-with-mcp"],
    ["Unter-Host", "https://boese.developers.notion.com/guides/mcp/get-started-with-mcp"],
    ["unlesbarem Link", "kein link"],
  ])("Gegenprobe: ein Doku-Link mit %s wird abgewiesen", (_fall, doku) => {
    expect(vorlageSchema.safeParse({ ...kopie("notion"), doku }).success).toBe(false);
  });
});

describe("Texte: keine verbotenen Wörter", () => {
  it("die Liste der verbotenen Wörter ist vollständig", () => {
    expect([...VERBOTENE_WOERTER]).toEqual([
      "DSGVO",
      "Open Source",
      "sicher",
      "empfohlen",
      "funktioniert",
      "geprüft",
    ]);
  });

  it("jeder Text-Schlüssel der Vorlagen ist im Katalog, und kein Text enthält ein verbotenes Wort", () => {
    const schluessel = new Set<string>(VORLAGEN.flatMap(vorlageTextSchluessel));
    // Auch Schlüssel unter `apps.vorlage.`, die (noch) keine Vorlage nennt.
    for (const key of TEXT_KEYS) if (key.startsWith("apps.vorlage.")) schluessel.add(key);
    expect(schluessel.size).toBeGreaterThanOrEqual(VORLAGEN.length * 2);
    for (const key of schluessel) {
      expect(TEXT_KEYS as readonly string[], key).toContain(key);
      // Im Katalog geprüft (Zeile davor); `katalogText` braucht den engen Typ.
      const text = katalogText(key as TextKey);
      expect(verboteneWoerterIn(text), `${key}: ${text}`).toEqual([]);
    }
  });

  it.each(["DSGVO", "Open Source", "sicher", "empfohlen", "funktioniert", "geprüft"])(
    "Gegenprobe: ein Text mit „%s“ wird erkannt, auch in anderer Schreibung",
    (wort) => {
      expect(verboteneWoerterIn(`Das ist ${wort.toUpperCase()}.`)).toEqual([wort]);
      expect(verboteneWoerterIn(`Das ist ${wort.toLowerCase()}.`)).toEqual([wort]);
    },
  );

  it("Gegenprobe: eine Vorlage, deren Text ein verbotenes Wort enthält, wird abgewiesen", () => {
    // Ein Schlüssel aus dem Katalog, dessen Text „sicher“ enthält, an der Stelle von Name und Hinweis.
    const mitWort = TEXT_KEYS.find((key) => {
      const wert: unknown = katalogText(key as TextKey);
      return typeof wert === "string" && verboteneWoerterIn(wert).includes("sicher");
    });
    expect(mitWort).toBeDefined();
    const notion = kopie("notion");
    notion.anmeldung = [{ art: "token", stand: "eingeschraenkt", hinweis: mitWort }];
    expect(vorlageSchema.safeParse(notion).success).toBe(false);
    expect(vorlageSchema.safeParse({ ...kopie("notion"), name: mitWort }).success).toBe(false);
  });

  it("Gegenprobe: ein Text-Schlüssel, den es im Katalog nicht gibt, wird abgewiesen", () => {
    const roh = { ...kopie("notion"), name: "apps.vorlage.gibtsnicht.name" };
    expect(vorlageSchema.safeParse(roh).success).toBe(false);
  });
});

describe("Eingefroren, ohne Umgebung, ohne Datei, ohne Netz, nur Server", () => {
  const QUELLE = readFileSync(new URL("./vorlagen.ts", import.meta.url), "utf8");

  it("das Verzeichnis und jede Vorlage sind tief eingefroren", () => {
    expect(Object.isFrozen(VORLAGEN)).toBe(true);
    for (const vorlage of VORLAGEN) {
      expect(Object.isFrozen(vorlage)).toBe(true);
      expect(Object.isFrozen(vorlage.adressen)).toBe(true);
      expect(Object.isFrozen(vorlage.anmeldung)).toBe(true);
      expect(Object.isFrozen(vorlage.dokuHosts)).toBe(true);
      for (const adresse of vorlage.adressen) expect(Object.isFrozen(adresse)).toBe(true);
      for (const weg of vorlage.anmeldung) expect(Object.isFrozen(weg)).toBe(true);
    }
  });

  it("ein Versuch, eine Adresse zur Laufzeit zu ändern, ändert nichts", () => {
    const linear = VORLAGEN.find((v) => v.id === "linear") as Vorlage;
    const vorher = linear.adressen[0]?.adresse;
    // Die Umwandlungen umgehen `readonly` absichtlich: Genau dieser Versuch soll scheitern.
    expect(() => {
      (linear.adressen[0] as { adresse: string }).adresse = "https://boese.example/mcp";
    }).toThrow(TypeError);
    expect(() => {
      (linear.adressen as unknown as unknown[]).push({ adresse: "https://boese.example/mcp" });
    }).toThrow(TypeError);
    expect(() => {
      (VORLAGEN as unknown as unknown[]).length = 0;
    }).toThrow(TypeError);
    expect(linear.adressen[0]?.adresse).toBe(vorher);
    expect(linear.adressen).toHaveLength(2);
    expect(VORLAGEN).toHaveLength(4);
  });

  it("das Modul liest keine Umgebungsvariable, keine Einstellung und keine Datei", () => {
    expect(QUELLE).not.toMatch(/process\s*\.\s*env|import\.meta\.env|process\s*\[/);
    expect(QUELLE).not.toMatch(/require\s*\(|import\s*\(|readFile|readdir/);
    // Nur diese Importe: keine Einstellungen, keine Datenbank, kein `node:fs`, keine Umgebung.
    const importe = [...QUELLE.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gms)].map((m) => m[1]);
    expect(importe.sort()).toEqual(
      ["./adresse", "./eingaben", "@paibot/shared/ids", "@paibot/shared/texte", "zod"].sort(),
    );
    expect(QUELLE.match(/^import\s/gm)).toHaveLength(importe.length);
  });

  it("das Modul lädt nichts aus dem Netz: beim Laden und Benutzen geschieht kein Netzaufruf", async () => {
    const abruf = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("kein Netz"));
    vi.resetModules();
    const modul = await import("./vorlagen");
    for (const vorlage of modul.VORLAGEN) {
      for (const { adresse } of vorlage.adressen) modul.adressMaengel(adresse);
      modul.vorlageSchema.parse(vorlage);
    }
    expect(abruf).not.toHaveBeenCalled();
    expect(QUELLE).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|basisFetch|egress/);
  });

  it("das Modul ist als Server-Code im Browser-Bündel gesperrt", () => {
    const buendelTest = readFileSync(
      new URL("../routen-browser-buendel.test.ts", import.meta.url),
      "utf8",
    );
    expect(buendelTest).toMatch(/\|vorlagen\)\\\.ts\$\//);
  });
});
