/**
 * PaiBot – Tests für Fachobjekte, API-Eingaben und gemeinsame Konstanten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import {
  COOKIE,
  CSRF,
  cookieName,
  EVENT_NOTIFY_CHANNEL,
  LIMITS,
  RATE_LIMIT_KEYS,
  STAND_HEADER,
  STORAGE_KEYS,
} from "./constants";
import { isoTimeSchema } from "./grundtypen";
import { idSchema, newId } from "./id";
import {
  botInput,
  connectionTestInput,
  conversationCreateInput,
  conversationRenameInput,
  lastEventIdSchema,
  loginInput,
  modelChoiceInput,
  passwordChangeInput,
  providerInput,
  receiptChainQuery,
  receiptListQuery,
  schleuseInput,
  sendMessageInput,
  settingsInput,
  setupCodeSchema,
  setupInput,
} from "./inputs";
import {
  ACTIVE_RUN_STATUSES,
  botSchema,
  conversationSchema,
  messageSchema,
  modelSchema,
  providerSchema,
  runSchema,
  sessionSchema,
  settingsSchema,
} from "./objects";

const time = "2026-11-20T10:00:00.000Z";
const conversationId = idSchema("conversation").parse("unt_06f8k2m9qz3w7x1c4b5n8p0r2t");
const ownerId = idSchema("owner").parse("bes_06f8k2m9qz3w7x1c4b5n8p0r2t");

describe("Zeitpunkte", () => {
  it("nur UTC mit Millisekunden", () => {
    expect(isoTimeSchema.safeParse(time).success).toBe(true);
    for (const value of [
      "2026-11-20T10:00:00Z",
      "2026-11-20T10:00:00.000+00:00",
      "2026-13-01T00:00:00.000Z",
      "2026-02-30T00:00:00.000Z",
    ]) {
      expect(isoTimeSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("Läufe", () => {
  it("ein wartender Lauf zählt als aktiv", () => {
    expect(ACTIVE_RUN_STATUSES).toEqual(["queued", "running", "waiting_approval"]);
  });
});

describe("Fachobjekte", () => {
  it("nehmen vollständige Beispiele an und lassen optionale Felder weg", () => {
    const examples = [
      [
        conversationSchema,
        {
          id: conversationId,
          botId: newId("bot"),
          title: "Woche planen",
          createdAt: time,
          updatedAt: time,
        },
      ],
      [
        messageSchema,
        {
          id: newId("message"),
          conversationId,
          role: "assistant",
          content: "Hallo",
          status: "complete",
          route: "direct",
          tokensIn: 3,
          tokensOut: 5,
          createdAt: time,
        },
      ],
      [
        runSchema,
        {
          id: newId("run"),
          conversationId,
          triggerMessageId: newId("message"),
          botId: newId("bot"),
          status: "queued",
          createdAt: time,
        },
      ],
      [
        botSchema,
        {
          id: newId("bot"),
          name: "Pai",
          instructions: "",
          avatarShape: "blatt",
          color: "limette",
          maxOutputTokens: 2048,
          createdAt: time,
          updatedAt: time,
        },
      ],
      [
        providerSchema,
        {
          id: newId("provider"),
          kind: "openai_compatible",
          templateKey: "eurouter",
          name: "EUrouter",
          baseUrl: "https://api.eurouter.ai/v1",
          keySet: true,
          region: "eu",
          enabled: true,
          createdAt: time,
          updatedAt: time,
        },
      ],
      [
        modelSchema,
        {
          id: newId("model"),
          providerId: newId("provider"),
          slug: "beispiel-klein",
          displayName: "Beispiel-Modell Klein",
          enabled: true,
          createdAt: time,
        },
      ],
      [
        settingsSchema,
        {
          locale: "de",
          timezone: "Europe/Berlin",
          schleuseModeDefault: "off",
          maxHops: 8,
          killSwitch: false,
          createdAt: time,
          updatedAt: time,
        },
      ],
      [
        sessionSchema,
        {
          id: "a".repeat(64),
          ownerId,
          authLevel: "password",
          method: "password",
          createdAt: time,
          lastSeenAt: time,
          expiresAt: time,
          current: true,
        },
      ],
    ] as const;
    for (const [schema, value] of examples) {
      expect(schema.parse(value)).toEqual(value);
      expect(schema.safeParse({ ...value, unbekannt: 1 }).success).toBe(false);
    }
  });

  it("lehnen null, alte Werte und falsche IDs ab", () => {
    const conversation = {
      id: conversationId,
      botId: newId("bot"),
      title: "x",
      createdAt: time,
      updatedAt: time,
    };
    expect(conversationSchema.safeParse({ ...conversation, schleuseMode: null }).success).toBe(
      false,
    );
    expect(conversationSchema.safeParse({ ...conversation, schleuseMode: "auto" }).success).toBe(
      false,
    );
    expect(conversationSchema.safeParse({ ...conversation, botId: conversationId }).success).toBe(
      false,
    );
    expect(conversationSchema.safeParse({ ...conversation, title: "" }).success).toBe(false);
    expect(
      settingsSchema.safeParse({
        locale: "de",
        timezone: "Mars/Olymp",
        schleuseModeDefault: "off",
        maxHops: 8,
        killSwitch: false,
        createdAt: time,
        updatedAt: time,
      }).success,
    ).toBe(false);
    expect(
      sessionSchema.safeParse({
        id: "A".repeat(64),
        ownerId,
        authLevel: "password",
        method: "password",
        createdAt: time,
        lastSeenAt: time,
        expiresAt: time,
        current: true,
      }).success,
    ).toBe(false);
  });
});

describe("Eingaben", () => {
  it("Nachricht: nicht leer, Grenzwert genau bei der Höchstlänge", () => {
    expect(sendMessageInput.parse({ text: "Hallo", schleuse: "on" })).toEqual({
      text: "Hallo",
      schleuse: "on",
    });
    expect(
      sendMessageInput.safeParse({ text: "x".repeat(LIMITS.messageChars), schleuse: "off" })
        .success,
    ).toBe(true);
    expect(
      sendMessageInput.safeParse({ text: "x".repeat(LIMITS.messageChars + 1), schleuse: "off" })
        .success,
    ).toBe(false);
    expect(sendMessageInput.safeParse({ text: "  \n ", schleuse: "off" }).success).toBe(false);
    expect(sendMessageInput.safeParse({ text: "Hallo", schleuse: "auto" }).success).toBe(false);
    expect(sendMessageInput.safeParse({ text: "Hallo" }).success).toBe(false);
  });

  it("Einrichtungs-Code: tolerante Eingabe, feste Ausgabe", () => {
    for (const value of ["K7QD-9M2F-XW4H", "k7qd9m2fxw4h", "K7QD 9M2F XW4H", " k7qd-9m2f-xw4h "]) {
      expect(setupCodeSchema.parse(value)).toBe("K7QD-9M2F-XW4H");
    }
    for (const value of [
      "K7QD-9M2F-XW4",
      "K7QD-9M2F-XW4HH",
      "K7QD-9M2F-XW4I",
      "K7QD-9M2F-XW4U",
      "",
    ]) {
      expect(setupCodeSchema.safeParse(value).success).toBe(false);
    }
  });

  it("Einrichtung: Passwort mindestens 12 Zeichen, zweimal gleich", () => {
    const base = {
      setupCode: "k7qd9m2fxw4h",
      password: "x".repeat(12),
      passwordRepeat: "x".repeat(12),
      schleuseModeDefault: "off",
      botName: "Pai",
    };
    expect(setupInput.parse(base).setupCode).toBe("K7QD-9M2F-XW4H");
    expect(
      setupInput.safeParse({ ...base, password: "x".repeat(11), passwordRepeat: "x".repeat(11) })
        .success,
    ).toBe(false);
    expect(setupInput.safeParse({ ...base, passwordRepeat: "y".repeat(12) }).success).toBe(false);
    expect(setupInput.safeParse({ ...base, modelSlug: "beispiel-klein" }).success).toBe(false);
    expect(
      setupInput.safeParse({ ...base, apiKey: "sk-test", modelSlug: "beispiel-klein" }).success,
    ).toBe(true);
    expect(setupInput.safeParse({ ...base, botName: "   " }).success).toBe(false);
  });

  it("Anmelden und Passwort ändern", () => {
    expect(loginInput.parse({ password: "geheim" })).toEqual({
      password: "geheim",
      remember: false,
    });
    expect(loginInput.safeParse({ password: "" }).success).toBe(false);
    expect(
      loginInput.safeParse({ password: "x".repeat(LIMITS.passwordMaxChars + 1) }).success,
    ).toBe(false);
    expect(
      passwordChangeInput.safeParse({ currentPassword: "alt", newPassword: "x".repeat(12) })
        .success,
    ).toBe(true);
    expect(
      passwordChangeInput.safeParse({ currentPassword: "alt", newPassword: "kurz" }).success,
    ).toBe(false);
  });

  it("Anbieter: https, http nur lokal, Schlüssel optional", () => {
    const base = { name: "EUrouter", baseUrl: "https://api.eurouter.ai/v1", region: "eu" };
    expect(providerInput.parse(base)).toEqual({ ...base, templateKey: "eigener", enabled: true });
    expect(providerInput.parse({ ...base, templateKey: "eurouter" }).templateKey).toBe("eurouter");
    expect(providerInput.safeParse({ ...base, templateKey: "openai" }).success).toBe(false);
    expect(providerInput.safeParse({ ...base, baseUrl: "http://api.eurouter.ai/v1" }).success).toBe(
      false,
    );
    expect(
      providerInput.safeParse({ ...base, baseUrl: "http://192.168.1.5:1234/v1", region: "local" })
        .success,
    ).toBe(true);
    expect(providerInput.safeParse({ ...base, baseUrl: "ftp://example.org" }).success).toBe(false);
    expect(providerInput.safeParse({ ...base, apiKey: "" }).success).toBe(false);
    expect(providerInput.safeParse({ ...base, country: "de" }).success).toBe(false);
    expect(connectionTestInput.safeParse({}).success).toBe(false);
    expect(connectionTestInput.safeParse({ apiKey: "sk-test" }).success).toBe(true);
  });

  it("Bot, Modell, Schalter, Unterhaltung", () => {
    const bot = {
      name: "Pai",
      instructions: "",
      avatarShape: "wabe",
      color: "gelb",
      maxOutputTokens: 1,
    };
    expect(botInput.parse(bot)).toEqual(bot);
    expect(botInput.safeParse({ ...bot, maxOutputTokens: 0 }).success).toBe(false);
    expect(botInput.safeParse({ ...bot, name: "x".repeat(LIMITS.botNameChars + 1) }).success).toBe(
      false,
    );
    expect(
      botInput.safeParse({ ...bot, instructions: "x".repeat(LIMITS.botInstructionsChars) }).success,
    ).toBe(true);
    expect(botInput.safeParse({ ...bot, avatarShape: "stern" }).success).toBe(false);
    expect(modelChoiceInput.safeParse({ modelId: newId("model") }).success).toBe(true);
    expect(modelChoiceInput.safeParse({ modelId: newId("provider") }).success).toBe(false);
    expect(schleuseInput.safeParse({ mode: "on" }).success).toBe(true);
    expect(conversationCreateInput.parse({})).toEqual({});
    expect(conversationRenameInput.parse({ title: "  Woche  " })).toEqual({ title: "Woche" });
    expect(conversationRenameInput.safeParse({ title: " " }).success).toBe(false);
  });

  it("Einstellungen: mindestens ein Feld, null entfernt eine Grenze", () => {
    expect(settingsInput.safeParse({}).success).toBe(false);
    expect(settingsInput.parse({ dailyTokenBudget: null })).toEqual({ dailyTokenBudget: null });
    expect(settingsInput.safeParse({ timezone: "Europe/Berlin" }).success).toBe(true);
    expect(settingsInput.safeParse({ historyTokenLimit: 0 }).success).toBe(false);
  });

  it("Abfragen aus der URL", () => {
    expect(receiptListQuery.parse({ before: "12", limit: "10" })).toEqual({
      before: 12,
      limit: 10,
    });
    expect(receiptListQuery.parse({})).toEqual({ limit: 50 });
    expect(receiptListQuery.safeParse({ limit: "201" }).success).toBe(false);
    expect(receiptListQuery.safeParse({ action: "werkzeug.loeschen" }).success).toBe(false);
    expect(receiptChainQuery.parse({})).toEqual({ ab: 1, anzahl: 500 });
    expect(receiptChainQuery.parse({ ab: "7", anzahl: "1000", pruefung: "server" })).toEqual({
      ab: 7,
      anzahl: 1000,
      pruefung: "server",
    });
    for (const falsch of [
      { ab: "0" },
      { ab: "1.5" },
      { ab: "1e3" },
      { ab: "0x10" },
      { ab: " 2" },
      { ab: "99999999999999999" },
      { anzahl: "1001" },
      { pruefung: "browser" },
      { x: "1" },
    ]) {
      expect(receiptChainQuery.safeParse(falsch).success, JSON.stringify(falsch)).toBe(false);
    }
    expect(lastEventIdSchema.parse("7")).toBe(7);
    expect(lastEventIdSchema.safeParse("-1").success).toBe(false);
    expect(lastEventIdSchema.safeParse("abc").success).toBe(false);
  });
});

describe("Konstanten", () => {
  it("Namen für Cookies, Kopfzeilen, Speicher und Rate-Limits", () => {
    expect(cookieName("sitzung", "https://paibot.example")).toBe(COOKIE.sitzung.https);
    expect(cookieName("sitzung", "https://paibot.example")).toBe("__Host-pb_sitzung");
    expect(cookieName("vorab", "http://localhost:3000")).toBe("pb_vorab");
    expect(cookieName("sitzung", undefined)).toBe("pb_sitzung");
    expect(CSRF).toEqual({
      header: "X-Pb-Pruefzeichen",
      formField: "_pruefzeichen",
      metaName: "pb-pruefzeichen",
    });
    expect(STAND_HEADER).toBe("X-Pb-Stand");
    expect(STORAGE_KEYS.entwurf(conversationId)).toBe(`pb:entwurf:${conversationId}`);
    expect(RATE_LIMIT_KEYS.anmeldenIp("10.0.0.1")).toBe("anmelden:ip:10.0.0.1");
    expect(RATE_LIMIT_KEYS.nachricht(ownerId)).toBe(`nachricht:${ownerId}`);
    expect(EVENT_NOTIFY_CHANNEL).toBe("paibot_ereignis");
  });
});
