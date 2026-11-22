/**
 * PaiBot – Tests der Routen zur Verwaltung der Apps: Adresse vor jeder Verbindung, Token in keiner
 * Antwort und keinem Beleg, gesehener Abdruck beim Bestätigen, Einstufung nur durch den Besitzer,
 * Zugriff in einer Transaktion, Trennen. Die Liste der Werkzeuge liefert ein Ersatz ohne Netz, der
 * die echte Aufbereitung der Schicht auf einer rohen Liste laufen lässt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { decryptSecret } from "@paibot/crypto";
import { repo } from "@paibot/db";
import { bereiteWerkzeugeAuf, McpSchichtFehler, type McpWerkzeugRoh } from "@paibot/mcp";
import { appTokenBinding, secretAad } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import { type AppId, type BotId, newId } from "@paibot/shared/ids";
import { afterEach, describe, expect, it, vi } from "vitest";
import { belegeAlsText, belegeSeit, eingerichtet, letzteNummer } from "../modelle/testing";
import { API_ROUTEN } from "../routen";
import { bekannteNamenVon, MAX_BEKANNTE_NAMEN } from "./abgleich";
import { _ersetzeAppDienste, type AppAbruf } from "./dienste";
import { appsSeitenDaten } from "./seite";
import {
  appNeuVerbinden,
  appsListe,
  appTrennen,
  appVerbinden,
  appWerkzeugBestaetigen,
  appWerkzeuge,
  appWerkzeugeAbrufen,
  appWerkzeugVerlauf,
  appZugriffSetzen,
} from "./verwaltung";

vi.setConfig({ testTimeout: 60_000 });

const TOKEN = "tok-Geheim-0123456789abcdef";
const URL_APP = "https://mcp.beispiel.de/mcp";

const ECHO: McpWerkzeugRoh = {
  name: "echo",
  description: "Gibt Text zurück.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string", description: "Der Text, der zurückkommt." } },
    required: ["text"],
  },
  annotations: { readOnlyHint: true },
};
const SUCHE: McpWerkzeugRoh = {
  name: "suche",
  description: "Sucht Einträge.",
  inputSchema: { type: "object", properties: { frage: { type: "string" } } },
};

/** Ersatz für die Naht zur Schicht: echte Aufbereitung auf einer rohen Liste, kein Netz. */
function ersatz() {
  const zustand: { liste: McpWerkzeugRoh[]; fehler: Error | undefined; aufrufe: AppAbruf[] } = {
    liste: [ECHO, SUCHE],
    fehler: undefined,
    aufrufe: [],
  };
  _ersetzeAppDienste({
    async werkzeugeAbrufen(abruf) {
      zustand.aufrufe.push(abruf);
      if (zustand.fehler !== undefined) throw zustand.fehler;
      return {
        werkzeuge: bereiteWerkzeugeAuf(zustand.liste, {
          appKurzname: abruf.appKurzname,
          bekannteNamen: abruf.bekannteNamen,
        }),
        serverName: "Beispiel",
        seiten: 1,
        abgeschnitten: false,
      };
    },
  });
  return zustand;
}

afterEach(() => _ersetzeAppDienste(undefined));

async function umgebung() {
  const zustand = ersatz();
  const e = await eingerichtet();
  const h = {
    liste: e.u.handler("appsListe", appsListe),
    verbinden: e.u.handler("appVerbinden", appVerbinden),
    werkzeuge: e.u.handler("appWerkzeuge", appWerkzeuge),
    abrufen: e.u.handler("appWerkzeugeAbrufen", appWerkzeugeAbrufen),
    bestaetigen: e.u.handler("appWerkzeugBestaetigen", appWerkzeugBestaetigen),
    zugriff: e.u.handler("appZugriffSetzen", appZugriffSetzen),
    trennen: e.u.handler("appTrennen", appTrennen),
    neu: e.u.handler("appNeuVerbinden", appNeuVerbinden),
    verlauf: e.u.handler("appWerkzeugVerlauf", appWerkzeugVerlauf),
  };
  const bot = await repo.bots.getDefault(e.u.db);
  if (bot === undefined) throw new Error("kein Bot");
  return { e, h, zustand, botId: bot.id as BotId };
}
type Umgebung = Awaited<ReturnType<typeof umgebung>>;

async function verbinden(u: Umgebung, koerper: Record<string, unknown> = {}) {
  const r = await u.e.rufe(u.h.verbinden, "POST", "/api/apps", {
    koerper: { url: URL_APP, token: TOKEN, ...koerper },
  });
  return r;
}

type AppDaten = {
  app: { id: AppId; tokenGesetzt: boolean; zustand: string };
  werkzeuge: {
    id: string;
    abdruck: string;
    stand: string;
    klasse: string;
    modellText: { name: string; beschreibung: string; schema: unknown };
    hinweiseLautApp: { nurLesend: boolean | null };
  }[];
  nichtPruefbar: { name: string; grund: string; warGespeichert: boolean }[];
};
const daten = (r: { body: { daten?: unknown } }) => r.body.daten as AppDaten;

/** Weder der Token noch ein Teil davon steht in einer Antwort, einem Beleg oder dem Protokoll. */
async function ohneToken(u: Umgebung) {
  const belege = await belegeAlsText(u.e.u);
  const alles = [...u.e.antworten, belege.text, ...u.e.u.log];
  for (const stelle of alles) {
    expect(stelle).not.toContain(TOKEN);
    expect(stelle).not.toContain("Geheim-0123");
  }
}

describe("App verbinden", () => {
  it("prüft die Liste, speichert App, Token (verschlüsselt, gebunden) und Werkzeuge; Beleg-Paar", async () => {
    const u = await umgebung();
    const vorher = await letzteNummer(u.e.u);
    const r = await verbinden(u);
    expect(r.status).toBe(201);
    const d = daten(r);
    expect(d.app.tokenGesetzt).toBe(true);
    expect(d.werkzeuge.map((w) => w.modellText.name).sort()).toEqual([
      "mcp-beispiel-de__echo",
      "mcp-beispiel-de__suche",
    ]);
    expect(u.zustand.aufrufe).toHaveLength(1);
    expect(u.zustand.aufrufe[0]?.token).toBe(TOKEN);
    expect(u.zustand.aufrufe[0]?.adresse).toBe(URL_APP);
    // Der Token liegt nur verschlüsselt und an Kennung und Adresse gebunden in der Datenbank.
    const enc = await repo.apps.getTokenEnc(u.e.u.db, d.app.id);
    expect(enc).toBeDefined();
    expect(enc).not.toContain(TOKEN);
    expect(
      decryptSecret(enc as string, u.e.u.schluessel.geheimnisse, {
        aad: secretAad(appTokenBinding(d.app.id, URL_APP)),
      }),
    ).toBe(TOKEN);
    const belege = await belegeSeit(u.e.u, vorher);
    expect(belege.map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "app.verbinden"],
      ["result", "app.verbinden"],
    ]);
    await ohneToken(u);
  });

  it("alle Werkzeuge sind „neu“ und „schreibt“, auch wenn der Server „nur lesend“ sagt", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const echo = d.werkzeuge.find((w) => w.modellText.name.endsWith("__echo"));
    expect(echo?.hinweiseLautApp.nurLesend).toBe(true);
    expect(echo?.stand).toBe("neu");
    expect(echo?.klasse).toBe("schreiben");
    // Nicht angeboten: nur bestätigte Werkzeuge gehen je an ein Modell.
    expect(
      await repo.apps.confirmedTool(u.e.u.db, {
        modelName: "mcp-beispiel-de__echo",
        toolDigest: echo?.abdruck as never,
      }),
    ).toBeUndefined();
  });

  const ABGELEHNT: [string, string][] = [
    ["http", "http://mcp.beispiel.de/mcp"],
    ["Benutzer-Teil", `https://nutzer:${TOKEN}@mcp.beispiel.de/mcp`],
    ["Abfrage-Teil mit Token", `https://mcp.beispiel.de/mcp?token=${TOKEN}`],
    ["Anker", "https://mcp.beispiel.de/mcp#x"],
    ["IPv4", "https://192.0.2.10/mcp"],
    ["Schleife", "https://127.0.0.1/mcp"],
    ["Metadaten-Adresse", "https://169.254.169.254/latest"],
    ["interner Name", "https://postgres/mcp"],
    ["anderer Port", "https://mcp.beispiel.de:8443/mcp"],
  ];
  // Der feste Grund in der Antwort: der erste verletzte Punkt, nie ein Stück der Adresse.
  const GRUND: Record<string, string> = {
    http: "Nur https-Adressen sind erlaubt.",
    "Benutzer-Teil": "Die Adresse darf keinen Benutzer- oder Passwort-Teil enthalten.",
    "Abfrage-Teil mit Token": "Die Adresse darf keinen Abfrage-Teil (?…) enthalten.",
    Anker: "Die Adresse darf keinen Anker (#…) enthalten.",
    IPv4: "Nur öffentliche Adressen sind erlaubt",
    Schleife: "Nur öffentliche Adressen sind erlaubt",
    "Metadaten-Adresse": "Nur öffentliche Adressen sind erlaubt",
    "interner Name": "Nur öffentliche Adressen sind erlaubt",
    "anderer Port": "Nur der Port 443 ist erlaubt.",
  };
  for (const [name, adresse] of ABGELEHNT) {
    it(`${name}: abgelehnt vor jeder Verbindung, mit Beleg-Paar, ohne Token in Antwort und Beleg`, async () => {
      const u = await umgebung();
      const vorher = await letzteNummer(u.e.u);
      const r = await u.e.rufe(u.h.verbinden, "POST", "/api/apps", {
        koerper: { url: adresse, token: TOKEN },
      });
      expect(r.status).toBe(400);
      expect(r.body.fehler?.code).toBe("app_adresse_unzulaessig");
      const grund = (r.body as { fehler?: { text?: string } }).fehler?.text ?? "";
      expect(grund, name).toContain(GRUND[name] ?? "(fehlt)");
      expect(grund).not.toContain(TOKEN);
      // Keine Verbindung, nichts gespeichert.
      expect(u.zustand.aufrufe).toHaveLength(0);
      expect(await repo.apps.list(u.e.u.db)).toEqual([]);
      const belege = await belegeSeit(u.e.u, vorher);
      expect(belege.map((b) => [b.typ, b.aktion])).toEqual([
        ["decision", "app.verbinden"],
        ["result", "app.verbinden"],
      ]);
      await ohneToken(u);
    });
  }

  it("ein Befehl statt einer Adresse: abgelehnt, ohne Verbindung", async () => {
    const u = await umgebung();
    const r = await u.e.rufe(u.h.verbinden, "POST", "/api/apps", {
      koerper: { url: "npx -y @beispiel/server" },
    });
    expect(r.status).toBe(400);
    expect(r.body.fehler?.code).toBe("app_befehl_nicht_erlaubt");
    expect(u.zustand.aufrufe).toHaveLength(0);
  });

  it("ein Fehler der Verbindung mit Token im Text: fester Satz, nichts gespeichert, Token nirgends", async () => {
    const u = await umgebung();
    u.zustand.fehler = new Error(`Unauthorized: Bearer ${TOKEN}`);
    const r = await verbinden(u);
    expect(r.status).toBe(500);
    expect(r.body.fehler?.code).toBe("intern");
    expect(await repo.apps.list(u.e.u.db)).toEqual([]);
    await ohneToken(u);
    u.zustand.fehler = new McpSchichtFehler("app_zugang_ungueltig");
    const r2 = await verbinden(u);
    expect(r2.body.fehler?.code).toBe("app_zugang_ungueltig");
    expect(await repo.apps.list(u.e.u.db)).toEqual([]);
    await ohneToken(u);
  });

  it("ungültige gespeicherte Namen sind ein Fehler der Daten, kein Fehler der App: intern mit festem Satz", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    u.zustand.fehler = new McpSchichtFehler("namen_ungueltig");
    const r = await u.e.rufe(u.h.abrufen, "POST", `/api/apps/${d.app.id}/werkzeuge`, {
      params: { id: d.app.id },
    });
    expect(r.status).toBe(500);
    expect(r.body.fehler?.code).toBe("intern");
    expect(JSON.stringify(r.body)).toContain("gespeicherten Werkzeug-Namen");
    // Ehrlich und mit Ausweg, ohne die Art des Fehlers zu ändern.
    const fehler = (r.body as { fehler?: { text?: string; ausweg?: string } }).fehler;
    expect(fehler?.text).toContain("zu viele Werkzeuge gemeldet");
    expect(fehler?.ausweg).toBe("Trenne die App und verbinde sie neu.");
  });

  it("entfernte Werkzeuge füllen die Namen nicht auf: alle übrigen Namen und die jüngsten entfernten, höchstens MAX_BEKANNTE_NAMEN", async () => {
    const jetzt = Date.UTC(2026, 10, 22);
    const werkzeug = (name: string, status: string, alter: number) =>
      ({
        originalName: name,
        modelName: `beispiel__${name}`,
        status,
        createdAt: new Date(jetzt - alter * 1000),
      }) as unknown as repo.apps.AppTool;
    // 3 000 entfernte (je Sekunde ein Alter mehr) und 3 gemeldete.
    const viele = Array.from({ length: 3000 }, (_, i) => werkzeug(`weg${i}`, "entfernt", i + 10));
    const aktuelle = ["a1", "a2", "a3"].map((n) => werkzeug(n, "bestaetigt", 100_000));
    const spion = vi.spyOn(repo.apps, "currentTools").mockResolvedValue([...viele, ...aktuelle]);
    try {
      const namen = await bekannteNamenVon({} as never, "app_x" as AppId);
      expect(namen.size).toBe(MAX_BEKANNTE_NAMEN);
      for (const n of ["a1", "a2", "a3"]) expect(namen.has(n)).toBe(true);
      // die jüngsten entfernten zuerst: weg0 ist das jüngste, weg2999 das älteste
      expect(namen.has("weg0")).toBe(true);
      expect(namen.has("weg2999")).toBe(false);
      // und das Ergebnis passt in das, was die Schicht annimmt (höchstens 2 000)
      expect(namen.size).toBeLessThanOrEqual(2000);
    } finally {
      spion.mockRestore();
    }
  });

  it("ein Datenbankfehler mit der Zeile (samt verschlüsseltem Token) im Text erreicht keine Antwort", async () => {
    const u = await umgebung();
    const echt = repo.apps.create;
    const spion = vi.spyOn(repo.apps, "create").mockImplementation(async (_db, eingabe) => {
      throw new Error(`Failing row contains (${eingabe.id}, ${eingabe.tokenEnc}, ${TOKEN})`);
    });
    try {
      const r = await verbinden(u);
      expect(r.status).toBe(500);
      expect(r.body.fehler?.code).toBe("intern");
    } finally {
      spion.mockRestore();
    }
    expect(repo.apps.create).toBe(echt);
    await ohneToken(u);
  });

  it("eine verletzte Prüfbedingung der Datenbank an der Adresse wird zum Feldfehler url", async () => {
    const u = await umgebung();
    const spion = vi
      .spyOn(repo.apps, "create")
      .mockRejectedValue(
        new PaiBotError("eingabe_ungueltig", { felder: [{ feld: "eingabe", code: "ungueltig" }] }),
      );
    try {
      const r = await verbinden(u);
      expect(r.status).toBe(400);
      expect(r.body.fehler?.code).toBe("eingabe_ungueltig");
      expect((r.body.fehler as { felder?: unknown }).felder).toEqual([
        { feld: "url", code: "ungueltig" },
      ]);
    } finally {
      spion.mockRestore();
    }
    expect(await repo.apps.list(u.e.u.db)).toEqual([]);
  });

  it("Steuerzeichen in der Adresse und mehr als 2 000 Zeichen: abgewiesen am Feld url, ohne Verbindung", async () => {
    const u = await umgebung();
    for (const adresse of [
      "https://mcp.be\nispiel.de/mcp",
      `https://mcp.beispiel.de/${"a".repeat(2000)}`,
    ]) {
      const r = await u.e.rufe(u.h.verbinden, "POST", "/api/apps", { koerper: { url: adresse } });
      expect(r.status).toBe(400);
      expect(r.body.fehler?.code).toBe("eingabe_ungueltig");
    }
    expect(u.zustand.aufrufe).toHaveLength(0);
  });

  it("die Antwort zeigt die Adresse in der gespeicherten, normalisierten Form", async () => {
    const u = await umgebung();
    const d = await verbinden(u, { url: "  HTTPS://MCP.Beispiel.DE:443/mcp  " });
    expect((d.body.daten as { app: { adresse: string } }).app.adresse).toBe(URL_APP);
  });

  it("ein Token mit Leerzeichen oder zu lang: abgewiesen am Feld token, ohne den Wert", async () => {
    const u = await umgebung();
    for (const token of ["mit leerzeichen", "ü-umlaut", "x".repeat(5000)]) {
      const r = await verbinden(u, { token });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).not.toContain(token);
    }
    expect(u.zustand.aufrufe).toHaveLength(0);
  });

  it("ohne Anmeldung gilt kein Token; ohne Sitzung 401", async () => {
    const u = await umgebung();
    const d = daten(
      await u.e.rufe(u.h.verbinden, "POST", "/api/apps", { koerper: { url: URL_APP } }),
    );
    expect(d.app.tokenGesetzt).toBe(false);
    expect(u.zustand.aufrufe[0]?.token).toBeUndefined();
    const ohneSitzung = await u.e.u.handler("appVerbinden", appVerbinden)(
      new Request("http://paibot.test/api/apps", { method: "POST" }),
      { params: Promise.resolve({}) },
    );
    expect(ohneSitzung.status).toBe(401);
  });
});

describe("Werkzeuge lesen und abgleichen", () => {
  it("liefert je Werkzeug den vollständigen Text, der ans Modell geht, so wie er gespeichert ist", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const r = await u.e.rufe(u.h.werkzeuge, "GET", `/api/apps/${d.app.id}/werkzeuge`, {
      params: { id: d.app.id },
    });
    const liste = daten(r).werkzeuge;
    for (const w of liste) {
      const gespeichert = await repo.apps.currentTool(u.e.u.db, w.id as never);
      expect(w.modellText).toEqual({
        name: gespeichert?.modelName,
        beschreibung: gespeichert?.description,
        schema: gespeichert?.inputSchema,
      });
    }
    // Auch der Text des Felds im Schema ist dabei, nicht nur die Beschreibung.
    const echo = liste.find((w) => w.modellText.name.endsWith("__echo"));
    expect(JSON.stringify(echo?.modellText.schema)).toContain("Der Text, der zurückkommt.");
  });

  it("erneut testen: neu, geändert und entfernt; ein geändertes Werkzeug wird nicht stillschweigend übernommen", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const echo = d.werkzeuge.find((w) => w.modellText.name.endsWith("__echo"));
    // Besitzer bestätigt „echo“.
    const ok = await u.e.rufe(
      u.h.bestaetigen,
      "PUT",
      `/api/apps/${d.app.id}/werkzeuge/${echo?.id}`,
      {
        params: { id: d.app.id, werkzeug: echo?.id as string },
        koerper: { klasse: "lesen", gesehenerAbdruck: echo?.abdruck },
      },
    );
    expect(ok.status).toBe(200);
    // Der Server ändert die Beschreibung von „echo“, entfernt „suche“ und liefert „neu“.
    u.zustand.liste = [
      { ...ECHO, description: "Gibt Text zurück. Dazu eine neue Anweisung." },
      { name: "neu", description: "Neu.", inputSchema: { type: "object", properties: {} } },
    ];
    const r = await u.e.rufe(u.h.abrufen, "POST", `/api/apps/${d.app.id}/werkzeuge`, {
      params: { id: d.app.id },
    });
    const stand = Object.fromEntries(
      daten(r).werkzeuge.map((w) => [w.modellText.name.split("__")[1], w.stand]),
    );
    expect(stand).toEqual({ echo: "geaendert", suche: "entfernt", neu: "neu" });
    expect(u.zustand.aufrufe[1]?.token).toBe(TOKEN);
    await ohneToken(u);
  });

  it("nicht prüfbare Werkzeuge werden nicht gespeichert und mit festem Grund genannt", async () => {
    const u = await umgebung();
    u.zustand.liste = [
      ECHO,
      {
        name: "refs",
        description: "x",
        inputSchema: { type: "object", properties: { a: { $ref: "#/x" } } },
      },
    ];
    const d = daten(await verbinden(u));
    expect(d.werkzeuge.map((w) => w.modellText.name)).toEqual(["mcp-beispiel-de__echo"]);
    expect(d.nichtPruefbar).toEqual([
      expect.objectContaining({
        name: "refs",
        grund: "werkzeug_schema_nicht_pruefbar",
        warGespeichert: false,
      }),
    ]);
  });

  it("ein bestätigtes Werkzeug, das nicht mehr prüfbar ist, gilt als entfernt und wird mit Grund genannt", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const echo = d.werkzeuge.find((w) => w.modellText.name.endsWith("__echo"));
    await u.e.rufe(u.h.bestaetigen, "PUT", `/api/apps/${d.app.id}/werkzeuge/${echo?.id}`, {
      params: { id: d.app.id, werkzeug: echo?.id as string },
      koerper: { klasse: "lesen", gesehenerAbdruck: echo?.abdruck },
    });
    u.zustand.liste = [
      { ...ECHO, inputSchema: { type: "object", properties: { text: { $ref: "#/x" } } } },
    ];
    const r = daten(
      await u.e.rufe(u.h.abrufen, "POST", `/api/apps/${d.app.id}/werkzeuge`, {
        params: { id: d.app.id },
      }),
    );
    const stand = r.werkzeuge.find((w) => w.modellText.name.endsWith("__echo"));
    expect(stand?.stand).toBe("entfernt");
    expect(r.nichtPruefbar).toEqual([
      expect.objectContaining({
        name: "echo",
        grund: "werkzeug_schema_nicht_pruefbar",
        warGespeichert: true,
      }),
    ]);
    expect(
      await repo.apps.confirmedTool(u.e.u.db, {
        modelName: "mcp-beispiel-de__echo",
        toolDigest: echo?.abdruck as never,
      }),
    ).toBeUndefined();
  });

  it("die Namen der Datenbank bleiben stabil und eindeutig: a_b, a.b, Groß- und Kleinschreibung, Länge", async () => {
    const u = await umgebung();
    const werkzeug = (name: string): McpWerkzeugRoh => ({
      name,
      description: "x",
      inputSchema: { type: "object", properties: {} },
    });
    u.zustand.liste = [werkzeug("a_b")];
    const d = daten(await verbinden(u));
    expect(d.werkzeuge[0]?.modellText.name).toBe("mcp-beispiel-de__a_b");
    u.zustand.liste = [
      werkzeug("a.b"),
      werkzeug("a_b"),
      werkzeug("Foo"),
      werkzeug("foo"),
      werkzeug("x".repeat(200)),
    ];
    const r = daten(
      await u.e.rufe(u.h.abrufen, "POST", `/api/apps/${d.app.id}/werkzeuge`, {
        params: { id: d.app.id },
      }),
    );
    const namen = r.werkzeuge.map((w) => w.modellText.name);
    expect(new Set(namen).size).toBe(namen.length);
    expect(r.werkzeuge.find((w) => w.modellText.name === "mcp-beispiel-de__a_b")?.id).toBe(
      d.werkzeuge[0]?.id,
    );
    for (const name of namen) expect(name.length).toBeLessThanOrEqual(64);
    const schluessel = (await repo.apps.currentTools(u.e.u.db, d.app.id)).map((t) => t.toolKey);
    expect(new Set(schluessel).size).toBe(schluessel.length);
    // Die gespeicherte Zuordnung ging immer in die Schicht (nie ohne `bekannteNamen`).
    expect(u.zustand.aufrufe.every((a) => a.bekannteNamen instanceof Map)).toBe(true);
    expect([...(u.zustand.aufrufe[1]?.bekannteNamen ?? new Map()).keys()]).toEqual(["a_b"]);
  });
});

describe("Werkzeug bestätigen", () => {
  it("nur mit dem gesehenen Abdruck; die Einstufung kommt allein aus der Bestätigung", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const echo = d.werkzeuge.find((w) => w.modellText.name.endsWith("__echo"));
    const vorher = await letzteNummer(u.e.u);
    const r = await u.e.rufe(
      u.h.bestaetigen,
      "PUT",
      `/api/apps/${d.app.id}/werkzeuge/${echo?.id}`,
      {
        params: { id: d.app.id, werkzeug: echo?.id as string },
        koerper: { klasse: "lesen", gesehenerAbdruck: echo?.abdruck },
      },
    );
    expect(r.status).toBe(200);
    expect(
      (r.body.daten as { werkzeug: { stand: string; klasse: string } }).werkzeug,
    ).toMatchObject({ stand: "bestaetigt", klasse: "lesen" });
    expect(
      await repo.apps.confirmedTool(u.e.u.db, {
        modelName: "mcp-beispiel-de__echo",
        toolDigest: echo?.abdruck as never,
      }),
    ).toBeDefined();
    expect((await belegeSeit(u.e.u, vorher)).map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "app.werkzeuge_bestaetigen"],
      ["result", "app.werkzeuge_bestaetigen"],
    ]);
  });

  it("ein anderer Abdruck als der gesehene (der Server änderte nach der Anzeige): abgelehnt, nichts bestätigt", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const echo = d.werkzeuge.find((w) => w.modellText.name.endsWith("__echo"));
    // Der Besitzer sah diesen Abdruck. Dann ändert der Server die Beschreibung und die Liste wird neu geholt.
    const gesehen = echo?.abdruck;
    u.zustand.liste = [{ ...ECHO, description: "Gibt Text zurück. Neue Anweisung." }, SUCHE];
    await u.e.rufe(u.h.abrufen, "POST", `/api/apps/${d.app.id}/werkzeuge`, {
      params: { id: d.app.id },
    });
    const vorher = await letzteNummer(u.e.u);
    const r = await u.e.rufe(
      u.h.bestaetigen,
      "PUT",
      `/api/apps/${d.app.id}/werkzeuge/${echo?.id}`,
      {
        params: { id: d.app.id, werkzeug: echo?.id as string },
        koerper: { klasse: "lesen", gesehenerAbdruck: gesehen },
      },
    );
    expect(r.status).toBe(409);
    expect(r.body.fehler?.code).toBe("werkzeug_abdruck_ungesehen");
    const aktuell = await repo.apps.currentTool(u.e.u.db, echo?.id as never);
    expect(aktuell?.status).not.toBe("bestaetigt");
    expect((await belegeSeit(u.e.u, vorher)).map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "app.werkzeuge_bestaetigen"],
      ["result", "app.werkzeuge_bestaetigen"],
    ]);
  });

  it("ein Werkzeug einer anderen App oder eine unbekannte Kennung: nicht gefunden", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const echo = d.werkzeuge[0];
    const fremd = daten(
      await verbinden(u, { url: "https://mcp.zweite.de/mcp", kurzname: "zweite" }),
    );
    const r = await u.e.rufe(
      u.h.bestaetigen,
      "PUT",
      `/api/apps/${fremd.app.id}/werkzeuge/${echo?.id}`,
      {
        params: { id: fremd.app.id, werkzeug: echo?.id as string },
        koerper: { klasse: "lesen", gesehenerAbdruck: echo?.abdruck },
      },
    );
    expect(r.status).toBe(404);
    const r2 = await u.e.rufe(
      u.h.bestaetigen,
      "PUT",
      `/api/apps/${d.app.id}/werkzeuge/kein-werkzeug`,
      {
        params: { id: d.app.id, werkzeug: "kein-werkzeug" },
        koerper: { klasse: "lesen", gesehenerAbdruck: echo?.abdruck },
      },
    );
    expect(r2.status).toBe(404);
  });
});

describe("Zugriff der Bots", () => {
  it("setzt den Zugriff; Entscheidung und Zeile entstehen zusammen", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const vorher = await letzteNummer(u.e.u);
    const r = await u.e.rufe(u.h.zugriff, "PUT", `/api/apps/${d.app.id}/zugriff/${u.botId}`, {
      params: { id: d.app.id, bot: u.botId },
      koerper: { zugriff: "lesen" },
    });
    expect(r.status).toBe(200);
    expect(await repo.apps.currentAccess(u.e.u.db, d.app.id, u.botId)).toBe("lesen");
    expect((await belegeSeit(u.e.u, vorher)).map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "app.zugriff_setzen"],
      ["result", "app.zugriff_setzen"],
    ]);
    const liste = await u.e.rufe(u.h.liste, "GET", "/api/apps");
    expect(
      (liste.body.daten as { apps: { zugriff: { zugriff: string }[] }[] }).apps[0]?.zugriff[0]
        ?.zugriff,
    ).toBe("lesen");
  });

  it("scheitert die Zeile, bleibt auch die Entscheidung nicht übrig", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const vorher = await letzteNummer(u.e.u);
    const spion = vi.spyOn(repo.apps, "setAccess").mockRejectedValue(new Error("Platte voll"));
    try {
      const r = await u.e.rufe(u.h.zugriff, "PUT", `/api/apps/${d.app.id}/zugriff/${u.botId}`, {
        params: { id: d.app.id, bot: u.botId },
        koerper: { zugriff: "lesen" },
      });
      expect(r.status).toBe(500);
    } finally {
      spion.mockRestore();
    }
    // Keine Entscheidung ohne Zeile: Es ist nichts geschrieben, was später passen könnte.
    expect(await belegeSeit(u.e.u, vorher)).toEqual([]);
    expect(await repo.apps.currentAccess(u.e.u.db, d.app.id, u.botId)).toBe("keiner");
  });

  it("bei gesetztem Not-Aus lassen sich Zugriff und Einstufung weiter ändern (der Not-Aus hält nur die Aufrufe an)", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    await repo.settings.update(u.e.u.db, { killSwitch: true });
    const zugriff = await u.e.rufe(u.h.zugriff, "PUT", `/api/apps/${d.app.id}/zugriff/${u.botId}`, {
      params: { id: d.app.id, bot: u.botId },
      koerper: { zugriff: "lesen" },
    });
    expect(zugriff.status).toBe(200);
    expect(await repo.apps.currentAccess(u.e.u.db, d.app.id, u.botId)).toBe("lesen");
    const werkzeug = d.werkzeuge[0];
    if (werkzeug === undefined) throw new Error("kein Werkzeug");
    const einstufen = await u.e.rufe(
      u.h.bestaetigen,
      "PUT",
      `/api/apps/${d.app.id}/werkzeuge/${werkzeug.id}`,
      {
        params: { id: d.app.id, werkzeug: werkzeug.id },
        koerper: { klasse: "lesen", gesehenerAbdruck: werkzeug.abdruck },
      },
    );
    expect(einstufen.status).toBe(200);
  });

  it("ein unbekannter Bot oder eine getrennte App: nicht gefunden", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const r = await u.e.rufe(
      u.h.zugriff,
      "PUT",
      `/api/apps/${d.app.id}/zugriff/bot_00000000000000000000000000`,
      {
        params: { id: d.app.id, bot: "bot_00000000000000000000000000" },
        koerper: { zugriff: "lesen" },
      },
    );
    expect(r.status).toBe(404);
  });
});

describe("App trennen", () => {
  it("löscht den Token, setzt jeden Zugriff auf „keiner“, schreibt ein Beleg-Paar", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    await u.e.rufe(u.h.zugriff, "PUT", `/api/apps/${d.app.id}/zugriff/${u.botId}`, {
      params: { id: d.app.id, bot: u.botId },
      koerper: { zugriff: "lesen" },
    });
    const vorher = await letzteNummer(u.e.u);
    const r = await u.e.rufe(u.h.trennen, "DELETE", `/api/apps/${d.app.id}`, {
      params: { id: d.app.id },
    });
    expect(r.status).toBe(200);
    expect(await repo.apps.getTokenEnc(u.e.u.db, d.app.id)).toBeUndefined();
    expect(await repo.apps.currentAccess(u.e.u.db, d.app.id, u.botId)).toBe("keiner");
    expect((await belegeSeit(u.e.u, vorher)).map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "app.trennen"],
      ["result", "app.trennen"],
    ]);
    const nochmal = await u.e.rufe(u.h.trennen, "DELETE", `/api/apps/${d.app.id}`, {
      params: { id: d.app.id },
    });
    expect(nochmal.status).toBe(404);
    await ohneToken(u);
  });
});

describe("App neu verbinden", () => {
  const TOKEN2 = "tok-Zweiter-0123456789abcdef";

  /** Verbunden, ein Werkzeug bestätigt, ein Bot mit Zugriff, dann getrennt. */
  async function getrennt(u: Umgebung) {
    const d = daten(await verbinden(u));
    const echo = d.werkzeuge.find((w) => w.modellText.name.endsWith("__echo"));
    await u.e.rufe(u.h.bestaetigen, "PUT", `/api/apps/${d.app.id}/werkzeuge/${echo?.id}`, {
      params: { id: d.app.id, werkzeug: echo?.id as string },
      koerper: { klasse: "lesen", gesehenerAbdruck: echo?.abdruck },
    });
    await u.e.rufe(u.h.zugriff, "PUT", `/api/apps/${d.app.id}/zugriff/${u.botId}`, {
      params: { id: d.app.id, bot: u.botId },
      koerper: { zugriff: "lesen" },
    });
    await u.e.rufe(u.h.trennen, "DELETE", `/api/apps/${d.app.id}`, { params: { id: d.app.id } });
    u.zustand.aufrufe.length = 0;
    return d.app.id;
  }
  const neu = (u: Umgebung, id: AppId, koerper: Record<string, unknown> = { token: TOKEN2 }) =>
    u.e.rufe(u.h.neu, "POST", `/api/apps/${id}/verbindung`, { params: { id }, koerper });

  it("verbindet eine getrennte App: Verbindungsnummer +1, Werkzeuge wieder „neu“, Zugriff „keiner“, neuer Token gebunden, Beleg-Paar „app.verbinden“", async () => {
    const u = await umgebung();
    const id = await getrennt(u);
    const vorher = await letzteNummer(u.e.u);
    const r = await neu(u, id);
    expect(r.status).toBe(200);
    expect(daten(r).app).toMatchObject({ id, zustand: "verbunden", tokenGesetzt: true });
    expect(daten(r).werkzeuge.map((w) => w.stand)).toEqual(["neu", "neu"]);
    expect(daten(r).werkzeuge.map((w) => w.klasse)).toEqual(["schreiben", "schreiben"]);
    const app = await repo.apps.get(u.e.u.db, id);
    expect(app?.connectionNo).toBe(2);
    expect(await repo.apps.currentAccess(u.e.u.db, id, u.botId)).toBe("keiner");
    expect(u.zustand.aufrufe).toHaveLength(1);
    expect(u.zustand.aufrufe[0]?.token).toBe(TOKEN2);
    const enc = await repo.apps.getTokenEnc(u.e.u.db, id);
    expect(enc).toBeDefined();
    const klar = decryptSecret(enc as string, u.e.u.dienste.schluessel().geheimnisse, {
      aad: secretAad(appTokenBinding(id, URL_APP)),
    });
    expect(klar).toBe(TOKEN2);
    // Der Beleg-Typ bleibt „app.verbinden“; das Tor sieht „created: false“.
    const belege = await belegeSeit(u.e.u, vorher);
    expect(belege.map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "app.verbinden"],
      ["result", "app.verbinden"],
    ]);
    await ohneToken(u);
  });

  it("eine App, die nicht getrennt ist (oder unbekannt): nicht gefunden, kein Abruf", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    u.zustand.aufrufe.length = 0;
    const r = await neu(u, d.app.id);
    expect(r.status).toBe(404);
    expect(u.zustand.aufrufe).toHaveLength(0);
    const fremd = await neu(u, "app_00000000000000000000000000" as AppId);
    expect(fremd.status).toBe(404);
    expect((await repo.apps.get(u.e.u.db, d.app.id))?.connectionNo).toBe(1);
  });

  it("ohne Token bei Anmeldung „token“, ein Token ohne Anmeldung, ein ungültiger Token: abgewiesen am Feld token, App bleibt getrennt, kein Abruf", async () => {
    const u = await umgebung();
    const id = await getrennt(u);
    for (const koerper of [{}, { token: "mit Leerzeichen" }, { token: "x".repeat(5000) }]) {
      const r = await neu(u, id, koerper);
      expect(r.status).toBe(400);
    }
    expect(u.zustand.aufrufe).toHaveLength(0);
    expect((await repo.apps.get(u.e.u.db, id))?.state).toBe("getrennt");
    // Eine App ohne Anmeldung nimmt keinen Token an.
    const offen = daten(
      await verbinden(u, { token: undefined, url: "https://offen.beispiel.de/mcp" }),
    );
    await u.e.rufe(u.h.trennen, "DELETE", `/api/apps/${offen.app.id}`, {
      params: { id: offen.app.id },
    });
    u.zustand.aufrufe.length = 0;
    const mit = await neu(u, offen.app.id, { token: TOKEN2 });
    expect(mit.status).toBe(400);
    expect(u.zustand.aufrufe).toHaveLength(0);
    const ohne = await neu(u, offen.app.id, {});
    expect(ohne.status).toBe(200);
    expect(daten(ohne).app.tokenGesetzt).toBe(false);
    await ohneToken(u);
  });

  it("lehnt das Tor die gespeicherte Adresse ab: kein Abruf, die App bleibt getrennt, Beleg-Paar", async () => {
    const u = await umgebung();
    // Eine App, deren gespeicherte Adresse das Tor nicht erlaubt (am Verbinden vorbei angelegt).
    const id = newId("app") as AppId;
    await repo.apps.create(u.e.u.db, {
      id,
      shortName: "intern",
      name: "intern",
      url: "https://127.0.0.1/mcp",
      authKind: "keine",
    });
    await repo.apps.disconnect(u.e.u.db, id);
    const vorher = await letzteNummer(u.e.u);
    const r = await neu(u, id, {});
    expect(r.body.fehler?.code).toBe("app_adresse_unzulaessig");
    expect(u.zustand.aufrufe).toHaveLength(0);
    const app = await repo.apps.get(u.e.u.db, id);
    expect(app).toMatchObject({ state: "getrennt", connectionNo: 1 });
    expect((await belegeSeit(u.e.u, vorher)).map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "app.verbinden"],
      ["result", "app.verbinden"],
    ]);
  });

  it("scheitert der Abruf (auch mit dem Token im Text): die App bleibt getrennt, nichts verändert, Token nirgends", async () => {
    const u = await umgebung();
    const id = await getrennt(u);
    u.zustand.fehler = new Error(`401 Bearer ${TOKEN2}`);
    const r = await neu(u, id);
    expect(r.status).toBeGreaterThanOrEqual(400);
    const app = await repo.apps.get(u.e.u.db, id);
    expect(app).toMatchObject({ state: "getrennt", connectionNo: 1, tokenSet: false });
    expect(await repo.apps.getTokenEnc(u.e.u.db, id)).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain(TOKEN2);
    // Danach klappt es.
    u.zustand.fehler = undefined;
    expect((await neu(u, id)).status).toBe(200);
    await ohneToken(u);
    for (const stelle of [...u.e.antworten, ...u.e.u.log]) expect(stelle).not.toContain(TOKEN2);
  });

  it("wirft der Abgleich nach dem Wiederverbinden: nichts bleibt davon übrig (App getrennt, Verbindungsnummer und Token unverändert)", async () => {
    const u = await umgebung();
    const id = await getrennt(u);
    const spion = vi.spyOn(repo.apps, "sehen").mockRejectedValueOnce(new Error("Platte voll"));
    try {
      const r = await neu(u, id);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(spion).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(r.body)).not.toContain("Platte voll");
    } finally {
      spion.mockRestore();
    }
    const app = await repo.apps.get(u.e.u.db, id);
    expect(app).toMatchObject({ state: "getrennt", connectionNo: 1, tokenSet: false });
    expect(await repo.apps.getTokenEnc(u.e.u.db, id)).toBeUndefined();
    // Die alten Werkzeuge sind unverändert („bestätigt“ bleibt in der Vorgeschichte, nichts Neues).
    expect((await repo.apps.currentTools(u.e.u.db, id)).map((t) => t.status).sort()).toEqual([
      "bestaetigt",
      "neu",
    ]);
    // Danach klappt es.
    expect((await neu(u, id)).status).toBe(200);
    await ohneToken(u);
  });

  it("Neu verbinden zählt auf das Limit des Verbindungstests wie Verbinden und Erneut testen", () => {
    expect(API_ROUTEN.appNeuVerbinden.limits).toEqual(API_ROUTEN.appVerbinden.limits);
    expect(API_ROUTEN.appNeuVerbinden.limits).toEqual(API_ROUTEN.appWerkzeugeAbrufen.limits);
    expect(API_ROUTEN.appNeuVerbinden.aktion).toBe("app.verbinden");
    expect(API_ROUTEN.appNeuVerbinden.pfad).toBe("/api/apps/:id/verbindung");
  });
});

describe("Was hat sich geändert", () => {
  type Fassung = {
    version: number;
    stand: string;
    abdruck: string;
    klasse: string;
    modellText: { name: string; beschreibung: string; schema: unknown };
    frueher?: {
      version: number;
      klasse: string;
      abdruck: string;
      modellText: { beschreibung: string };
    };
  };
  const fassungen = (r: { body: { daten?: unknown } }) =>
    (r.body.daten as { fassungen: Fassung[] }).fassungen;

  /** „echo“ ist bestätigt („liest“), danach ändert der Server die Beschreibung (n Mal). */
  async function geaendert(u: Umgebung, aenderungen = 1) {
    const d = daten(await verbinden(u));
    const echo = d.werkzeuge.find((w) => w.modellText.name.endsWith("__echo"));
    await u.e.rufe(u.h.bestaetigen, "PUT", `/api/apps/${d.app.id}/werkzeuge/${echo?.id}`, {
      params: { id: d.app.id, werkzeug: echo?.id as string },
      koerper: { klasse: "lesen", gesehenerAbdruck: echo?.abdruck },
    });
    for (let i = 1; i <= aenderungen; i++) {
      u.zustand.liste = [{ ...ECHO, description: `Gibt Text zurück. Änderung ${i}.` }, SUCHE];
      await u.e.rufe(u.h.abrufen, "POST", `/api/apps/${d.app.id}/werkzeuge`, {
        params: { id: d.app.id },
      });
    }
    return { id: d.app.id, werkzeug: echo?.id as string, abdruckAlt: echo?.abdruck as string };
  }
  const verlauf = (u: Umgebung, id: string, werkzeug: string) =>
    u.e.rufe(u.h.verlauf, "GET", `/api/apps/${id}/werkzeuge/${werkzeug}/verlauf`, {
      params: { id, werkzeug },
    });

  it("der Verlauf liefert alle Fassungen, älteste zuerst; die geänderte trägt die zuletzt bestätigte als „frueher“", async () => {
    const u = await umgebung();
    const g = await geaendert(u);
    const r = await verlauf(u, g.id, g.werkzeug);
    expect(r.status).toBe(200);
    const f = fassungen(r);
    expect(f.map((x) => [x.version, x.stand])).toEqual([
      [1, "neu"],
      [2, "bestaetigt"],
      [3, "geaendert"],
    ]);
    expect(f[2]?.frueher?.version).toBe(2);
    expect(f[2]?.frueher?.klasse).toBe("lesen");
    expect(f[2]?.frueher?.abdruck).toBe(g.abdruckAlt);
    expect(f[2]?.frueher?.modellText.beschreibung).toBe("Gibt Text zurück.");
    expect(f[2]?.modellText.beschreibung).toContain("Änderung 1.");
    // Fassungen ohne Änderung tragen keinen Vergleich.
    expect(f[0]?.frueher).toBeUndefined();
    expect(f[1]?.frueher).toBeUndefined();
    await ohneToken(u);
  });

  it("ändert der Server mehrmals vor dem Bestätigen, bleibt die zuletzt BESTÄTIGTE Fassung der Vergleich", async () => {
    const u = await umgebung();
    const g = await geaendert(u, 2);
    const f = fassungen(await verlauf(u, g.id, g.werkzeug));
    const neueste = f[f.length - 1];
    expect(neueste?.stand).toBe("geaendert");
    expect(neueste?.modellText.beschreibung).toContain("Änderung 2.");
    expect(neueste?.frueher?.abdruck).toBe(g.abdruckAlt);
    expect(neueste?.frueher?.modellText.beschreibung).toBe("Gibt Text zurück.");
  });

  it("die Liste der Werkzeuge und die Daten der Seite tragen den Vergleich nur bei geänderten Werkzeugen", async () => {
    const u = await umgebung();
    const g = await geaendert(u);
    const liste = await u.e.rufe(u.h.werkzeuge, "GET", `/api/apps/${g.id}/werkzeuge`, {
      params: { id: g.id },
    });
    const w = daten(liste).werkzeuge as unknown as (Fassung & { id: string })[];
    expect(w.find((x) => x.id === g.werkzeug)?.frueher?.abdruck).toBe(g.abdruckAlt);
    expect(w.filter((x) => x.frueher !== undefined)).toHaveLength(1);
    const seite = await appsSeitenDaten(u.e.u.db);
    const ws = seite.apps[0]?.werkzeuge as unknown as (Fassung & { id: string })[];
    expect(ws.find((x) => x.id === g.werkzeug)?.frueher?.abdruck).toBe(g.abdruckAlt);
    expect(ws.filter((x) => x.frueher !== undefined)).toHaveLength(1);
  });

  it("der Vergleich ändert nicht, was bestätigt wird: nur der Abdruck der neuen Fassung gilt", async () => {
    const u = await umgebung();
    const g = await geaendert(u);
    const alt = await u.e.rufe(
      u.h.bestaetigen,
      "PUT",
      `/api/apps/${g.id}/werkzeuge/${g.werkzeug}`,
      {
        params: { id: g.id, werkzeug: g.werkzeug },
        koerper: { klasse: "lesen", gesehenerAbdruck: g.abdruckAlt },
      },
    );
    expect(alt.status).toBeGreaterThanOrEqual(400);
    const neu = fassungen(await verlauf(u, g.id, g.werkzeug)).at(-1);
    const ok = await u.e.rufe(u.h.bestaetigen, "PUT", `/api/apps/${g.id}/werkzeuge/${g.werkzeug}`, {
      params: { id: g.id, werkzeug: g.werkzeug },
      koerper: { klasse: "lesen", gesehenerAbdruck: neu?.abdruck },
    });
    expect(ok.status).toBe(200);
  });

  it("ein Werkzeug einer anderen App, eine unbekannte Kennung oder eine getrennte App: nicht gefunden", async () => {
    const u = await umgebung();
    const g = await geaendert(u);
    const zweite = daten(await verbinden(u, { url: "https://mcp.zweite.de/mcp" }));
    expect((await verlauf(u, zweite.app.id, g.werkzeug)).status).toBe(404);
    expect((await verlauf(u, g.id, "tool_00000000000000000000000000")).status).toBe(404);
    expect((await verlauf(u, g.id, "kein-id")).status).toBe(404);
    await u.e.rufe(u.h.trennen, "DELETE", `/api/apps/${g.id}`, { params: { id: g.id } });
    expect((await verlauf(u, g.id, g.werkzeug)).status).toBe(404);
  });

  it("die Route nur lesend: kein Beleg, kein Abruf nach draußen", async () => {
    const u = await umgebung();
    const g = await geaendert(u);
    const aufrufe = u.zustand.aufrufe.length;
    const vorher = await letzteNummer(u.e.u);
    await verlauf(u, g.id, g.werkzeug);
    expect(u.zustand.aufrufe).toHaveLength(aufrufe);
    expect(await belegeSeit(u.e.u, vorher)).toEqual([]);
    expect(API_ROUTEN.appWerkzeugVerlauf.veraendernd).toBe(false);
    expect("aktion" in API_ROUTEN.appWerkzeugVerlauf).toBe(false);
  });
});

describe("Der Token geht durch alle Wege nirgends hinaus", () => {
  it("Verbinden, Lesen, Abrufen, Bestätigen, Zugriff, Trennen und Fehlerwege: 0 Treffer in Antworten, Belegen und Protokoll", async () => {
    const u = await umgebung();
    const d = daten(await verbinden(u));
    const echo = d.werkzeuge.find((w) => w.modellText.name.endsWith("__echo"));
    const id = d.app.id;
    await u.e.rufe(u.h.liste, "GET", "/api/apps");
    await u.e.rufe(u.h.werkzeuge, "GET", `/api/apps/${id}/werkzeuge`, { params: { id } });
    await u.e.rufe(u.h.abrufen, "POST", `/api/apps/${id}/werkzeuge`, { params: { id } });
    await u.e.rufe(u.h.bestaetigen, "PUT", `/api/apps/${id}/werkzeuge/${echo?.id}`, {
      params: { id, werkzeug: echo?.id as string },
      koerper: { klasse: "lesen", gesehenerAbdruck: echo?.abdruck },
    });
    await u.e.rufe(u.h.zugriff, "PUT", `/api/apps/${id}/zugriff/${u.botId}`, {
      params: { id, bot: u.botId },
      koerper: { zugriff: "lesen" },
    });
    // Fehlerwege: der Server meldet einen Fehler mit dem Token im Text; falsche Eingaben.
    u.zustand.fehler = new Error(`401 Bearer ${TOKEN}`);
    await u.e.rufe(u.h.abrufen, "POST", `/api/apps/${id}/werkzeuge`, { params: { id } });
    await verbinden(u, { url: `https://x:${TOKEN}@mcp.zweite.de/mcp` });
    await verbinden(u, { url: `https://mcp.zweite.de/mcp?k=${TOKEN}` });
    u.zustand.fehler = undefined;
    await u.e.rufe(u.h.trennen, "DELETE", `/api/apps/${id}`, { params: { id } });
    await ohneToken(u);
    // Gegenprobe im Test selbst: Die Suche erkennt den Token, wenn er irgendwo stünde.
    expect([`x${TOKEN}`].some((s) => s.includes(TOKEN))).toBe(true);
  });
});
