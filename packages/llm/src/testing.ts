/**
 * PaiBot – nachgebaute Datenschleuse für Tests: antwortet wie die echte (Lebenszeichen ohne
 * Schlüssel, Modell-Liste und Chat nur mit ihrem Schlüssel, Block als HTTP 500) und reicht
 * Chat-Anfragen an einen Test-Anbieter weiter.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { SCHLEUSE_LIVENESS_PATH, type SchleuseKeyPath } from "./schleuse";
import { SCHLEUSE_CHAT_PATH } from "./schleuse-zugang";
import { json, type SeenRequest, startTestServer } from "./test-server";

/** Antwort auf das Lebenszeichen (gemessen). */
export function schleuseLivenessReply(res: ServerResponse): void {
  json(res, 200, "I'm alive!");
}

/**
 * Antwort bei einem Block (gemessen: HTTP 500, Typ `"None"`). `reason` steht in der Meldung, wie
 * bei der echten Datenschleuse die Begründung – PaiBot darf davon nichts weitergeben.
 */
export function schleuseBlockedReply(res: ServerResponse, reason = ""): void {
  json(res, 500, {
    error: {
      message: `Exception occured - Analyse nicht erreichbar; Request blockiert (fail-closed, kein unmaskiertes PII). Begründung: ${reason}`,
      type: "None",
      param: "None",
      code: "500",
    },
  });
}

/** Antwort bei falschem Zugangsschlüssel ohne eigene Datenbank (gemessen: HTTP 400). */
export function schleuseWrongKeyReply(res: ServerResponse, extra = ""): void {
  json(res, 400, {
    error: {
      message: `No connected db.${extra === "" ? "" : ` ${extra}`}`,
      type: "no_db_connection",
      param: "None",
      code: "400",
    },
  });
}

/** Antwort ganz ohne Zugangsschlüssel (gemessen: HTTP 500, Typ `"None"`, ohne Block-Meldung). */
export function schleuseNoKeyReply(res: ServerResponse): void {
  json(res, 500, { error: { message: "x", type: "None", param: "None", code: "500" } });
}

/**
 * Verhalten der nachgebauten Datenschleuse:
 * - `durchlassen` – Chat-Anfragen gehen an den Test-Anbieter,
 * - `blockieren` – Chat-Anfragen enden mit der Block-Antwort,
 * - `krank` – das Lebenszeichen meldet HTTP 503.
 */
export type FakeSchleuseMode = "durchlassen" | "blockieren" | "krank";

export interface FakeSchleuseOptions {
  /** Zugangsschlüssel der Datenschleuse (`SCHLEUSE_KEY`). */
  apiKey: string;
  /** Basis-URL des Test-Anbieters hinter der Datenschleuse, z. B. `http://127.0.0.1:1234/v1`. */
  upstream: string;
  /**
   * Weg des Anbieter-Schlüssels: `anfrage` (Standard) – der Schlüssel kommt als `api_key` im Körper;
   * `umgebung` – die Datenschleuse nimmt `upstreamKey` aus ihrer Umgebung.
   */
  keyPath?: SchleuseKeyPath;
  /** Anbieter-Schlüssel aus der Umgebung der Datenschleuse (nur Weg `umgebung`). */
  upstreamKey?: string;
  /** Wort in der Meldung eines Blocks (Standard leer). */
  blockReason?: string;
}

export interface FakeSchleuse {
  /** `http://127.0.0.1:<port>/v1` */
  baseUrl: string;
  /** Alle Anfragen an die Datenschleuse, mit Kopfzeilen und Körper. */
  requests: SeenRequest[];
  /** Körper der Chat-Anfragen (JSON), so wie sie bei der Datenschleuse ankamen. */
  chatBodies(): Record<string, unknown>[];
  setMode(mode: FakeSchleuseMode): void;
  close(): Promise<void>;
}

/** Felder, die die Datenschleuse aus dem Körper nimmt, bevor sie an den Anbieter weiterreicht. */
const CONSUMED_FIELDS = ["api_key", "api_base", "base_url", "api_version", "user_config"];

/**
 * Startet eine nachgebaute Datenschleuse auf einem freien Port. Modellnamen kommen als
 * `<anbieter>/<slug>` an; weitergereicht wird `<slug>` an `<upstream>/chat/completions`, mit dem
 * Anbieter-Schlüssel als `authorization: Bearer …`. Die Antwort wird unverändert durchgereicht.
 */
export async function startFakeSchleuse(options: FakeSchleuseOptions): Promise<FakeSchleuse> {
  let mode: FakeSchleuseMode = "durchlassen";
  const keyPath = options.keyPath ?? "anfrage";
  const upstream = options.upstream.replace(/\/+$/, "");

  function authorized(req: IncomingMessage, res: ServerResponse): boolean {
    const auth = req.headers.authorization;
    if (auth === undefined) {
      schleuseNoKeyReply(res);
      return false;
    }
    if (auth !== `Bearer ${options.apiKey}`) {
      schleuseWrongKeyReply(res);
      return false;
    }
    return true;
  }

  async function forward(res: ServerResponse, raw: string): Promise<void> {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      json(res, 400, { error: { message: "bad json", type: "bad_request", code: "400" } });
      return;
    }
    const providerKey =
      keyPath === "anfrage"
        ? typeof body.api_key === "string"
          ? body.api_key
          : undefined
        : options.upstreamKey;
    for (const field of CONSUMED_FIELDS) delete body[field];
    if (typeof body.model === "string") body.model = body.model.replace(/^[^/]+\//, "");

    const controller = new AbortController();
    res.once("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    try {
      const answer = await fetch(`${upstream}${SCHLEUSE_CHAT_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(providerKey === undefined ? {} : { authorization: `Bearer ${providerKey}` }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      res.writeHead(answer.status, {
        "content-type": answer.headers.get("content-type") ?? "application/json",
      });
      if (answer.body === null) {
        res.end();
        return;
      }
      Readable.fromWeb(answer.body as never)
        .on("error", () => res.destroy())
        .pipe(res);
    } catch {
      if (!res.headersSent) json(res, 502, { error: { message: "upstream", type: "None" } });
      else res.destroy();
    }
  }

  const server = await startTestServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method === "GET" && path === SCHLEUSE_LIVENESS_PATH) {
      req.resume();
      if (mode === "krank") return json(res, 503, { status: "unhealthy" });
      return schleuseLivenessReply(res);
    }
    if (req.method === "GET" && path === "/v1/models") {
      req.resume();
      if (!authorized(req, res)) return;
      return json(res, 200, { object: "list", data: [{ id: "*", object: "model" }] });
    }
    if (req.method === "POST" && path === `/v1${SCHLEUSE_CHAT_PATH}`) {
      let raw = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        raw += chunk;
      });
      req.on("end", () => {
        if (!authorized(req, res)) return;
        if (mode === "blockieren") return schleuseBlockedReply(res, options.blockReason);
        void forward(res, raw);
      });
      return;
    }
    req.resume();
    json(res, 404, { error: { message: "Not Found", type: "None", code: "404" } });
  });

  return {
    baseUrl: `${server.origin}/v1`,
    requests: server.requests,
    chatBodies: () =>
      server.requests
        .filter((r) => r.method === "POST" && r.url.startsWith(`/v1${SCHLEUSE_CHAT_PATH}`))
        .map((r) => {
          try {
            return JSON.parse(r.body) as Record<string, unknown>;
          } catch {
            return {};
          }
        }),
    setMode(next) {
      mode = next;
    },
    close: () => server.close(),
  };
}
