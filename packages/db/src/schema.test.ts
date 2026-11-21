/**
 * PaiBot – Test: jede CHECK-Bedingung, jeder Fremdschlüssel und jeder eindeutige Index des Schemas greift.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  ACTIVE_RUN_STATUSES,
  fingerprintSchema,
  GATE_FORMAT,
  ID_PREFIX,
  type IdKind,
  newId,
  publicKeySchema,
  receiptBodyWriteSchema,
  STORED_ACTION_TYPES,
  sha256DigestSchema,
  signatureSchema,
  ZERO_PREV,
} from "@paibot/shared";
import { beforeAll, describe, expect, it } from "vitest";
import {
  belege,
  bots,
  conversationEvents,
  conversations,
  installationKeys,
  messages,
  models,
  owner,
  providers,
  rateLimits,
  rules,
  runs,
  sessions,
} from "./schema";
import { idPattern } from "./schema/helfer";
import {
  belegRow,
  botRow,
  conversationRow,
  fingerprint,
  keyRow,
  messageRow,
  modelRow,
  providerRow,
  publicKey,
  runRow,
  sha256Digest,
  signature,
} from "./testdaten";
import { createTestDb } from "./testing";

type Fehler = { code?: string; constraint?: string };

/** Führt die Anweisung aus und gibt den Datenbankfehler zurück; wirft, wenn sie gelingt. */
async function fehler(statement: PromiseLike<unknown>): Promise<Fehler> {
  try {
    await statement;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    return cause as Fehler;
  }
  throw new Error("Die Anweisung hätte scheitern müssen.");
}

const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let ctx: TestDb;
let providerId: ReturnType<typeof providerRow>["id"];
let modelId: ReturnType<typeof modelRow>["id"];
let botId: ReturnType<typeof botRow>["id"];
let conversationId: ReturnType<typeof conversationRow>["id"];
let ownerId: ReturnType<typeof newId<"owner">>;
let keyId: ReturnType<typeof keyRow>["id"];

/** Bestehende Grunddaten, auf die sich die Tests beziehen. */
const grund = {
  provider: providerRow(),
  bot: botRow(),
  conversation: conversationRow(newId("bot")),
};

beforeAll(async () => {
  ctx = await createTestDb();
  const { db } = ctx;
  await db.insert(providers).values(grund.provider);
  providerId = grund.provider.id;
  const model = modelRow(providerId);
  modelId = model.id;
  await db.insert(models).values(model);
  const bot = { ...grund.bot, modelId };
  botId = bot.id;
  await db.insert(bots).values(bot);
  const conversation = conversationRow(botId);
  conversationId = conversation.id;
  await db.insert(conversations).values(conversation);
  const message = messageRow(conversationId);

  await db.insert(messages).values(message);
  ownerId = newId("owner");
  await db.insert(owner).values({ id: ownerId, passwordHash: "scrypt$beispiel" });
  const key = keyRow();
  keyId = key.id;
  await db.insert(installationKeys).values(key);
  await ctx.client.query("insert into settings default values");
});

/** Prüft, dass das Einfügen mit dieser Abweichung am genannten Constraint scheitert. */
async function weistAb(
  table: Parameters<TestDb["db"]["insert"]>[0],
  row: object,
  code: string,
  constraint: string,
) {
  const f = await fehler(ctx.db.insert(table).values(row as never));
  expect({ code: f.code, constraint: f.constraint }).toEqual({ code, constraint });
}

describe("Beispiel-Werte passen zu den Verträgen", () => {
  it("Schlüssel, Signatur, Prüfsumme und Kurzform entsprechen den Schemas aus shared", () => {
    expect(publicKeySchema.safeParse(publicKey()).success).toBe(true);
    expect(signatureSchema.safeParse(signature()).success).toBe(true);
    expect(sha256DigestSchema.safeParse(sha256Digest()).success).toBe(true);
    expect(fingerprintSchema.safeParse(fingerprint()).success).toBe(true);
  });

  it("Beleg-Körper aus den Beispiel-Zeilen sind gültige Belege", () => {
    expect(receiptBodyWriteSchema.safeParse(belegRow(keyId).body).success).toBe(true);
    // Beispiel-Zeilen der Datenbank tragen keine Fassung; als Beleg dieser Fassung des Tors mit
    // Fassungsangabe und Vorbedingungen.
    const body = belegRow(keyId, { seq: 2, prevHash: sha256Digest(), type: "decision" })
      .body as unknown as { decision: Record<string, unknown> };
    expect(
      receiptBodyWriteSchema.safeParse({
        ...body,
        decision: { ...body.decision, gateFormat: GATE_FORMAT, preconditions: [] },
      }).success,
    ).toBe(true);
  });

  it("das ID-Muster der Datenbank nimmt jede ID aus newId an", () => {
    for (const kind of Object.keys(ID_PREFIX) as IdKind[]) {
      expect(new RegExp(idPattern(kind)).test(newId(kind))).toBe(true);
    }
  });
});

describe("settings", () => {
  it("hat genau die eine Zeile mit den Standardwerten", async () => {
    const result = await ctx.client.query(
      "select id, schleuse_mode_default as modus from settings",
    );
    expect(result.rows).toEqual([{ id: "singleton", modus: "off" }]);
  });

  it.each([
    ["eine zweite Zeile", "insert into settings (id) values ('zweite')", "settings_nur_eine_zeile"],
    ["unbekannte Sprache", "update settings set locale = 'fr'", "settings_locale_werte"],
    [
      "Modus auto",
      "update settings set schleuse_mode_default = 'auto'",
      "settings_schleuse_mode_werte",
    ],
    ["max_hops 0", "update settings set max_hops = 0", "settings_max_hops_positiv"],
    ["Tagesbudget 0", "update settings set daily_token_budget = 0", "settings_tagesbudget_positiv"],
    [
      "Verlaufsgrenze 0",
      "update settings set history_token_limit = 0",
      "settings_verlaufsgrenze_positiv",
    ],
    [
      "Installations-ID im falschen Format",
      "update settings set installation_id = 'ins_zu_kurz'",
      "settings_installation_id_format",
    ],
  ])("weist ab: %s", async (_name, statement, constraint) => {
    const f = await fehler(ctx.client.query(statement));
    expect({ code: f.code, constraint: f.constraint }).toEqual({ code: CHECK, constraint });
  });

  // Ohne den Trigger, der mit Besitzer jeden neuen Code abweist: hier zählen die CHECKs.
  it.each([
    [
      "Prüfwert des Einrichtungs-Codes im Klartext",
      "update settings set setup_code_hash = '123456', setup_code_created_at = now()",
      "settings_einrichtungs_code_format",
    ],
    [
      "Prüfwert des Einrichtungs-Codes ohne Zeitpunkt",
      `update settings set setup_code_hash = 'sha256:${"a".repeat(64)}'`,
      "settings_einrichtungs_code_paar",
    ],
    [
      "Einrichtungs-Code nach dem Abschluss",
      `update settings set setup_code_hash = 'sha256:${"a".repeat(64)}', setup_code_created_at = now(), setup_completed_at = now()`,
      "settings_einrichtungs_code_nur_vorher",
    ],
  ])("weist ab: %s", async (_name, statement, constraint) => {
    await ctx.client.query(
      "alter table settings disable trigger settings_einrichtungs_code_ohne_besitzer",
    );
    try {
      const f = await fehler(ctx.client.query(statement));
      expect({ code: f.code, constraint: f.constraint }).toEqual({ code: CHECK, constraint });
    } finally {
      await ctx.client.query(
        "alter table settings enable trigger settings_einrichtungs_code_ohne_besitzer",
      );
    }
  });

  it("weist einen unbekannten Standard-Bot ab", async () => {
    const f = await fehler(
      ctx.client.query("update settings set default_bot_id = $1", [newId("bot")]),
    );
    expect(f.code).toBe(FOREIGN_KEY);
  });
});

describe("owner und sessions", () => {
  it("lässt höchstens einen Besitzer zu", async () => {
    await weistAb(owner, { id: newId("owner"), passwordHash: "x" }, UNIQUE, "owner_einzige_zeile");
  });

  it("weist eine ID im falschen Format ab", async () => {
    await weistAb(owner, { id: "bes_x", passwordHash: "x" }, CHECK, "owner_id_format");
  });

  const gueltig = () => ({
    id: "a".repeat(64),
    ownerId,
    authLevel: "password",
    method: "password",
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  it("legt eine gültige Sitzung an", async () => {
    await ctx.db.insert(sessions).values(gueltig() as never);
  });

  it.each([
    ["ID ohne 64 Hex-Zeichen", { id: "abc" }, CHECK, "sessions_id_format"],
    ["ID in Großbuchstaben", { id: "A".repeat(64) }, CHECK, "sessions_id_format"],
    [
      "unbekannte Anmeldestufe",
      { id: "b".repeat(64), authLevel: "magic" },
      CHECK,
      "sessions_auth_level_werte",
    ],
    ["unbekannte Methode", { id: "c".repeat(64), method: "token" }, CHECK, "sessions_method_werte"],
    [
      "zu langer Browser-Name",
      { id: "d".repeat(64), userAgent: "x".repeat(201) },
      CHECK,
      "sessions_user_agent_laenge",
    ],
    [
      "Ablauf vor dem Anlegen",
      { id: "e".repeat(64), createdAt: new Date(), expiresAt: new Date(Date.now() - 1000) },
      CHECK,
      "sessions_ablauf_nach_start",
    ],
    ["doppelte ID", { id: "a".repeat(64) }, UNIQUE, "sessions_pkey"],
    [
      "unbekannter Besitzer",
      { id: "f".repeat(64), ownerId: newId("owner") },
      FOREIGN_KEY,
      "sessions_owner_id_owner_id_fk",
    ],
  ])("weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAb(sessions, { ...gueltig(), ...abweichung }, code, constraint);
  });
});

describe("rate_limits", () => {
  const fenster = new Date("2026-11-20T10:00:00Z");

  it("zählt je Schlüssel und Fenster eine Zeile", async () => {
    await ctx.db
      .insert(rateLimits)
      .values({ key: "anmelden:ip:::1", windowStart: fenster, count: 1 });
    await weistAb(
      rateLimits,
      { key: "anmelden:ip:::1", windowStart: fenster, count: 2 },
      UNIQUE,
      "rate_limits_key_window_start_pk",
    );
  });

  it.each([
    ["Schlüssel ohne Zweck", { key: "ohnedoppelpunkt" }, "rate_limits_key_format"],
    ["Schlüssel in Großbuchstaben", { key: "Anmelden:gesamt" }, "rate_limits_key_format"],
    ["zu langer Schlüssel", { key: `anmelden:${"x".repeat(200)}` }, "rate_limits_key_laenge"],
    ["negativer Zähler", { key: "anmelden:gesamt", count: -1 }, "rate_limits_count_nicht_negativ"],
  ])("weist ab: %s", async (_name, abweichung, constraint) => {
    await weistAb(rateLimits, { windowStart: fenster, count: 0, ...abweichung }, CHECK, constraint);
  });
});

describe("providers, models und bots", () => {
  it.each([
    ["ID im falschen Format", { id: "anb_x" }, CHECK, "providers_id_format"],
    ["unbekannte Art", { kind: "anthropic" }, CHECK, "providers_kind_werte"],
    ["unbekannte Region", { region: "mars" }, CHECK, "providers_region_werte"],
    ["leerer Name", { name: "" }, CHECK, "providers_name_laenge"],
    ["zu langer Name", { name: "x".repeat(101) }, CHECK, "providers_name_laenge"],
    ["Land in Kleinbuchstaben", { country: "de" }, CHECK, "providers_country_format"],
    ["Schlüssel im Klartext", { apiKeyEnc: "sk-geheim" }, CHECK, "providers_api_key_format"],
  ])("providers weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAb(providers, providerRow(abweichung as never), code, constraint);
  });

  it("providers: Basis-URL ist eindeutig", async () => {
    await weistAb(
      providers,
      providerRow({ baseUrl: grund.provider.baseUrl }),
      UNIQUE,
      "providers_base_url_eindeutig",
    );
  });

  it("providers: Land und Schlüssel dürfen fehlen", async () => {
    await ctx.db.insert(providers).values(providerRow({ country: null, apiKeyEnc: null }));
  });

  it.each([
    ["ID im falschen Format", { id: "mod_x" }, CHECK, "models_id_format"],
    ["leerer Slug", { slug: "" }, CHECK, "models_slug_laenge"],
    ["leerer Anzeigename", { displayName: "" }, CHECK, "models_display_name_laenge"],
    ["Kontextfenster 0", { contextWindow: 0 }, CHECK, "models_context_window_positiv"],
  ])("models weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAb(models, modelRow(providerId, abweichung as never), code, constraint);
  });

  it("models: Slug ist je Anbieter eindeutig", async () => {
    const [vorhanden] = (
      await ctx.client.query<{ slug: string }>("select slug from models where id = $1", [modelId])
    ).rows;
    await weistAb(
      models,
      modelRow(providerId, { slug: vorhanden?.slug }),
      UNIQUE,
      "models_provider_slug_eindeutig",
    );
  });

  it("models: unbekannter Anbieter wird abgewiesen", async () => {
    await weistAb(
      models,
      modelRow(newId("provider")),
      FOREIGN_KEY,
      "models_provider_id_providers_id_fk",
    );
  });

  it.each([
    ["ID im falschen Format", { id: "bot_x" }, CHECK, "bots_id_format"],
    ["leerer Name", { name: "" }, CHECK, "bots_name_laenge"],
    ["Name über 60 Zeichen", { name: "x".repeat(61) }, CHECK, "bots_name_laenge"],
    [
      "Anweisung über 8000 Zeichen",
      { instructions: "x".repeat(8001) },
      CHECK,
      "bots_instructions_laenge",
    ],
    ["unbekannte Form", { avatarShape: "kreis" }, CHECK, "bots_avatar_shape_werte"],
    ["unbekannte Farbe", { color: "braun" }, CHECK, "bots_color_werte"],
    ["Ausgabegrenze 0", { maxOutputTokens: 0 }, CHECK, "bots_max_output_tokens_positiv"],
    ["unbekanntes Modell", { modelId: newId("model") }, FOREIGN_KEY, "bots_model_id_models_id_fk"],
  ])("bots weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAb(bots, botRow(abweichung as never), code, constraint);
  });

  it("bots: Name ist eindeutig", async () => {
    await weistAb(bots, botRow({ name: grund.bot.name }), UNIQUE, "bots_name_eindeutig");
  });

  it("bots: Modell wird beim Löschen des Anbieters leer, der Bot bleibt", async () => {
    const provider = providerRow();
    await ctx.db.insert(providers).values(provider);
    const model = modelRow(provider.id);
    await ctx.db.insert(models).values(model);
    const bot = botRow({ modelId: model.id });
    await ctx.db.insert(bots).values(bot);

    await ctx.client.query("delete from providers where id = $1", [provider.id]);

    const result = await ctx.client.query<{ model_id: string | null }>(
      "select model_id from bots where id = $1",
      [bot.id],
    );
    expect(result.rows).toEqual([{ model_id: null }]);
  });
});

describe("conversations und messages", () => {
  it.each([
    ["ID im falschen Format", { id: "unt_x" }, CHECK, "conversations_id_format"],
    ["leerer Titel", { title: "" }, CHECK, "conversations_title_laenge"],
    ["Titel über 200 Zeichen", { title: "x".repeat(201) }, CHECK, "conversations_title_laenge"],
    ["Modus auto", { schleuseMode: "auto" }, CHECK, "conversations_schleuse_mode_werte"],
    ["unbekannter Bot", { botId: newId("bot") }, FOREIGN_KEY, "conversations_bot_id_bots_id_fk"],
  ])("conversations weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAb(conversations, conversationRow(botId, abweichung as never), code, constraint);
  });

  it("conversations: der Schalter darf leer sein, off und on sind erlaubt", async () => {
    for (const schleuseMode of [null, "off", "on"] as const) {
      await ctx.db.insert(conversations).values(conversationRow(botId, { schleuseMode }));
    }
  });

  it.each([
    ["ID im falschen Format", { id: "nac_x" }, CHECK, "messages_id_format"],
    ["Lauf-ID im falschen Format", { runId: "lau_x" }, CHECK, "messages_run_id_format"],
    ["Modell-ID im falschen Format", { modelId: "mod_x" }, CHECK, "messages_model_id_format"],
    [
      "Anbieter-ID im falschen Format",
      { providerId: "anb_x" },
      CHECK,
      "messages_provider_id_format",
    ],
    ["unbekannte Rolle", { role: "tool" }, CHECK, "messages_role_werte"],
    ["unbekannter Status", { status: "pending" }, CHECK, "messages_status_werte"],
    ["unbekannter Weg", { route: "umweg" }, CHECK, "messages_route_werte"],
    ["negative Eingabe-Token", { tokensIn: -1 }, CHECK, "messages_tokens_in_nicht_negativ"],
    ["negative Ausgabe-Token", { tokensOut: -1 }, CHECK, "messages_tokens_out_nicht_negativ"],
    [
      "Fehlercode im falschen Format",
      { errorCode: "Fehler 1" },
      CHECK,
      "messages_error_code_format",
    ],
    [
      "unbekannte Unterhaltung",
      { conversationId: newId("conversation") },
      FOREIGN_KEY,
      "messages_conversation_id_conversations_id_fk",
    ],
  ])("messages weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAb(messages, messageRow(conversationId, abweichung as never), code, constraint);
  });

  it("messages: Antwort mit Weg, Token und Fehlercode ist gültig", async () => {
    await ctx.db.insert(messages).values(
      messageRow(conversationId, {
        role: "assistant",
        status: "failed",
        route: "schleuse",
        tokensIn: 10,
        tokensOut: 0,
        errorCode: "anbieter_nicht_erreichbar",
        runId: newId("run"),
        modelId,
        providerId,
      }),
    );
  });
});

describe("runs", () => {
  /** Eigene Unterhaltung mit Nachricht, damit sich die Läufe nicht stören. */
  async function frischeUnterhaltung() {
    const conversation = conversationRow(botId);
    await ctx.db.insert(conversations).values(conversation);
    const message = messageRow(conversation.id);
    await ctx.db.insert(messages).values(message);
    return { conversationId: conversation.id, triggerMessageId: message.id, botId };
  }

  it.each([
    ["ID im falschen Format", { id: "lau_x" }, CHECK, "runs_id_format"],
    ["unbekannter Zustand", { status: "paused" }, CHECK, "runs_status_werte"],
    ["Fehlercode im falschen Format", { errorCode: "Fehler" }, CHECK, "runs_error_code_format"],
    [
      "unbekannter Auslöser",
      { triggerMessageId: newId("message") },
      FOREIGN_KEY,
      "runs_trigger_message_id_messages_id_fk",
    ],
    ["unbekannter Bot", { botId: newId("bot") }, FOREIGN_KEY, "runs_bot_id_bots_id_fk"],
    [
      "unbekannter fortgesetzter Lauf",
      { resumesRunId: newId("run") },
      FOREIGN_KEY,
      "runs_resumes_run_id_runs_id_fk",
    ],
  ])("weist ab: %s", async (_name, abweichung, code, constraint) => {
    const ids = await frischeUnterhaltung();
    await weistAb(runs, runRow(ids, abweichung as never), code, constraint);
  });

  it("weist einen Lauf ab, der sich selbst fortsetzt", async () => {
    const ids = await frischeUnterhaltung();
    const id = newId("run");
    await weistAb(runs, runRow(ids, { id, resumesRunId: id }), CHECK, "runs_resumes_run_id_anders");
  });

  it("weist einen unbekannten Zustand für unbekannte Unterhaltung ab", async () => {
    const ids = await frischeUnterhaltung();
    await weistAb(
      runs,
      runRow({ ...ids, conversationId: newId("conversation") }),
      FOREIGN_KEY,
      "runs_conversation_id_conversations_id_fk",
    );
  });

  it.each([
    ["queued", "queued"],
    ["queued", "running"],
    ["running", "running"],
    ["running", "waiting_approval"],
    ["waiting_approval", "queued"],
    ["waiting_approval", "waiting_approval"],
  ] as const)("höchstens ein offener Lauf je Unterhaltung: %s und %s", async (erster, zweiter) => {
    const ids = await frischeUnterhaltung();
    await ctx.db.insert(runs).values(runRow(ids, { status: erster }));
    await weistAb(
      runs,
      runRow(ids, { status: zweiter }),
      UNIQUE,
      "runs_ein_offener_lauf_je_unterhaltung",
    );
  });

  it("der Teil-Index für offene Läufe meint dieselben Zustände wie ACTIVE_RUN_STATUSES", async () => {
    const result = await ctx.client.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'runs_ein_offener_lauf_je_unterhaltung'",
    );
    const definition = result.rows[0]?.indexdef ?? "";
    const bedingung = definition.split(/\bWHERE\b/i)[1] ?? "";
    const zustaende = [...bedingung.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(zustaende.sort()).toEqual([...ACTIVE_RUN_STATUSES].sort());
  });

  it("beendete Läufe zählen nicht, mehrere dürfen nebeneinander stehen", async () => {
    const ids = await frischeUnterhaltung();
    for (const status of ["succeeded", "failed", "cancelled", "denied", "succeeded"] as const) {
      await ctx.db.insert(runs).values(runRow(ids, { status }));
    }
    await ctx.db.insert(runs).values(runRow(ids, { status: "queued" }));
  });

  it("nach dem Ende eines offenen Laufs ist ein neuer erlaubt", async () => {
    const ids = await frischeUnterhaltung();
    const erster = runRow(ids, { status: "running" });
    await ctx.db.insert(runs).values(erster);
    await ctx.client.query("update runs set status = 'succeeded' where id = $1", [erster.id]);
    await ctx.db.insert(runs).values(runRow(ids, { status: "queued" }));
  });

  it("offene Läufe verschiedener Unterhaltungen stören sich nicht", async () => {
    const a = await frischeUnterhaltung();
    const b = await frischeUnterhaltung();
    await ctx.db.insert(runs).values(runRow(a, { status: "running" }));
    await ctx.db.insert(runs).values(runRow(b, { status: "running" }));
  });

  it("ein wartender Lauf wird durch einen neuen Lauf mit resumes_run_id fortgesetzt", async () => {
    const ids = await frischeUnterhaltung();
    const wartend = runRow(ids, { status: "waiting_approval" });
    await ctx.db.insert(runs).values(wartend);
    await ctx.client.query("update runs set status = 'succeeded' where id = $1", [wartend.id]);

    const fortsetzung = runRow(ids, { status: "queued", resumesRunId: wartend.id });
    await ctx.db.insert(runs).values(fortsetzung);

    const result = await ctx.client.query<{ resumes_run_id: string }>(
      "select resumes_run_id from runs where id = $1",
      [fortsetzung.id],
    );
    expect(result.rows).toEqual([{ resumes_run_id: wartend.id }]);
  });
});

describe("conversation_events", () => {
  const ereignis = (abweichung: object = {}) => ({
    conversationId,
    seq: 1,
    type: "run.queued",
    payload: { runId: newId("run") },
    ...abweichung,
  });

  it("legt ein Ereignis an und lässt das Aufräumen für text.delta zu", async () => {
    await ctx.db.insert(conversationEvents).values(ereignis() as never);
  });

  it.each([
    ["laufende Nummer 0", { seq: 0 }, CHECK, "conversation_events_seq_ab_eins"],
    ["unbekannter Typ", { seq: 2, type: "run.exploded" }, CHECK, "conversation_events_type_werte"],
    ["Daten als Liste", { seq: 3, payload: [] }, CHECK, "conversation_events_payload_objekt"],
    [
      "Lauf-ID im falschen Format",
      { seq: 4, runId: "lau_x" },
      CHECK,
      "conversation_events_run_id_format",
    ],
    ["doppelte laufende Nummer", { seq: 1 }, UNIQUE, "conversation_events_conversation_id_seq_pk"],
    [
      "unbekannte Unterhaltung",
      { seq: 5, conversationId: newId("conversation") },
      FOREIGN_KEY,
      "conversation_events_conversation_id_conversations_id_fk",
    ],
  ])("weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAb(conversationEvents, ereignis(abweichung), code, constraint);
  });

  it("jeder Ereignistyp aus den Verträgen ist erlaubt", async () => {
    const { CONVERSATION_EVENT_TYPES } = await import("@paibot/shared");
    const unterhaltung = conversationRow(botId);
    await ctx.db.insert(conversations).values(unterhaltung);
    let seq = 0;
    for (const type of CONVERSATION_EVENT_TYPES) {
      seq += 1;
      await ctx.db
        .insert(conversationEvents)
        .values(ereignis({ conversationId: unterhaltung.id, seq, type }) as never);
    }
  });
});

describe("rules", () => {
  const regel = (abweichung: object = {}) => ({
    id: "R-100",
    version: 1,
    action: "nachricht.senden",
    effect: "allow",
    stage: "execute",
    conditions: [],
    priority: 500,
    source: "standard",
    title: "Beispiel",
    reason: "Zum Testen.",
    ...abweichung,
  });
  const eigeneId = newId("rule");

  it.each(["rules_action_werte", "belege_action_werte"])(
    "%s kennt genau die Aktionen der Verträge",
    async (name) => {
      const result = await ctx.client.query<{ definition: string }>(
        "select pg_get_constraintdef(oid) as definition from pg_constraint where conname = $1",
        [name],
      );
      const definition = result.rows[0]?.definition ?? "";
      const werte = [...definition.matchAll(/'([a-z_.*]+)'/g)]
        .map((m) => m[1])
        .filter((wert) => wert !== "*");
      expect(werte.sort()).toEqual([...STORED_ACTION_TYPES].sort());
    },
  );

  it("legt Regeln an: neue Fassung ist eine neue Zeile, eigene Regel mit reg_ nur ausgeschaltet", async () => {
    await ctx.db.insert(rules).values(regel() as never);
    await ctx.db.insert(rules).values(regel({ version: 2 }) as never);
    await ctx.db.insert(rules).values(
      regel({
        id: eigeneId,
        action: "*",
        source: "owner",
        enabled: false,
        priority: 1000,
      }) as never,
    );
    await ctx.db
      .insert(rules)
      .values(
        regel({ id: newId("rule"), source: "proposal", enabled: false, priority: 999999 }) as never,
      );
  });

  it.each([
    ["ID im falschen Format", { id: "X-1" }, CHECK, "rules_id_format"],
    ["Fassung 0", { version: 0, id: "R-101" }, CHECK, "rules_version_positiv"],
    ["unbekannte Aktion", { id: "R-102", action: "alles.loeschen" }, CHECK, "rules_action_werte"],
    ["unbekannte Wirkung", { id: "R-103", effect: "maybe" }, CHECK, "rules_effect_werte"],
    ["unbekannte Stufe", { id: "R-104", stage: "later" }, CHECK, "rules_stage_werte"],
    [
      "unbekannte Herkunft",
      { id: eigeneId, version: 5, source: "bot", enabled: false, priority: 1000 },
      CHECK,
      "rules_source_werte",
    ],
    ["Bedingungen als Objekt", { id: "R-106", conditions: {} }, CHECK, "rules_conditions_liste"],
    ["Priorität unter 0", { id: "R-107", priority: -1 }, CHECK, "rules_priority_bereich"],
    [
      "Priorität über 1000000",
      { id: eigeneId, version: 8, source: "owner", enabled: false, priority: 1000001 },
      CHECK,
      "rules_priority_bereich",
    ],
    ["leerer Titel", { id: "R-109", title: "" }, CHECK, "rules_title_laenge"],
    ["leere Begründung", { id: "R-110", reason: "" }, CHECK, "rules_reason_laenge"],
    ["doppelte Fassung", { id: "R-100", version: 1 }, UNIQUE, "rules_id_version_pk"],
    [
      "eigene Regel unter einer Standard-Kennung",
      { id: "R-111", source: "owner", enabled: false, priority: 1000 },
      CHECK,
      "rules_kennung_passt_zur_quelle",
    ],
    [
      "Standard-Regel mit erzeugter Kennung",
      { id: eigeneId, version: 9 },
      CHECK,
      "rules_kennung_passt_zur_quelle",
    ],
    [
      "eingeschaltete eigene Regel",
      { id: eigeneId, version: 11, source: "owner", priority: 1000 },
      CHECK,
      "rules_eigene_nur_aus",
    ],
    [
      "eigene Regel vor den Standard-Regeln",
      { id: eigeneId, version: 12, source: "owner", enabled: false, priority: 0 },
      CHECK,
      "rules_prioritaet_je_quelle",
    ],
    [
      "eigene Regel hinter der Auffang-Regel",
      { id: eigeneId, version: 13, source: "owner", enabled: false, priority: 1000000 },
      CHECK,
      "rules_prioritaet_je_quelle",
    ],
    [
      "Standard-Regel im Band der eigenen",
      { id: "R-112", priority: 1000 },
      CHECK,
      "rules_prioritaet_je_quelle",
    ],
  ])("weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAb(rules, regel(abweichung), code, constraint);
  });
});

describe("rules: Vorschläge", () => {
  it("ein eingeschalteter Vorschlag wird abgewiesen, auch wenn eigene Regeln später aktiv sein dürfen", async () => {
    await ctx.client.query("alter table rules drop constraint rules_eigene_nur_aus");
    await weistAb(
      rules,
      {
        id: newId("rule"),
        version: 1,
        action: "nachricht.senden",
        effect: "allow",
        stage: "execute",
        conditions: [],
        priority: 1000,
        source: "proposal",
        title: "Vorschlag",
        reason: "Zum Testen.",
      },
      CHECK,
      "rules_vorschlag_nie_aktiv",
    );
  });
});

describe("installation_keys", () => {
  it.each([
    ["ID im falschen Format", { id: "sch_x" }, CHECK, "installation_keys_id_format"],
    ["unbekannter Zweck", { purpose: "backup" }, CHECK, "installation_keys_purpose_werte"],
    [
      "öffentlicher Schlüssel im falschen Format",
      { publicKey: "kurz" },
      CHECK,
      "installation_keys_public_key_format",
    ],
    [
      "privater Schlüssel im Klartext",
      { privateKeyEnc: "geheim" },
      CHECK,
      "installation_keys_private_key_format",
    ],
    [
      "Kurzform des Schlüssels im falschen Format",
      { fingerprint: "12345678" },
      CHECK,
      "installation_keys_fingerprint_format",
    ],
  ])("weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAb(
      installationKeys,
      keyRow({ retiredAt: new Date(), ...abweichung } as never),
      code,
      constraint,
    );
  });

  it("öffentlicher Schlüssel ist eindeutig", async () => {
    const [vorhanden] = (
      await ctx.client.query<{ public_key: string }>(
        "select public_key from installation_keys where id = $1",
        [keyId],
      )
    ).rows;
    await weistAb(
      installationKeys,
      keyRow({ publicKey: vorhanden?.public_key, retiredAt: new Date() }),
      UNIQUE,
      "installation_keys_public_key_eindeutig",
    );
  });

  it("höchstens ein aktiver Schlüssel; ein ausgemusterter und ein neuer sind erlaubt", async () => {
    await weistAb(installationKeys, keyRow(), UNIQUE, "installation_keys_ein_aktiver_schluessel");

    await ctx.client.query("update installation_keys set retired_at = now() where id = $1", [
      keyId,
    ]);
    await ctx.db.insert(installationKeys).values(keyRow());
    await ctx.db.insert(installationKeys).values(keyRow({ retiredAt: new Date() }));
  });
});

/** Zeile mit Abweichung; der Körper folgt den Feldern der Zeile, damit nur die Abweichung greift. */
function mit(eintrag: ReturnType<typeof belegRow>, abweichung: object = {}) {
  const zeile = { ...eintrag, ...abweichung } as ReturnType<typeof belegRow>;
  const koerper = (abweichung as { body?: unknown }).body;
  if (Array.isArray(koerper)) return { ...zeile, body: koerper as never };
  const vorher = eintrag.body as { action?: { target?: object } };
  const aktion =
    vorher.action === undefined
      ? {}
      : {
          action: {
            ...vorher.action,
            actionId: zeile.actionId,
            type: zeile.action,
            actor: zeile.actor,
            target: { ...vorher.action.target, conversationId: zeile.conversationId },
          },
        };
  return {
    ...zeile,
    body: {
      ...eintrag.body,
      ...aktion,
      type: zeile.entryType,
      id: zeile.id,
      seq: zeile.seq,
      prev: zeile.prevHash,
      keyId: zeile.keyId,
      ...(koerper as object | undefined),
    },
  };
}

describe("belege", () => {
  it("nimmt eine Kette aus Anfang und Folge-Einträgen an", async () => {
    const [aktiv] = (
      await ctx.client.query<{ id: string }>(
        "select id from installation_keys where retired_at is null",
      )
    ).rows;
    const schluessel = aktiv?.id as typeof keyId;

    const eins = belegRow(schluessel, { seq: 1, prevHash: ZERO_PREV });
    const zwei = belegRow(schluessel, { seq: 2, prevHash: eins.hash });
    const drei = belegRow(schluessel, { seq: 3, prevHash: zwei.hash });
    for (const eintrag of [eins, zwei, drei]) await ctx.db.insert(belege).values(eintrag);

    const result = await ctx.client.query<{ seq: number }>("select seq from belege order by seq");
    expect(result.rows.map((r) => Number(r.seq))).toEqual([1, 2, 3]);
  });

  /** Gültiger vierter Eintrag, an den die Tests ihre Abweichung hängen. */
  async function vierter() {
    const kopf = (
      await ctx.client.query<{ hash: string; key_id: string }>(
        "select hash, key_id from belege order by seq desc limit 1",
      )
    ).rows[0];
    return {
      keyId: kopf?.key_id as typeof keyId,
      eintrag: belegRow(kopf?.key_id as typeof keyId, {
        seq: 4,
        prevHash: kopf?.hash as string,
        type: "decision",
      }),
    };
  }

  it.each([
    ["laufende Nummer 0", { seq: 0 }, CHECK, "belege_seq_ab_eins"],
    ["ID im falschen Format", { id: "blg_x" }, CHECK, "belege_id_format"],
    [
      "unbekannter Typ",
      { entryType: "foo", actionId: null, action: null, actor: null },
      CHECK,
      "belege_entry_type_werte",
    ],
    ["Aktions-ID im falschen Format", { actionId: "akt_x" }, CHECK, "belege_action_id_format"],
    ["unbekannte Aktion", { action: "alles.loeschen" }, CHECK, "belege_action_werte"],
    ["unbekannter Akteur", { actor: "jemand" }, CHECK, "belege_actor_format"],
    [
      "Unterhaltungs-ID im falschen Format",
      { conversationId: "unt_x" },
      CHECK,
      "belege_conversation_id_format",
    ],
    [
      "Entscheidung ohne Aktion",
      { actionId: null, action: null, actor: null },
      CHECK,
      "belege_aktion_nur_bei_entscheidung_und_ergebnis",
    ],
    [
      "Vorgänger-Prüfsumme im falschen Format",
      { prevHash: "sha256:abc" },
      CHECK,
      "belege_prev_hash_format",
    ],
    ["Prüfsumme im falschen Format", { hash: "md5:abc" }, CHECK, "belege_hash_format"],
    ["Signatur im falschen Format", { signature: "kurz" }, CHECK, "belege_signature_format"],
    ["Folge-Eintrag mit Null als Vorgänger", { prevHash: ZERO_PREV }, CHECK, "belege_kettenanfang"],
    ["Körper ist keine Objekt", { body: [] }, CHECK, "belege_body_objekt"],
    [
      "Körper mit anderem Typ als die Zeile",
      { body: { type: "result" } },
      CHECK,
      "belege_body_passt_zur_zeile",
    ],
    [
      "unbekannter Schlüssel",
      { keyId: newId("key") },
      FOREIGN_KEY,
      "belege_key_id_installation_keys_id_fk",
    ],
    [
      "Körper mit anderer ID",
      { body: { id: newId("receipt") } },
      CHECK,
      "belege_body_passt_zur_zeile",
    ],
    [
      "Körper mit anderem Vorgänger",
      { body: { prev: `sha256:${"e".repeat(64)}` } },
      CHECK,
      "belege_body_passt_zur_zeile",
    ],
    [
      "Körper mit anderem Schlüssel",
      { body: { keyId: newId("key") } },
      CHECK,
      "belege_body_passt_zur_zeile",
    ],
    ["Körper mit anderer Nummer", { body: { seq: 99 } }, CHECK, "belege_spalten_aus_koerper"],
    [
      "Körper mit anderer Aktions-ID",
      {
        body: {
          action: {
            actionId: newId("action"),
            type: "unterhaltung.loeschen",
            actor: "besitzer",
            target: {},
          },
        },
      },
      CHECK,
      "belege_spalten_aus_koerper",
    ],
    [
      "Entscheidung, deren Körper keine Aktion nennt",
      { body: { action: undefined }, conversationId: newId("conversation") },
      CHECK,
      "belege_spalten_aus_koerper",
    ],
  ])("weist ab: %s", async (_name, abweichung, code, constraint) => {
    const { eintrag } = await vierter();
    await weistAb(belege, mit(eintrag, abweichung), code, constraint);
  });

  it("weist einen Anfangs-Eintrag mit Aktion ab", async () => {
    const { keyId: schluessel } = await vierter();
    const anfang = belegRow(schluessel, { seq: 1, prevHash: ZERO_PREV });
    await weistAb(
      belege,
      {
        ...anfang,
        seq: 9,
        id: newId("receipt"),
        actionId: newId("action"),
        action: "bot.aendern",
        actor: "besitzer",
      },
      CHECK,
      "belege_aktion_nur_bei_entscheidung_und_ergebnis",
    );
  });

  it("weist eine Nummer 1 mit anderem Vorgänger als Null ab", async () => {
    const { eintrag } = await vierter();
    await weistAb(belege, mit(eintrag, { seq: 1 }), CHECK, "belege_kettenanfang");
  });

  it("verbietet doppelte Nummer, ID, Prüfsumme und Vorgänger", async () => {
    const { eintrag } = await vierter();
    await ctx.db.insert(belege).values(eintrag);
    const naechster = (abweichung: object) => {
      const frisch = belegRow(eintrag.keyId, { seq: 5, prevHash: eintrag.hash, type: "decision" });
      return mit(frisch, abweichung);
    };

    await weistAb(belege, naechster({ seq: 4 }), UNIQUE, "belege_pkey");
    await weistAb(belege, naechster({ id: eintrag.id }), UNIQUE, "belege_id_eindeutig");
    await weistAb(belege, naechster({ hash: eintrag.hash }), UNIQUE, "belege_hash_eindeutig");
    const verzweigung = belegRow(eintrag.keyId, {
      seq: 5,
      prevHash: eintrag.prevHash,
      type: "decision",
    });
    await weistAb(belege, verzweigung, UNIQUE, "belege_prev_hash_eindeutig");
  });

  it("der Schlüssel eines Belegs lässt sich nicht löschen", async () => {
    const { keyId: schluessel } = await vierter();
    const f = await fehler(
      ctx.client.query("delete from installation_keys where id = $1", [schluessel]),
    );
    expect(f.code).toBe("23001");
  });

  it("nimmt Schlüsselwechsel an, signiert vom bisherigen oder vom neuen Schlüssel", async () => {
    const kopf = (
      await ctx.client.query<{ seq: number; hash: string; key_id: string }>(
        "select seq, hash, key_id from belege order by seq desc limit 1",
      )
    ).rows[0];
    const bisher = kopf?.key_id as typeof keyId;
    const neu = keyRow({ retiredAt: new Date() });
    await ctx.db.insert(installationKeys).values(neu);

    let seq = Number(kopf?.seq);
    let prevHash = kopf?.hash as string;
    for (const signedBy of ["previous", "new"] as const) {
      seq += 1;
      const zeile = belegRow(bisher, { seq, prevHash });
      const signierer = signedBy === "new" ? neu.id : bisher;
      const body = receiptBodyWriteSchema.parse({
        v: 1,
        id: zeile.id,
        seq,
        time: new Date().toISOString(),
        type: "key_change",
        facts: { newKeyId: neu.id, publicKey: neu.publicKey, previousKeyId: bisher, signedBy },
        prev: prevHash,
        keyId: signierer,
      });
      await ctx.db.insert(belege).values({
        ...zeile,
        entryType: "key_change",
        actionId: null,
        action: null,
        actor: null,
        conversationId: null,
        keyId: signierer,
        body,
      });
      prevHash = zeile.hash;
    }
  });
});
