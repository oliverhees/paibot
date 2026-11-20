/**
 * PaiBot – Tests für die Schnittstelle der Anbieter-Schicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import * as llm from "./index";

describe("Schnittstelle", () => {
  it("exportiert die Funktionen der Anbieter-Schicht", async () => {
    const api: Record<string, unknown> = await import("./index");
    for (const name of [
      "fetchModels",
      "testConnection",
      "resolveSchleuseMode",
      "resolveRoute",
      "schleuseModelName",
      "mapProviderError",
      "createEgressFetch",
      "checkProviderBaseUrl",
      "checkSchleuseHealth",
      "egressTargetOf",
      "isRetryable",
      "schleuseModelName",
      "schleuseFromEnv",
    ]) {
      expect(typeof api[name]).toBe("function");
    }
  });

  it("den Modell-Zugang gibt es nur über den eigenen Unterpfad", async () => {
    const root: Record<string, unknown> = await import("./index");
    const modell: Record<string, unknown> = await import("./resolve-model");
    expect(root.resolveModel).toBeUndefined();
    expect(typeof modell.resolveModel).toBe("function");
    expect(pkg.exports["./modell"]).toBe("./src/resolve-model.ts");
  });

  it("braucht keine Modell-Bibliothek", () => {
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.some((name) => name === "ai" || name.startsWith("@ai-sdk/"))).toBe(false);
  });

  it("feste Werte stehen fest", () => {
    expect(llm.PROVIDER_TEMPLATES.eurouter.baseUrl).toBe("https://api.eurouter.ai/v1");
    expect(llm.PROVIDER_TEMPLATES.eurouter.region).toBe("eu");
    expect(llm.SCHLEUSE_ENV).toEqual({ url: "SCHLEUSE_URL", key: "SCHLEUSE_KEY" });
    expect(llm.INTERNAL_SERVICE_HOSTS).toEqual(["postgres", "datenschleuse", "web", "worker"]);
    expect(llm.isSchleuseUnavailable({ unavailable: true, reason: "nicht_erreichbar" })).toBe(true);
    expect(llm.isSchleuseUnavailable("direct")).toBe(false);
  });
});
