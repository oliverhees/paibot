/**
 * PaiBot – Tor-Pflicht im Verhalten: Jede Route des Vertrags wird über ihre echte Datei unter
 * `app/api` aufgerufen. Ein Schreib-Protokoll in der Datenbank (Trigger auf jeder Tabelle) zeigt,
 * was die Anfrage geschrieben hat. Für jede verändernde Route gilt: Die Aktion des Vertrags
 * hinterlässt genau einen Beleg „Entscheidung“ und einen Beleg „Ergebnis“, und jede Änderung an
 * Daten liegt zwischen diesen beiden Belegen (also in der Ausführung des Tors). Lesende Routen
 * schreiben keine Belege und keine Daten. Die Fälle entstehen aus dem Routen-Vertrag.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { geraete, repo } from "@paibot/db";
import { createTestDb, type TestDb } from "@paibot/db/testing";
import { CSRF } from "@paibot/shared/konstanten";
import { afterAll, describe, expect, it, vi } from "vitest";
import { API_ROUTEN, type RoutenName, routenOrdner, routenPfad } from "./lib/routen";
import { _ersetzeProzessDienste } from "./lib/zugang/dienste";
import {
  anfrage,
  type Keksdose,
  pruefzeichenFuer,
  TEST_CODE,
  TEST_MODELLE,
  TEST_ORIGIN,
  TEST_PASSWORT,
  TEST_SCHLUESSEL,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "./lib/zugang/testing";

// Passwort-Rechnungen (scrypt) und Migrationen brauchen unter Last länger.
type PGlite = TestDb["client"];

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// Die Warteschlange des Prozesses braucht `DATABASE_URL`; im Test reiht sie nur ein.
vi.mock("./lib/warteschlange", async (original) => {
  const modul = await original<typeof import("./lib/warteschlange")>();
  return {
    ...modul,
    prozessEinreihen: { bereit: async () => undefined, lauf: async () => undefined },
  };
});

afterAll(() => _ersetzeProzessDienste(undefined));

const APP = fileURLToPath(new URL("./app", import.meta.url));

type AlleRouten = typeof API_ROUTEN;
/** Routen mit einer Aktion des Tors. */
type AktionsRoute = {
  [N in RoutenName]: AlleRouten[N] extends { aktion: string } ? N : never;
}[RoutenName];
/** Routen ohne Aktion (lesen bzw. prüfen nur). */
type LeseRoute = Exclude<RoutenName, AktionsRoute>;

/** Eine Zeile des Schreib-Protokolls. */
interface Schreiben {
  nr: number;
  tabelle: string;
  art: "INSERT" | "UPDATE" | "DELETE";
  belegTyp: string | null;
  aktion: string | null;
  aktionId: string | null;
  ereignis: string | null;
}

/**
 * Legt das Schreib-Protokoll an: eine Tabelle und ein Trigger je Tabelle der App (außer dem
 * Protokoll selbst). Zurückgerollte Änderungen verschwinden mit ihrer Zeile, gezählt wird also
 * nur, was wirklich geschrieben wurde.
 */
async function schreibProtokollAnlegen(client: PGlite): Promise<void> {
  await client.exec(`
    create table public.zz_schreiben (
      nr bigserial primary key,
      tabelle text not null,
      art text not null,
      beleg_typ text,
      aktion text,
      aktion_id text,
      ereignis text
    );
    create function public.zz_schreiben_merken() returns trigger language plpgsql as $f$
    begin
      if tg_table_name = 'belege' then
        insert into public.zz_schreiben (tabelle, art, beleg_typ, aktion, aktion_id)
          values (tg_table_name, tg_op, new.entry_type, new.action, new.action_id);
      elsif tg_table_name = 'conversation_events' and tg_op = 'INSERT' then
        insert into public.zz_schreiben (tabelle, art, ereignis) values (tg_table_name, tg_op, new.type);
      else
        insert into public.zz_schreiben (tabelle, art) values (tg_table_name, tg_op);
      end if;
      return null;
    end
    $f$;
  `);
  const { rows } = await client.query<{ name: string }>(
    `select table_name as name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'zz_schreiben'`,
  );
  expect(rows.map((r) => r.name)).toContain("belege");
  for (const { name } of rows) {
    await client.exec(
      `create trigger zz_schreiben_${name} after insert or update or delete on public."${name}"
         for each row execute function public.zz_schreiben_merken();`,
    );
  }
}

async function protokollAb(client: PGlite, ab: number): Promise<Schreiben[]> {
  const { rows } = await client.query<{
    nr: string;
    tabelle: string;
    art: Schreiben["art"];
    beleg_typ: string | null;
    aktion: string | null;
    aktion_id: string | null;
    ereignis: string | null;
  }>("select * from public.zz_schreiben where nr > $1 order by nr", [ab]);
  return rows.map((r) => ({
    nr: Number(r.nr),
    tabelle: r.tabelle,
    art: r.art,
    belegTyp: r.beleg_typ,
    aktion: r.aktion,
    aktionId: r.aktion_id,
    ereignis: r.ereignis,
  }));
}

async function letzteNr(client: PGlite): Promise<number> {
  const { rows } = await client.query<{ nr: string | null }>(
    "select max(nr) as nr from public.zz_schreiben",
  );
  return Number(rows[0]?.nr ?? 0);
}

/**
 * Schreiben außerhalb der Ausführung, das der Rahmen bzw. das Beleg-Protokoll selbst erledigen:
 * Zähler der Rate-Limits (vor jeder weiteren Arbeit), die Belege, das Ereignis `beleg.created` zu
 * jedem Beleg und das Verlängern der Sitzung beim Prüfen.
 */
function istBetrieb(s: Schreiben): boolean {
  if (s.tabelle === "rate_limits") return true;
  if (s.tabelle === "belege") return s.art === "INSERT";
  if (s.tabelle === "conversation_events") return s.ereignis === "beleg.created";
  if (s.tabelle === "sessions") return s.art === "UPDATE";
  return false;
}

interface Fenster {
  aktion: string;
  aktionId: string;
  entscheidung: number;
  ergebnis: number;
}

/** Je Aktion: Nummer des Belegs „Entscheidung“ und „Ergebnis“ im Protokoll. */
function fensterAus(protokoll: readonly Schreiben[]): Fenster[] {
  const jeAktion = new Map<string, Partial<Fenster> & { aktion: string; aktionId: string }>();
  for (const s of protokoll) {
    if (s.tabelle !== "belege" || s.aktionId === null || s.aktion === null) continue;
    const f = jeAktion.get(s.aktionId) ?? { aktion: s.aktion, aktionId: s.aktionId };
    if (s.belegTyp === "decision") {
      expect(f.entscheidung, `zweite Entscheidung für ${s.aktionId}`).toBeUndefined();
      f.entscheidung = s.nr;
    } else if (s.belegTyp === "result") {
      expect(f.ergebnis, `zweites Ergebnis für ${s.aktionId}`).toBeUndefined();
      f.ergebnis = s.nr;
    }
    jeAktion.set(s.aktionId, f);
  }
  return [...jeAktion.values()].map((f) => {
    expect(f.entscheidung, `${f.aktion}: Beleg „Entscheidung“ fehlt`).toBeTypeOf("number");
    expect(f.ergebnis, `${f.aktion}: Beleg „Ergebnis“ fehlt`).toBeTypeOf("number");
    expect(f.ergebnis as number).toBeGreaterThan(f.entscheidung as number);
    return f as Fenster;
  });
}

/** Schreiben, das weder Betrieb ist noch in der Ausführung einer Aktion liegt. */
function ausserhalbDesTors(
  protokoll: readonly Schreiben[],
  fenster: readonly Fenster[],
  zusaetzlichErlaubt: (s: Schreiben) => boolean = () => false,
): string[] {
  return protokoll
    .filter((s) => !istBetrieb(s) && !zusaetzlichErlaubt(s))
    .filter((s) => !fenster.some((f) => s.nr > f.entscheidung && s.nr < f.ergebnis))
    .map((s) => `${s.art} ${s.tabelle}`);
}

type Handler = Parameters<typeof anfrage>[1];

/** Der Handler der echten Datei unter `app/api` für eine Route des Vertrags. */
async function handlerVon(name: RoutenName): Promise<Handler> {
  const datei = path.join(APP, routenOrdner(name), "route.ts");
  const modul = (await import(datei)) as Record<string, unknown>;
  const handler = modul[API_ROUTEN[name].methode];
  expect(handler, `${name}: ${API_ROUTEN[name].methode} fehlt in ${datei}`).toBeTypeOf("function");
  return handler as Handler;
}

interface Stand {
  u: TestUmgebung;
  client: PGlite;
  /** Dose mit der Sitzung der Einrichtung (nach `einrichten`). */
  dose: Keksdose;
}

async function frisch(): Promise<Stand> {
  const { db, client } = await createTestDb();
  await schreibProtokollAnlegen(client);
  const u = await testUmgebung({ db });
  _ersetzeProzessDienste(u.dienste);
  await u.neuerCode(TEST_CODE);
  return { u, client, dose: vorabDose() };
}

const EINRICHTUNG = {
  setupCode: TEST_CODE,
  password: TEST_PASSWORT,
  passwordRepeat: TEST_PASSWORT,
  apiKey: TEST_SCHLUESSEL,
  modelSlug: TEST_MODELLE[0]?.slug,
  schleuseModeDefault: "off",
  botName: "Pai",
} as const;

/** Schickt eine Anfrage an die echte Route; Status nicht 2xx → Fehler mit Antwort. */
async function rufe(
  s: Stand,
  name: RoutenName,
  optionen: {
    params?: Record<string, string>;
    koerper?: unknown;
    abfrage?: string;
    dose?: Keksdose;
  } = {},
) {
  const params = optionen.params ?? {};
  const pfad = routenPfad(name, params as never) + (optionen.abfrage ?? "");
  if (API_ROUTEN[name].antwort === "download") return dateiAnfrage(s, name, pfad, optionen.dose);
  const r = await anfrage(s.u, await handlerVon(name), API_ROUTEN[name].methode, pfad, {
    dose: optionen.dose ?? s.dose,
    params,
    ...(optionen.koerper === undefined ? {} : { koerper: optionen.koerper }),
  });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`${name}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r;
}

/** Datei-Antwort (kein JSON): Anfrage wie `anfrage`, nur ohne Auspacken der Hülle. */
async function dateiAnfrage(s: Stand, name: RoutenName, pfad: string, dose = s.dose) {
  const kopf = new Headers({ origin: TEST_ORIGIN, "x-forwarded-for": "203.0.113.7" });
  const zeichen = pruefzeichenFuer(s.u, dose);
  if (zeichen) kopf.set(CSRF.header, zeichen);
  kopf.set("cookie", dose.kopf());
  const handler = await handlerVon(name);
  const antwort = await handler(
    new Request(`${TEST_ORIGIN}${pfad}`, { method: API_ROUTEN[name].methode, headers: kopf }),
    { params: Promise.resolve({}) },
  );
  if (antwort.status !== 200) throw new Error(`${name}: ${antwort.status} ${await antwort.text()}`);
  return { status: antwort.status, body: { ok: true }, antwort };
}

async function einrichten(): Promise<Stand> {
  const s = await frisch();
  await rufe(s, "einrichtungAbschliessen", { koerper: EINRICHTUNG });
  return s;
}

/** Eingerichtet, mit einer Unterhaltung und einem laufenden Lauf darin. */
async function mitUnterhaltung(): Promise<Stand & { unterhaltung: string }> {
  const s = await einrichten();
  await rufe(s, "unterhaltungAnlegen", { koerper: { title: "Beispiel" } });
  const [u] = await repo.conversations.list(s.u.db);
  if (u === undefined) throw new Error("keine Unterhaltung");
  return { ...s, unterhaltung: u.id };
}

async function anbieterId(s: Stand): Promise<string> {
  const [p] = await repo.providers.list(s.u.db);
  if (p === undefined) throw new Error("kein Anbieter");
  return p.id;
}

interface Fall {
  /** Bringt die Installation in den Zustand vor dem Aufruf. */
  vorher(): Promise<Stand & Partial<{ unterhaltung: string }>>;
  /** Parameter, Körper, Abfrage und Dose des Aufrufs. */
  aufruf(s: Stand & Partial<{ unterhaltung: string }>): Promise<{
    params?: Record<string, string>;
    koerper?: unknown;
    abfrage?: string;
    dose?: Keksdose;
  }>;
  /**
   * Schreiben, das diese Route bewusst vor dem ersten Beleg erledigt (mit Begründung im Kommentar
   * am Fall).
   */
  vorDemTor?(s: Schreiben): boolean;
  /** Die Aktion ändert keine Daten, der Beleg ist ihr einziges Ergebnis (z. B. Export). */
  nurBeleg?: true;
}

/** Ein Fall je Route mit Aktion: der Typ verlangt jeden Eintrag, der Test prüft es noch einmal. */
const AKTIONS_FAELLE: Record<AktionsRoute, Fall> = {
  einrichtungAbschliessen: {
    vorher: frisch,
    aufruf: async () => ({ koerper: EINRICHTUNG }),
    // Vor dem ersten Beleg kann es kein Tor geben: Signaturschlüssel, Einstellungs-Zeile und der
    // Start-Beleg entstehen zuerst (in derselben Transaktion wie die Aktionen danach).
    vorDemTor: (s) =>
      (s.tabelle === "installation_keys" && s.art === "INSERT") ||
      (s.tabelle === "settings" && s.art !== "DELETE"),
  },
  anmelden: {
    vorher: einrichten,
    aufruf: async () => ({ koerper: { password: TEST_PASSWORT }, dose: vorabDose() }),
  },
  abmelden: { vorher: einrichten, aufruf: async () => ({}) },
  alleAbmelden: { vorher: einrichten, aufruf: async () => ({}) },
  geraetEntfernen: {
    vorher: einrichten,
    aufruf: async (s) => {
      const [g] = await s.u.db.select().from(geraete);
      return { params: { id: g?.id ?? "" } };
    },
  },
  passwortAendern: {
    vorher: einrichten,
    aufruf: async () => ({
      koerper: { currentPassword: TEST_PASSWORT, newPassword: "Neues-Beispiel-Passwort-2026" },
    }),
  },
  unterhaltungAnlegen: { vorher: einrichten, aufruf: async () => ({ koerper: { title: "Neu" } }) },
  unterhaltungUmbenennen: {
    vorher: mitUnterhaltung,
    aufruf: async (s) => ({ params: { id: s.unterhaltung ?? "" }, koerper: { title: "Anders" } }),
  },
  unterhaltungLoeschen: {
    vorher: mitUnterhaltung,
    aufruf: async (s) => ({ params: { id: s.unterhaltung ?? "" } }),
  },
  nachrichtSenden: {
    vorher: mitUnterhaltung,
    aufruf: async (s) => ({
      params: { id: s.unterhaltung ?? "" },
      koerper: { text: "Hallo Pai", schleuse: "off" },
    }),
  },
  unterhaltungSchleuse: {
    vorher: mitUnterhaltung,
    aufruf: async (s) => ({ params: { id: s.unterhaltung ?? "" }, koerper: { mode: "off" } }),
  },
  laufAbbrechen: {
    vorher: async () => {
      const s = await mitUnterhaltung();
      await rufe(s, "nachrichtSenden", {
        params: { id: s.unterhaltung },
        koerper: { text: "Hallo Pai", schleuse: "off" },
      });
      return s;
    },
    aufruf: async (s) => {
      const lauf = await repo.runs.getActive(s.u.db, s.unterhaltung as never);
      if (lauf === undefined) throw new Error("kein Lauf");
      return { params: { id: s.unterhaltung ?? "", laufId: lauf.id } };
    },
  },
  botAendern: {
    vorher: einrichten,
    aufruf: async () => ({
      koerper: {
        name: "Pai",
        instructions: "Antworte kurz.",
        avatarShape: "blatt",
        color: "limette",
        maxOutputTokens: 512,
      },
    }),
  },
  botModell: {
    vorher: einrichten,
    aufruf: async (s) => {
      const modelle = await repo.models.list(s.u.db);
      const anderes = modelle.find((m) => m.slug === TEST_MODELLE[1]?.slug) ?? modelle[0];
      if (anderes === undefined) throw new Error("kein Modell");
      return { koerper: { modelId: anderes.id } };
    },
  },
  anbieterAnlegen: {
    vorher: einrichten,
    aufruf: async () => ({
      koerper: {
        name: "Zweiter Anbieter",
        baseUrl: "https://anbieter.example/v1",
        region: "eu",
        apiKey: TEST_SCHLUESSEL,
      },
    }),
  },
  anbieterAendern: {
    vorher: einrichten,
    aufruf: async (s) => {
      const [p] = await repo.providers.list(s.u.db);
      if (p === undefined) throw new Error("kein Anbieter");
      return {
        params: { id: p.id },
        koerper: { name: "Umbenannt", baseUrl: p.baseUrl, region: p.region },
      };
    },
  },
  anbieterLoeschen: {
    vorher: async () => {
      const s = await einrichten();
      await rufe(s, "anbieterAnlegen", {
        koerper: {
          name: "Wegwerf-Anbieter",
          baseUrl: "https://wegwerf.example/v1",
          region: "eu",
          apiKey: TEST_SCHLUESSEL,
        },
      });
      return s;
    },
    aufruf: async (s) => {
      const liste = await repo.providers.list(s.u.db);
      const weg = liste.find((p) => p.name === "Wegwerf-Anbieter");
      if (weg === undefined) throw new Error("kein Wegwerf-Anbieter");
      return { params: { id: weg.id } };
    },
  },
  datenschleuseStandard: { vorher: einrichten, aufruf: async () => ({ koerper: { mode: "off" } }) },
  einstellungenAendern: {
    vorher: einrichten,
    aufruf: async () => ({ koerper: { dailyTokenBudget: 50_000 } }),
  },
  belegeExport: { vorher: einrichten, aufruf: async () => ({}), nurBeleg: true },
  anbieterModelle: {
    vorher: einrichten,
    aufruf: async (s) => ({ params: { id: await anbieterId(s) } }),
  },
};

/**
 * Routen ohne Aktion. `null`: eigene Antwortform, im Test nicht aufrufbar (Health liest nur den
 * Zustand der Datenbank des Prozesses, der Ereignis-Strom bleibt offen); beide prüft die
 * Quelltext-Prüfung (`gate-pflicht-quelltext.test.ts`) und ihre eigenen Tests.
 */
const LESE_FAELLE: Record<LeseRoute, Fall | null> = {
  health: null,
  ereignisse: null,
  einrichtungStatus: { vorher: frisch, aufruf: async () => ({}) },
  einrichtungVerbindungstest: {
    vorher: frisch,
    aufruf: async () => ({ koerper: { setupCode: TEST_CODE, apiKey: TEST_SCHLUESSEL } }),
  },
  sitzungen: { vorher: einrichten, aufruf: async () => ({}) },
  geraete: { vorher: einrichten, aufruf: async () => ({}) },
  unterhaltungen: { vorher: mitUnterhaltung, aufruf: async () => ({}) },
  unterhaltung: {
    vorher: mitUnterhaltung,
    aufruf: async (s) => ({ params: { id: s.unterhaltung ?? "" } }),
  },
  nachrichten: {
    vorher: mitUnterhaltung,
    aufruf: async (s) => ({ params: { id: s.unterhaltung ?? "" } }),
  },
  bot: { vorher: einrichten, aufruf: async () => ({}) },
  anbieterListe: { vorher: einrichten, aufruf: async () => ({}) },
  anbieterVerbindungstest: {
    vorher: einrichten,
    aufruf: async (s) => ({ koerper: { providerId: await anbieterId(s) } }),
  },
  datenschleuse: { vorher: einrichten, aufruf: async () => ({}) },
  einstellungen: { vorher: einrichten, aufruf: async () => ({}) },
  belege: { vorher: einrichten, aufruf: async () => ({}) },
  beleg: {
    vorher: einrichten,
    aufruf: async (s) => {
      const kopf = await repo.belege.head(s.u.db);
      if (kopf === undefined) throw new Error("kein Beleg");
      return { params: { id: kopf.id } };
    },
  },
  belegPruefung: {
    vorher: einrichten,
    aufruf: async (s) => {
      const kopf = await repo.belege.head(s.u.db);
      if (kopf === undefined) throw new Error("kein Beleg");
      return { params: { id: kopf.id } };
    },
  },
  belegeKette: { vorher: einrichten, aufruf: async () => ({ abfrage: "?ab=1&anzahl=10" }) },
  belegeSchluessel: { vorher: einrichten, aufruf: async () => ({}) },
  regeln: { vorher: einrichten, aufruf: async () => ({}) },
};

/**
 * Bekannte Lücken: lesende Routen, die heute Daten schreiben, ohne durch das Tor zu gehen. Jeder
 * Eintrag nennt die Tabellen; ein Test meldet, sobald die Lücke geschlossen ist und der Eintrag weg
 * kann. Neue Einträge nur mit Issue.
 */
const BEKANNTE_LUECKEN: Partial<Record<LeseRoute, readonly string[]>> = {};

const ALLE = Object.keys(API_ROUTEN) as RoutenName[];
const MIT_AKTION = ALLE.filter((n) => "aktion" in API_ROUTEN[n]) as AktionsRoute[];
const OHNE_AKTION = ALLE.filter((n) => !("aktion" in API_ROUTEN[n])) as LeseRoute[];

describe("Tor-Pflicht: Fälle aus dem Routen-Vertrag", () => {
  it("jede Route des Vertrags hat genau einen Fall", () => {
    expect(Object.keys(AKTIONS_FAELLE).sort()).toEqual([...MIT_AKTION].sort());
    expect(Object.keys(LESE_FAELLE).sort()).toEqual([...OHNE_AKTION].sort());
    // Jede verändernde Route hat eine Aktion; nur die beiden ohne Antwort-Hülle fehlen im Aufruf.
    for (const n of ALLE) {
      if (API_ROUTEN[n].veraendernd) expect(MIT_AKTION, n).toContain(n);
    }
    const ausgelassen = OHNE_AKTION.filter((n) => LESE_FAELLE[n] === null).sort();
    expect(ausgelassen).toEqual(["ereignisse", "health"]);
  });
});

describe("Tor-Pflicht: verändernde Routen", () => {
  it.each(MIT_AKTION)(
    "%s: Entscheidung und Ergebnis, jede Änderung in der Ausführung",
    async (name) => {
      const def = API_ROUTEN[name];
      const fall = AKTIONS_FAELLE[name];
      const s = await fall.vorher();
      const optionen = await fall.aufruf(s);
      const ab = await letzteNr(s.client);
      const antwort = await rufe(s, name, optionen);
      const protokoll = await protokollAb(s.client, ab);
      const fenster = fensterAus(protokoll);

      // Genau eine Ausführung der Aktion dieser Route, mit beiden Belegen.
      const eigene = fenster.filter((f) => f.aktion === def.aktion);
      expect(eigene, `${name}: Belege der Aktion ${def.aktion}`).toHaveLength(1);
      // Die Route hat wirklich etwas verändert (sonst sagt die Fenster-Prüfung nichts).
      const geaendert = protokoll.filter((x) => !istBetrieb(x));
      if (fall.nurBeleg) expect(geaendert, name).toEqual([]);
      else expect(geaendert.length, `${name}: keine Änderung an Daten`).toBeGreaterThan(0);
      expect(ausserhalbDesTors(protokoll, fenster, fall.vorDemTor), name).toEqual([]);
      // Belege im Protokoll sind dieselben wie in der Tabelle (Ergebnis „ok“ der Aktion).
      const ergebnis = await repo.belege.listPage(s.u.db, { action: def.aktion, limit: 200 });
      const eintrag = ergebnis.items.find(
        (e) => e.body.type === "result" && e.body.action.actionId === eigene[0]?.aktionId,
      );
      expect(eintrag?.body.type === "result" && eintrag.body.result.status, name).toBe("ok");
      expect(antwort.status).toBeLessThan(300);
    },
  );
});

describe("Tor-Pflicht: lesende Routen", () => {
  const aufrufbar = OHNE_AKTION.filter((n) => LESE_FAELLE[n] !== null);
  it.each(aufrufbar)("%s: kein Beleg, keine Änderung an Daten", async (name) => {
    const fall = LESE_FAELLE[name] as Fall;
    const s = await fall.vorher();
    const optionen = await fall.aufruf(s);
    const ab = await letzteNr(s.client);
    await rufe(s, name, optionen);
    const protokoll = await protokollAb(s.client, ab);
    expect(protokoll.filter((x) => x.tabelle === "belege")).toEqual([]);
    const luecke = BEKANNTE_LUECKEN[name] ?? [];
    const geschrieben = protokoll.filter((x) => !istBetrieb(x));
    expect(
      geschrieben.filter((x) => !luecke.includes(x.tabelle)).map((x) => `${x.art} ${x.tabelle}`),
      name,
    ).toEqual([]);
    if (luecke.length > 0) {
      expect(
        geschrieben.length,
        `${name}: schreibt nichts mehr, Eintrag in BEKANNTE_LUECKEN entfernen`,
      ).toBeGreaterThan(0);
    }
  });
});
