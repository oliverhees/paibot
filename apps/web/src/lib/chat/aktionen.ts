/**
 * PaiBot – Aktionen der Chat-Routen: Unterhaltungen auflisten, anlegen, lesen, umbenennen,
 * löschen, Datenschleuse umschalten, Nachrichten lesen und senden, Antwort abbrechen. Jede
 * Änderung geht durch das Tor; Route und Test nutzen dieselben Funktionen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { repo } from "@paibot/db";
import { PaiBotError } from "@paibot/shared/fehler";
import { type ConversationId, isId, newId, type RunId } from "@paibot/shared/ids";
import { LIMITS } from "@paibot/shared/konstanten";
import { ACTIVE_RUN_STATUSES, type SchleuseMode } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import type { RoutenAktion, RoutenKontext } from "../api/route";
import type { RoutenName } from "../routen";
import { schleuseEingerichtet } from "../schleuse/schleuse";
import type { Einreihen } from "../warteschlange";
import {
  ladeBelege,
  ladeLaufWerkzeuge,
  ladeUnterhaltungen,
  ladeVerlauf,
  schleuseVon,
  unterhaltungInfo,
} from "./laden";

function unterhaltungsId(params: Readonly<Record<string, string>>): ConversationId {
  const id = params.id;
  if (!isId("conversation", id)) throw new PaiBotError("nicht_gefunden");
  return id;
}

/** `GET /api/unterhaltungen`: Unterhaltungen des Bots, neueste zuerst. */
export const unterhaltungenListe: RoutenAktion<"unterhaltungen"> = async (k) => ({
  daten: { unterhaltungen: await ladeUnterhaltungen(k.db) },
});

/** `POST /api/unterhaltungen`: neue Unterhaltung mit dem Standard-Bot. */
export const unterhaltungAnlegen: RoutenAktion<"unterhaltungAnlegen"> = async (k) => {
  const settings = await repo.settings.get(k.db);
  const botId = settings?.defaultBotId;
  if (botId === undefined) throw new PaiBotError("einrichtung_offen");
  const conversationId = newId("conversation");
  const titel = k.eingabe.title ?? t("chat.titel.neu");
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "unterhaltung.anlegen", target: { conversationId, botId } },
    {},
    async () => {
      const u = await repo.conversations.create(k.db, { id: conversationId, botId, title: titel });
      return { value: u, result: { status: "ok" } };
    },
  );
  return {
    daten: {
      unterhaltung: unterhaltungInfo(ergebnis.value, settings),
      zuletzt: ergebnis.value.createdAt,
    },
    status: 201,
  };
};

/** `GET /api/unterhaltungen/:id`: Unterhaltung mit ihren Belegen (für die Arbeitsfläche). */
export const unterhaltungLesen: RoutenAktion<"unterhaltung"> = async (k) => {
  const id = unterhaltungsId(k.params);
  const u = await repo.conversations.get(k.db, id);
  if (u === undefined) throw new PaiBotError("nicht_gefunden");
  const settings = await repo.settings.get(k.db);
  return {
    daten: { unterhaltung: unterhaltungInfo(u, settings), belege: await ladeBelege(k.db, id) },
  };
};

/** `PATCH /api/unterhaltungen/:id`: umbenennen. */
export const unterhaltungUmbenennen: RoutenAktion<"unterhaltungUmbenennen"> = async (k) => {
  const id = unterhaltungsId(k.params);
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "unterhaltung.umbenennen", target: { conversationId: id } },
    {},
    async () => {
      const u = await repo.conversations.rename(k.db, id, k.eingabe.title);
      if (u === undefined) throw new PaiBotError("nicht_gefunden");
      return { value: u, result: { status: "ok" } };
    },
  );
  const settings = await repo.settings.get(k.db);
  return { daten: { unterhaltung: unterhaltungInfo(ergebnis.value, settings) } };
};

/**
 * `DELETE /api/unterhaltungen/:id`: löschen. Solange der Bot noch antwortet, lehnt die Route ab
 * (`lauf_aktiv`); erst abbrechen oder abwarten. Die Belege bleiben.
 */
export const unterhaltungLoeschen: RoutenAktion<"unterhaltungLoeschen"> = async (k) => {
  const id = unterhaltungsId(k.params);
  if ((await repo.conversations.get(k.db, id)) === undefined) {
    throw new PaiBotError("nicht_gefunden");
  }
  if ((await repo.runs.getActive(k.db, id)) !== undefined) throw new PaiBotError("lauf_aktiv");
  await k.tor(
    k.nachweis,
    { type: "unterhaltung.loeschen", target: { conversationId: id } },
    {},
    async () => {
      if (!(await repo.conversations.remove(k.db, id))) throw new PaiBotError("nicht_gefunden");
      return { value: undefined, result: { status: "ok" } };
    },
  );
  return { daten: { geloescht: id } };
};

/** Schaltet die Datenschleuse einer Unterhaltung über das Tor um. */
async function schleuseUmschalten<N extends RoutenName>(
  k: RoutenKontext<N>,
  id: ConversationId,
  mode: SchleuseMode,
  vorher: SchleuseMode,
) {
  if (k.nachweis === undefined) throw new PaiBotError("nicht_angemeldet");
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "schleuse.umschalten", target: { conversationId: id } },
    {
      scope: "unterhaltung",
      mode,
      previousMode: vorher,
      schleuseInstalled: await schleuseEingerichtet(k.db, k.dienste),
    },
    async () => {
      const u = await repo.conversations.setSchleuseMode(k.db, id, mode);
      if (u === undefined) throw new PaiBotError("nicht_gefunden");
      return { value: u, result: { status: "ok" } };
    },
  );
  return ergebnis.value;
}

/** `PUT /api/unterhaltungen/:id/schleuse`: Datenschleuse für diese Unterhaltung an oder aus. */
export const unterhaltungSchleuse: RoutenAktion<"unterhaltungSchleuse"> = async (k) => {
  const id = unterhaltungsId(k.params);
  const u = await repo.conversations.get(k.db, id);
  if (u === undefined) throw new PaiBotError("nicht_gefunden");
  const settings = await repo.settings.get(k.db);
  const neu = await schleuseUmschalten(k, id, k.eingabe.mode, schleuseVon(u, settings));
  return { daten: { unterhaltung: unterhaltungInfo(neu, settings) } };
};

/**
 * `GET /api/unterhaltungen/:id/nachrichten`: Verlauf in einem Lesestand, mit den Zwischentexten
 * und Werkzeug-Aufrufen der Schritte für die Anzeige (die Ansicht trennt sie von den Antworten).
 */
export const nachrichtenLesen: RoutenAktion<"nachrichten"> = async (k) => {
  const id = unterhaltungsId(k.params);
  const verlauf = await ladeVerlauf(k.db, id, { mitSchritten: true });
  if (verlauf === undefined) throw new PaiBotError("nicht_gefunden");
  return { daten: verlauf };
};

/**
 * `GET /api/unterhaltungen/:id/laeufe/:laufId/werkzeuge`: die Werkzeug-Aufrufe eines Laufs als
 * Projektion für die Anzeige (Zustand, Fundstellen, Kurzform der Frage, Belege) und die Kennungen
 * seiner festen Antworten. Nur Läufe dieser Unterhaltung, sonst `nicht_gefunden`; ändert nichts.
 */
export const laufWerkzeugeLesen: RoutenAktion<"laufWerkzeuge"> = async (k) => {
  const id = unterhaltungsId(k.params);
  const laufId = k.params.laufId;
  if (!isId("run", laufId)) throw new PaiBotError("nicht_gefunden");
  const lauf = await ladeLaufWerkzeuge(k.db, id, laufId as RunId);
  if (lauf === undefined) throw new PaiBotError("nicht_gefunden");
  return { daten: lauf };
};

/**
 * `POST /api/unterhaltungen/:id/nachrichten`: Nachricht senden. Weicht der Schalter vom Modus der
 * Unterhaltung ab, wird zuerst die Datenschleuse umgeschaltet (eigene Aktion). Danach entscheidet
 * das Tor über `nachricht.senden`; erst mit Erlaubnis entstehen in EINER Transaktion Nachricht,
 * Lauf, die Ereignisse `message.created` und `run.queued` und der Auftrag in der Warteschlange.
 * Scheitert ein Teil, entsteht nichts davon.
 */
export function nachrichtSenden(einreihen: Einreihen): RoutenAktion<"nachrichtSenden"> {
  return async (k) => {
    const id = unterhaltungsId(k.params);
    const { text, schleuse } = k.eingabe;
    const settings = await repo.settings.get(k.db);
    let unterhaltung = await repo.conversations.get(k.db, id);
    if (unterhaltung !== undefined) {
      const vorher = schleuseVon(unterhaltung, settings);
      if (schleuse !== vorher) unterhaltung = await schleuseUmschalten(k, id, schleuse, vorher);
    }
    const aktiv = unterhaltung === undefined ? undefined : await repo.runs.getActive(k.db, id);
    const messageId = newId("message");
    await einreihen.bereit();
    const ergebnis = await k.tor(
      k.nachweis,
      { type: "nachricht.senden", target: { conversationId: id, messageId } },
      {
        inputChars: text.length,
        maxInputChars: LIMITS.messageChars,
        conversationExists: unterhaltung !== undefined,
        runActive: aktiv !== undefined,
        killSwitch: settings?.killSwitch ?? false,
      },
      async () => {
        const botId = unterhaltung?.botId;
        if (botId === undefined) throw new PaiBotError("nicht_gefunden");
        const value = await k.db.transaction(async (tx) => {
          const nachricht = await repo.messages.insert(tx, {
            id: messageId,
            conversationId: id,
            role: "user",
            content: text,
          });
          const lauf = await repo.runs.create(tx, {
            conversationId: id,
            triggerMessageId: nachricht.id,
            botId,
          });
          await repo.events.append(tx, {
            conversationId: id,
            type: "message.created",
            data: { messageId: nachricht.id, role: "user", text },
          });
          await repo.events.append(tx, {
            conversationId: id,
            type: "run.queued",
            data: { runId: lauf.id },
          });
          await einreihen.lauf({ runId: lauf.id, conversationId: id }, tx);
          return { messageId: nachricht.id, runId: lauf.id, zeit: nachricht.createdAt };
        });
        return { value, result: { status: "ok" } };
      },
    );
    return { daten: ergebnis.value, status: 202 };
  };
}

/**
 * `POST /api/unterhaltungen/:id/laeufe/:laufId/abbrechen`: Stopp. Der Worker sieht den Wunsch
 * binnen einer halben Sekunde und beendet den Lauf. Der Teiltext des gestoppten Schritts bleibt als
 * Zwischentext gespeichert und erscheint als „abgebrochen“, nie als Antwort. Ohne aktiven Lauf lehnt
 * das Tor ab (Vorbedingung „Lauf aktiv“, `nicht_gefunden`).
 */
export const laufAbbrechen: RoutenAktion<"laufAbbrechen"> = async (k) => {
  const id = unterhaltungsId(k.params);
  const laufId = k.params.laufId;
  if (!isId("run", laufId)) throw new PaiBotError("nicht_gefunden");
  const lauf = await repo.runs.get(k.db, laufId as RunId);
  if (lauf === undefined || lauf.conversationId !== id) throw new PaiBotError("nicht_gefunden");
  const aktiv = (ACTIVE_RUN_STATUSES as readonly string[]).includes(lauf.status);
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "lauf.abbrechen", target: { conversationId: id, runId: lauf.id } },
    { runActive: aktiv },
    async () => {
      const vorgemerkt = await repo.runs.requestCancel(k.db, lauf.id, { now: k.dienste.uhr.now() });
      return { value: vorgemerkt !== undefined, result: { status: "ok" } };
    },
  );
  return { daten: { runId: lauf.id, angefragt: ergebnis.value } };
};

/** So viele letzte Nachrichten liest „neu erzeugen“, um die Antwort und ihre Nachricht zu finden. */
const NEU_FENSTER = 50;

/**
 * `POST /api/unterhaltungen/:id/antworten/:antwortId/neu`: die letzte Antwort neu erzeugen. Die
 * alte Antwort bleibt als frühere Fassung stehen; es entsteht ein neuer Lauf zur selben Nachricht
 * der Person (mit dem Modell, das der Bot jetzt hat). Das Tor entscheidet über
 * `antwort.neu_erzeugen` (Unterhaltung vorhanden, kein Lauf aktiv, letzte Antwort, Not-Aus); erst
 * mit Erlaubnis entstehen in EINER Transaktion Lauf, Ereignis `run.queued` und der Auftrag.
 * Ziel und „letzte Antwort“ gelten nur für End-Antworten: Zwischentexte eines Laufs mit Werkzeugen
 * (`step` gesetzt) lesen beide Stellen nicht mit.
 */
export function antwortNeuErzeugen(einreihen: Einreihen): RoutenAktion<"antwortNeuErzeugen"> {
  return async (k) => {
    const id = unterhaltungsId(k.params);
    const antwortId = k.params.antwortId;
    if (!isId("message", antwortId)) throw new PaiBotError("nicht_gefunden");
    const settings = await repo.settings.get(k.db);
    const unterhaltung = await repo.conversations.get(k.db, id);
    const verlauf =
      unterhaltung === undefined
        ? []
        : (
            await repo.messages.listForConversation(k.db, id, {
              limit: NEU_FENSTER,
              nurAntworten: true,
            })
          ).filter((m) => m.role !== "system");
    const stelle = verlauf.findIndex((m) => m.id === antwortId);
    const antwort = verlauf[stelle];
    if (unterhaltung !== undefined && (antwort === undefined || antwort.role !== "assistant")) {
      throw new PaiBotError("nicht_gefunden");
    }
    const ausloeser = verlauf
      .slice(0, Math.max(stelle, 0))
      .reverse()
      .find((m) => m.role === "user");
    if (unterhaltung !== undefined && ausloeser === undefined) {
      throw new PaiBotError("nicht_gefunden");
    }
    const aktiv = unterhaltung === undefined ? undefined : await repo.runs.getActive(k.db, id);
    await einreihen.bereit();
    const ergebnis = await k.tor(
      k.nachweis,
      { type: "antwort.neu_erzeugen", target: { conversationId: id, messageId: antwortId } },
      {
        conversationExists: unterhaltung !== undefined,
        runActive: aktiv !== undefined,
        answerIsLatest: verlauf.at(-1)?.id === antwortId,
        killSwitch: settings?.killSwitch ?? false,
      },
      async () => {
        const botId = unterhaltung?.botId;
        if (botId === undefined || ausloeser === undefined) throw new PaiBotError("nicht_gefunden");
        const value = await k.db.transaction(async (tx) => {
          // Kam seit dem Lesen eine Nachricht dazu, ist die Antwort nicht mehr die letzte.
          const [letzte] = (
            await repo.messages.listForConversation(tx, id, { limit: 5, nurAntworten: true })
          )
            .filter((m) => m.role !== "system")
            .slice(-1);
          if (letzte?.id !== antwortId) throw new PaiBotError("nicht_gefunden");
          const lauf = await repo.runs.create(tx, {
            conversationId: id,
            triggerMessageId: ausloeser.id,
            botId,
          });
          await repo.events.append(tx, {
            conversationId: id,
            type: "run.queued",
            data: { runId: lauf.id },
          });
          await einreihen.lauf({ runId: lauf.id, conversationId: id }, tx);
          return { runId: lauf.id, ersetzt: antwortId, nachrichtId: ausloeser.id };
        });
        return { value, result: { status: "ok" } };
      },
    );
    return { daten: ergebnis.value, status: 202 };
  };
}
