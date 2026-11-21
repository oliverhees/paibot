/**
 * PaiBot – Tests: Regel-Liste des EUrouter-Kontos holen (vorgespielte Antworten in der belegten
 * Form) und die Abbildung „Regel unbekannt“. Der zweite Schlüssel geht nur in die Kopfzeile, die
 * Fehlerfälle sind je eigene Ergebnisse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { PaiBotError } from "@paibot/shared/fehler";
import { describe, expect, it } from "vitest";
import { mapProviderError } from "./errors";
import { readRoutingRules } from "./routing-rules-liste";

const MK = "eur_mgmt_beispiel.geheimnis-0042";
const ANBIETER = {
  templateKey: "eurouter",
  baseUrl: "https://api.eurouter.ai/v1",
  region: "eu",
} as const;

const REGEL = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "EU GLM 5.2",
  description: "Strict EU data residency",
  user_id: "22222222-2222-4222-8222-222222222222",
  org_id: "33333333-3333-4333-8333-333333333333",
  workspace_id: "44444444-4444-4444-8444-444444444444",
  api_key_id: null,
  model: "glm-5.2",
  models: ["glm-5.1", "glm-5"],
  provider: {
    allow_fallbacks: true,
    data_collection: "deny",
    data_residency: "EU",
    max_retention_days: 0,
    eu_owned: true,
  },
  enabled: true,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-02T10:00:00Z",
};

interface Aufruf {
  url: string;
  methode: string;
  kopf: Headers;
}

/** `fetch`, das eine feste Antwort liefert und den Aufruf festhält. */
function vorgespielt(antwort: () => Response | Promise<Response>) {
  const aufrufe: Aufruf[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    aufrufe.push({
      url: String(input),
      methode: init?.method ?? "GET",
      kopf: new Headers(init?.headers),
    });
    return antwort();
  }) as typeof fetch;
  return { f, aufrufe };
}

const json = (koerper: unknown, status = 200, kopf: Record<string, string> = {}) =>
  new Response(JSON.stringify(koerper), {
    status,
    headers: { "content-type": "application/json", ...kopf },
  });

describe("Regel-Liste holen", () => {
  it("GET auf /api/v1/routing-rules; der Schlüssel nur in der Kopfzeile; Ergebnis ohne Kennungen", async () => {
    const { f, aufrufe } = vorgespielt(() => json({ data: [REGEL] }));
    const ergebnis = await readRoutingRules(ANBIETER, MK, { fetch: f });
    expect(ergebnis).toMatchObject({ ok: true, unvollstaendig: false });
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]?.methode).toBe("GET");
    expect(aufrufe[0]?.url).toBe("https://api.eurouter.ai/api/v1/routing-rules");
    expect(aufrufe[0]?.kopf.get("authorization")).toBe(`Bearer ${MK}`);
    const text = JSON.stringify(ergebnis);
    expect(text).not.toContain(MK);
    for (const wert of [REGEL.id, REGEL.user_id, REGEL.org_id, REGEL.workspace_id]) {
      expect(text).not.toContain(wert);
    }
    expect(text).not.toContain("Strict EU data residency");
    expect(ergebnis.ok && ergebnis.regeln[0]?.policy.data_residency).toBe("EU");
  });

  it("403: der Schlüssel darf die Regeln nicht lesen", async () => {
    const { f } = vorgespielt(() =>
      json({ error: { code: 403, message: "This key cannot access this endpoint" } }, 403),
    );
    expect(await readRoutingRules(ANBIETER, MK, { fetch: f })).toEqual({
      ok: false,
      code: "nicht_erlaubt",
    });
  });

  it("401, 429, 500, Zeitüberschreitung, kaputte Form: je ein eigenes Ergebnis", async () => {
    const lies = async (antwort: () => Response | Promise<Response>, timeoutMs?: number) =>
      readRoutingRules(ANBIETER, MK, {
        fetch: vorgespielt(antwort).f,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    expect(await lies(() => json({}, 401))).toEqual({ ok: false, code: "schluessel_ungueltig" });
    expect(await lies(() => json({}, 429))).toEqual({ ok: false, code: "limit_erreicht" });
    expect(await lies(() => json({}, 500))).toEqual({
      ok: false,
      code: "anbieter_nicht_erreichbar",
    });
    expect(await lies(() => json({ data: "x" }))).toEqual({ ok: false, code: "form" });
    expect(await lies(() => new Response("kein json"))).toEqual({ ok: false, code: "form" });
    const langsam = readRoutingRules(ANBIETER, MK, {
      timeoutMs: 20,
      fetch: ((_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_ok, nein) => {
          init?.signal?.addEventListener("abort", () =>
            nein(new DOMException("t", "TimeoutError")),
          );
        })) as typeof fetch,
    });
    expect(await langsam).toEqual({ ok: false, code: "zeitueberschreitung" });
    // Netzfehler ist keine Zeitüberschreitung
    const netz = await readRoutingRules(ANBIETER, MK, {
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    expect(netz).toEqual({ ok: false, code: "anbieter_nicht_erreichbar" });
  });

  it("Hinweis auf weitere Seiten: im Feld oder in der Link-Kopfzeile", async () => {
    const mitFeld = await readRoutingRules(ANBIETER, MK, {
      fetch: vorgespielt(() => json({ data: [REGEL], next_cursor: "abc" })).f,
    });
    expect(mitFeld).toMatchObject({ ok: true, unvollstaendig: true });
    const mitKopf = await readRoutingRules(ANBIETER, MK, {
      fetch: vorgespielt(() =>
        json({ data: [REGEL] }, 200, { link: '<https://api.eurouter.ai/x?page=2>; rel="next"' }),
      ).f,
    });
    expect(mitKopf).toMatchObject({ ok: true, unvollstaendig: true });
    const ohne = await readRoutingRules(ANBIETER, MK, {
      fetch: vorgespielt(() => json({ data: [REGEL] })).f,
    });
    expect(ohne).toMatchObject({ ok: true, unvollstaendig: false });
  });

  it("nur EUrouter; ein Schlüssel mit Leerzeichen oder Zeilenumbruch geht nicht hinaus", async () => {
    const { f, aufrufe } = vorgespielt(() => json({ data: [] }));
    const anders = await readRoutingRules({ ...ANBIETER, templateKey: "mistral" }, MK, {
      fetch: f,
    });
    expect(anders.ok).toBe(false);
    const schlecht = await readRoutingRules(ANBIETER, "abc\r\nX-Evil: 1", { fetch: f });
    expect(schlecht).toEqual({ ok: false, code: "schluessel_ungueltig" });
    expect(aufrufe).toHaveLength(0);
  });

  it("die Hülle für ausgehende Aufrufe gilt: ein Host außerhalb der Adresse wird nicht erreicht", async () => {
    const fremd = await readRoutingRules(
      { templateKey: "eurouter", baseUrl: "http://169.254.169.254/v1", region: "eu" },
      MK,
    );
    expect(fremd.ok).toBe(false);
  });
});

describe("Regel unbekannt als eigener Fehlercode", () => {
  const apiFehler = (statusCode: number, message: string) => ({
    name: "AI_APICallError",
    statusCode,
    responseBody: JSON.stringify({
      error: { code: statusCode, message, type: "invalid_request_error" },
    }),
  });

  it("HTTP 400 „Routing rule with name … not found“ → regel_unbekannt", () => {
    expect(
      mapProviderError(apiFehler(400, "Routing rule with name 'Gibt es nicht' not found")),
    ).toBe("regel_unbekannt");
  });

  it("auch eingepackt in eine Ursache", () => {
    const aussen = {
      name: "Fehler",
      cause: apiFehler(400, "Routing rule with name 'X' not found"),
    };
    expect(mapProviderError(aussen)).toBe("regel_unbekannt");
  });

  it("Gegenprobe: anderes 400, anderer Text oder anderer Status bleiben beim Alten", () => {
    expect(mapProviderError(apiFehler(400, "Either `model` or `models` must be provided."))).toBe(
      "intern",
    );
    expect(mapProviderError(apiFehler(404, "Routing rule with name 'X' not found"))).toBe(
      "anbieter_nicht_erreichbar",
    );
    expect(mapProviderError(apiFehler(401, "Routing rule with name 'X' not found"))).toBe(
      "schluessel_ungueltig",
    );
    expect(mapProviderError({ statusCode: 400, responseBody: "<html>" })).toBe("intern");
    expect(mapProviderError(new PaiBotError("regel_unbekannt"))).toBe("regel_unbekannt");
  });
});
