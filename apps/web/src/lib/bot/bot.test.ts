/**
 * PaiBot – Tests des Bots: Lesen, Ändern über das Tor mit Belegen, Grenzen der Eingabe und der
 * Überblick „Was dein Bot darf“ aus den Regeln.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { LIMITS } from "@paibot/shared/konstanten";
import { t } from "@paibot/shared/texte";
import { ACTIVE_STANDARD_RULES } from "@paibot/shared/tor";
import { describe, expect, it, vi } from "vitest";
import { belegeSeit, eingerichtet, letzteNummer } from "../modelle/testing";
import { anfrage, Keksdose } from "../zugang/testing";
import { botRechte, botSeitenDaten, geaenderteFelder } from "./bot";

vi.setConfig({ testTimeout: 60_000 });

async function botKoerper(e: Awaited<ReturnType<typeof eingerichtet>>) {
  const bot = await repo.bots.getDefault(e.u.db);
  if (bot === undefined) throw new Error("kein Bot");
  return {
    name: bot.name,
    instructions: bot.instructions,
    avatarShape: bot.avatarShape,
    color: bot.color,
    maxOutputTokens: bot.maxOutputTokens,
  };
}

describe("GET /api/bot", () => {
  it("liefert den Bot mit seinem Modell", async () => {
    const e = await eingerichtet();
    const r = await e.rufe(e.r.bot, "GET", "/api/bot");
    expect(r.status).toBe(200);
    expect(r.body.daten).toMatchObject({
      bot: { name: "Pai", color: "limette" },
      modell: { displayName: "Beispiel-Modell A", region: "local" },
    });
  });

  it("weist ohne Sitzung ab", async () => {
    const e = await eingerichtet();
    const r = await anfrage(e.u, e.r.bot, "GET", "/api/bot", { dose: new Keksdose() });
    expect(r.status).toBe(401);
  });
});

describe("PUT /api/bot", () => {
  it("benennt um und ändert die Anweisung: zwei Belege, nur die geänderten Felder", async () => {
    const e = await eingerichtet();
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(e.r.botAendern, "PUT", "/api/bot", {
      koerper: {
        ...(await botKoerper(e)),
        name: "Kai",
        instructions: "Antworte kurz.",
        color: "violett",
        avatarShape: "raute",
      },
    });
    expect(r.status).toBe(200);
    const bot = await repo.bots.getDefault(e.u.db);
    expect(bot).toMatchObject({ name: "Kai", instructions: "Antworte kurz.", color: "violett" });
    const belege = await belegeSeit(e.u, vorher);
    expect(belege.map((b) => [b.typ, b.aktion])).toEqual([
      ["decision", "bot.aendern"],
      ["result", "bot.aendern"],
    ]);
    expect(belege[0]?.body).toMatchObject({
      facts: { fields: ["name", "instructions", "avatarShape", "color"] },
    });
    // Die Anweisung selbst steht nie im Beleg.
    expect(JSON.stringify(belege)).not.toContain("Antworte kurz.");
  });

  it("ohne Änderung: nichts zu speichern, kein Beleg", async () => {
    const e = await eingerichtet();
    const vorher = await letzteNummer(e.u);
    const r = await e.rufe(e.r.botAendern, "PUT", "/api/bot", { koerper: await botKoerper(e) });
    expect(r.status).toBe(400);
    expect(r.body.fehler).toMatchObject({ text: t("bot.unveraendert") });
    expect(await letzteNummer(e.u)).toBe(vorher);
  });

  it("Anweisung über der Grenze, leerer Name oder fremde Farbe: Eingabe ungültig", async () => {
    const e = await eingerichtet();
    const basis = await botKoerper(e);
    for (const koerper of [
      { ...basis, instructions: "x".repeat(LIMITS.botInstructionsChars + 1) },
      { ...basis, name: "   " },
      { ...basis, color: "rot" },
      { ...basis, extra: 1 },
    ]) {
      const r = await e.rufe(e.r.botAendern, "PUT", "/api/bot", { koerper });
      expect(r.status).toBe(400);
      expect(r.body.fehler).toMatchObject({ code: "eingabe_ungueltig" });
    }
  });

  it("verlangt das Prüfzeichen", async () => {
    const e = await eingerichtet();
    const r = await e.rufe(e.r.botAendern, "PUT", "/api/bot", {
      koerper: { ...(await botKoerper(e)), name: "Kai" },
      pruefzeichen: null,
    });
    expect(r.status).toBe(403);
  });
});

describe("Was dein Bot darf", () => {
  it("leitet aus den Standard-Regeln ab: antworten und in der Doku lesen erlaubt, andere Werkzeuge nur mit Frage, G-01 nie", () => {
    const rechte = botRechte(ACTIVE_STANDARD_RULES);
    expect(rechte.erlaubt.map((r) => r.id)).toEqual(["R-002", "R-010"]);
    expect(rechte.erlaubt[1]?.text).toBe("Bot liest in der Doku seiner Version");
    expect(rechte.fragt.map((r) => r.id)).toEqual(["R-005"]);
    expect(rechte.nie.map((r) => r.id)).toEqual(["G-01"]);
    expect(rechte.erlaubt[0]?.text).toBe(t("regel.R-002"));
  });

  it("abgeschaltete Regeln zählen nicht", () => {
    const rechte = botRechte(ACTIVE_STANDARD_RULES.map((r) => ({ ...r, enabled: false })));
    expect(rechte.erlaubt).toEqual([]);
    expect(rechte.fragt).toEqual([]);
  });

  it("die Seite bekommt die Rechte aus der Datenbank", async () => {
    const e = await eingerichtet();
    const daten = await botSeitenDaten(e.u.db);
    expect(daten?.rechte.erlaubt.map((r) => r.id)).toEqual(["R-002", "R-010"]);
    expect(daten?.modell?.displayName).toBe("Beispiel-Modell A");
  });

  it("geänderte Felder", () => {
    const alt = {
      id: "bot_x",
      name: "Pai",
      instructions: "",
      avatarShape: "blatt",
      color: "limette",
      maxOutputTokens: 1000,
      createdAt: "",
      updatedAt: "",
    } as never;
    expect(
      geaenderteFelder(alt, {
        name: "Pai",
        instructions: "neu",
        avatarShape: "blatt",
        color: "limette",
        maxOutputTokens: 1000,
      }),
    ).toEqual(["instructions"]);
  });
});
