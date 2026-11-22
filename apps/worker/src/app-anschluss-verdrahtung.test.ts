/**
 * PaiBot – Test der Verdrahtung im Betrieb: `buildRunDeps` baut den Anschluss an die Apps ohne
 * Test-Nähte (kein `basisFetch`, keine eigene Namensauflösung), und jede Abfrage einer App geht
 * über eine eigene Hülle mit genau einem Ziel, den Namen der eigenen Dienste gesperrt. Die Hülle
 * und die MCP-Schicht sind hier Beobachter, nicht die echten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { randomBytes } from "node:crypto";
import { testDokuEnv } from "@paibot/agents/testing";
import { deriveKey, encryptSecret, loadMasterSecret } from "@paibot/crypto";
import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { egressTargetOf, INTERNAL_SERVICE_HOSTS } from "@paibot/llm";
import { MCP_EMPFOHLENE_ANTWORT_BYTES, MCP_EMPFOHLENES_LEERLAUF_MS } from "@paibot/mcp";
import { appTokenBinding, secretAad } from "@paibot/shared/bindung";
import { type AppId, newId } from "@paibot/shared/ids";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRunDeps } from "./abhaengigkeiten";

const beobachter = vi.hoisted(() => ({
  huellen: [] as { argumente: unknown[]; huelle: typeof fetch }[],
  schicht: [] as { fetch: unknown; adresse: unknown; token: unknown }[],
}));

vi.mock("@paibot/llm", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@paibot/llm")>();
  return {
    ...echt,
    createEgressFetch: (...argumente: unknown[]) => {
      const huelle = (async () => new Response("{}")) as unknown as typeof fetch;
      beobachter.huellen.push({ argumente, huelle });
      return huelle;
    },
  };
});

vi.mock("@paibot/mcp", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@paibot/mcp")>();
  return {
    ...echt,
    holeWerkzeuge: async (optionen: { fetch: unknown; adresse: unknown; token: unknown }) => {
      beobachter.schicht.push(optionen);
      return { werkzeuge: [], serverName: "x", seiten: 1, abgeschnitten: false };
    },
  };
});

beforeEach(() => {
  beobachter.huellen.length = 0;
  beobachter.schicht.length = 0;
});

const ADRESSE = "https://mcp.beispiel.de/mcp";
const TOKEN = "tok-0123456789abcdef";

async function holeListeImBetrieb() {
  const { db } = await createTestDb();
  const secret = randomBytes(32).toString("base64");
  const env = { PAIBOT_SECRET: secret, ...testDokuEnv() };
  const secretsKey = deriveKey(loadMasterSecret(env), "secrets-v1");
  const id = newId("app") as AppId;
  const app = await repo.apps.create(db, {
    id,
    shortName: "beispiel",
    name: "Beispiel",
    url: ADRESSE,
    authKind: "token",
    tokenEnc: encryptSecret(TOKEN, secretsKey, { aad: secretAad(appTokenBinding(id, ADRESSE)) }),
  });
  const deps = await buildRunDeps(db, env).prepare();
  if (deps.apps === undefined) throw new Error("kein Anschluss");
  await deps.apps.neuerLauf().holeListe({
    app: { id: app.id, kurzname: app.shortName, url: app.url },
    bekannteNamen: new Map(),
    bereitsVergeben: new Set(),
    signal: new AbortController().signal,
  });
}

describe("Anschluss an die Apps im Betrieb (buildRunDeps)", () => {
  it("baut je Abruf eine eigene Hülle mit genau einem Ziel, den Namen der eigenen Dienste gesperrt, ohne eigenes fetch und ohne eigene Namensauflösung", async () => {
    await holeListeImBetrieb();
    expect(beobachter.huellen).toHaveLength(1);
    const [ziele, basisFetch, optionen] = beobachter.huellen[0]?.argumente ?? [];
    expect(ziele).toEqual([
      { ...egressTargetOf(ADRESSE), denyAddressesOf: INTERNAL_SERVICE_HOSTS },
    ]);
    expect(basisFetch).toBeUndefined();
    expect(optionen).not.toHaveProperty("lookup");
    // Die empfohlenen Grenzen der Schicht für Antwort und Leerlauf gelten in der Hülle.
    expect(optionen).toEqual({
      limits: { maxBodyBytes: MCP_EMPFOHLENE_ANTWORT_BYTES },
      idleTimeoutMs: MCP_EMPFOHLENES_LEERLAUF_MS,
    });
  });

  it("reicht genau diese Hülle, die Adresse und den entschlüsselten Zugang an die Schicht weiter", async () => {
    await holeListeImBetrieb();
    expect(beobachter.schicht).toHaveLength(1);
    expect(beobachter.schicht[0]?.fetch).toBe(beobachter.huellen[0]?.huelle);
    expect(beobachter.schicht[0]).toMatchObject({ adresse: ADRESSE, token: TOKEN });
  });
});
