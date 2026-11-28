/**
 * PaiBot – Test: Werte in der Form, die Coolify für deploy/docker-compose.coolify.yml erzeugt,
 * bestehen die Start-Prüfung des Workers.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkWorkerEnv } from "./umgebung";

const DATEI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../deploy/docker-compose.coolify.yml",
);

type Env = Record<string, string | undefined>;

/** Abschnitt `environment:` des Workers, Variablen eingesetzt wie von Docker Compose. */
function workerUmgebung(werte: Env): Env {
  const zeilen = readFileSync(DATEI, "utf8").split("\n");
  const start = zeilen.indexOf("  worker:");
  expect(start).toBeGreaterThan(-1);
  const env: Env = {};
  let imEnv = false;
  for (const zeile of zeilen.slice(start + 1)) {
    if (/^ {2}\S/.test(zeile)) break;
    if (/^ {4}\S/.test(zeile)) {
      imEnv = zeile === "    environment:";
      continue;
    }
    const m = imEnv ? /^ {6}([A-Z0-9_]+): (.*)$/.exec(zeile) : null;
    if (!m?.[1] || m[2] === undefined) continue;
    env[m[1]] = m[2].replace(
      /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g,
      (_, name: string, standard?: string) => {
        const wert = werte[name];
        if (standard !== undefined) return wert === undefined || wert === "" ? standard : wert;
        return wert ?? "";
      },
    );
  }
  return env;
}

describe("Worker mit Werten aus Coolify", () => {
  it("besteht die Start-Prüfung (Hex-Passwort, 32 Byte Base64)", () => {
    for (let i = 0; i < 20; i++) {
      const env = workerUmgebung({
        SERVICE_HEX_64_PGAPP: randomBytes(32).toString("hex"),
        SERVICE_HEX_64_PGWORKER: randomBytes(32).toString("hex"),
        SERVICE_REALBASE64_32_PAIBOT: randomBytes(32).toString("base64"),
      });
      expect(env.DATABASE_MIGRATION_URL).toBeUndefined();
      // Der Worker bekommt nur seine eigene Rolle, nicht die Zugangsdaten der App-Rolle.
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.DATABASE_WORKER_URL).toMatch(
        /^postgres:\/\/paibot_worker:[0-9a-f]{64}@postgres:5432\/paibot$/,
      );
      expect(checkWorkerEnv(env, true)).toEqual([]);
    }
  });

  it("ohne erzeugte Werte bricht der Start ab", () => {
    const fehler = checkWorkerEnv(workerUmgebung({}), true).join("\n");
    expect(fehler).toContain("PAIBOT_SECRET fehlt");
    expect(fehler).toContain("DATABASE_WORKER_URL enthält kein Passwort");
  });
});
