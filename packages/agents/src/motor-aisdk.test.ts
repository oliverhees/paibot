/**
 * PaiBot – Test, dass die Bibliothek des Motors in der festen Version bereitsteht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("Bibliothek des Motors", () => {
  it("ist fest auf eine Version gepinnt", () => {
    expect(pkg.dependencies.ai).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies["@ai-sdk/openai-compatible"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("stellt bereit, was der Motor und seine Tests brauchen", () => {
    expect(typeof streamText).toBe("function");
    expect(typeof createOpenAICompatible).toBe("function");
    expect(typeof simulateReadableStream).toBe("function");
    expect(typeof MockLanguageModelV4).toBe("function");
  });
});
