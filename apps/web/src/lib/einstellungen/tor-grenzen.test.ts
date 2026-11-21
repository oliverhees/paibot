/**
 * PaiBot – Wirkung der Einstellungen im Tor, über die Paket-Funktionen: Not-Aus (G-05) lehnt eine
 * danach eingereihte Nachricht ab und gibt sie wieder frei; die Tagesgrenze (G-04) greift mit dem
 * Verbrauch, den die Einstellungen anzeigen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { GateDenied, limitTagesbudget } from "@paibot/gate";
import { newId } from "@paibot/shared/ids";
import { LIMITS } from "@paibot/shared/konstanten";
import { describe, expect, it, vi } from "vitest";
import { torAuf } from "../gate";
import { einrichtungAbschliessen } from "../zugang/einrichtung";
import { anfrage, TEST_CODE, TEST_PASSWORT, testUmgebung, vorabDose } from "../zugang/testing";
import { einstellungenAnzeige } from "./grenzen";

vi.setConfig({ testTimeout: 60_000 });

async function eingerichtet() {
  const u = await testUmgebung();
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
    dose: vorabDose(),
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  const bot = await repo.bots.getDefault(u.db);
  if (bot === undefined) throw new Error("kein Bot");
  const unterhaltung = await repo.conversations.create(u.db, { botId: bot.id, title: "Beispiel" });
  return { u, unterhaltung };
}

/** Reiht eine Nachricht so ein, wie die Web-App es tut: Fakten aus der Datenbank, dann das Tor. */
async function nachrichtEinreihen(
  u: Awaited<ReturnType<typeof eingerichtet>>["u"],
  conversationId: Awaited<ReturnType<typeof eingerichtet>>["unterhaltung"]["id"],
) {
  const settings = await repo.settings.get(u.db);
  const tor = torAuf(u.db, u.dienste.belegSchluessel(), u.dienste.uhr);
  let ausgefuehrt = false;
  await tor.run(
    {
      actionId: newId("action"),
      type: "nachricht.senden",
      actor: "besitzer",
      target: { conversationId, messageId: newId("message") },
    },
    {
      credential: "sitzung",
      inputChars: 5,
      maxInputChars: LIMITS.messageChars,
      conversationExists: true,
      runActive: false,
      killSwitch: settings?.killSwitch ?? true,
    },
    async () => {
      ausgefuehrt = true;
      return { value: undefined, result: { status: "ok" } };
    },
  );
  return ausgefuehrt;
}

describe("Not-Aus im Tor", () => {
  it("an: die danach eingereihte Nachricht lehnt das Tor ab (G-05); aus: sie geht wieder", async () => {
    const { u, unterhaltung } = await eingerichtet();
    expect(await nachrichtEinreihen(u, unterhaltung.id)).toBe(true);

    await repo.settings.update(u.db, { killSwitch: true });
    const fehler = await nachrichtEinreihen(u, unterhaltung.id).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(GateDenied);
    const verletzt = (fehler as GateDenied).decision.limits.filter((g) => g.result === "verletzt");
    expect(verletzt.map((g) => g.name)).toEqual(["not_aus"]);

    await repo.settings.update(u.db, { killSwitch: false });
    expect(await nachrichtEinreihen(u, unterhaltung.id)).toBe(true);
  });
});

describe("Tagesgrenze im Tor", () => {
  it("greift, sobald der angezeigte Verbrauch die gespeicherte Grenze erreicht", async () => {
    const { u, unterhaltung } = await eingerichtet();
    await repo.settings.update(u.db, { dailyTokenBudget: 100 });
    await repo.messages.insert(u.db, {
      conversationId: unterhaltung.id,
      role: "assistant",
      content: "Antwort",
      status: "complete",
      tokensIn: 60,
      tokensOut: 40,
    });
    const anzeige = await einstellungenAnzeige(u.db, new Date());
    expect(anzeige.heute.token).toBe(100);
    const aktion = {
      actionId: newId("action"),
      type: "modell.anfragen",
      actor: `bot:${newId("bot")}`,
      target: {},
    } as never;
    const fakten = (budget: number) =>
      ({ dailyTokenBudget: budget, tokensToday: anzeige.heute.token }) as never;
    expect(limitTagesbudget(aktion, fakten(anzeige.tagesbudget ?? 0)).result).toBe("verletzt");
    expect(limitTagesbudget(aktion, fakten(101)).result).toBe("ok");
  });
});
