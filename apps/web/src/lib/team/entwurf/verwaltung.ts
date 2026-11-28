/**
 * PaiBot – Team-Entwürfe: Vorlagen auflisten, einen Entwurf erstellen, lesen, verwerfen, mit einem
 * Klick anlegen und als Ganzes zurücknehmen. Jede Änderung geht als Besitzer-Aktion durch das Tor;
 * die Fakten der Entscheidung liest nur der Server aus der Datenbank, nie der Browser.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type Database, repo } from "@paibot/db";
import { PaiBotError } from "@paibot/shared/fehler";
import { type BotId, type EntwurfId, isId, type ModelId, newId } from "@paibot/shared/ids";
import { LIMITS } from "@paibot/shared/konstanten";
import { neuerNameUnzulaessig } from "@paibot/shared/namen";
import type { RoutenAktion } from "../../api/route";
import { tagesbeginn } from "../../einstellungen/grenzen";
import { nacheinander } from "../../teams/reihe";
import {
  ENTWURF_GRENZEN,
  type EntwurfBot,
  entwurfAbdruck,
  type ModellEintrag,
  pruefeEntwurf,
  type TeamEntwurf,
  WIE_PAI,
} from "./format";
import { ladeVorlage, ladeVorlagen, type TeamVorlage } from "./vorlagen";

/** Format, in dem Entwürfe geschrieben werden; es steht in jeder Zeile der Tabelle. */
export const ENTWURF_FORMAT_FASSUNG = 2;

/** Herkunft dieser Fassung: Vorlagen aus dem Image. Dateien und Assistent kommen später. */
const HERKUNFT = "vorlage" as const;

function entwurfsId(params: Readonly<Record<string, string>>): EntwurfId {
  const id = params.id;
  if (!isId("entwurf", id)) throw new PaiBotError("nicht_gefunden");
  return id;
}

/** Die eigenen Modelle, wie `pruefeEntwurf` sie für die Zuordnung braucht. */
async function modellListe(db: Database): Promise<ModellEintrag[]> {
  const modelle = await repo.models.list(db);
  return modelle.map((modell) => ({ slug: modell.slug, eingeschaltet: modell.enabled }));
}

/**
 * Ein Entwurf, wie die Oberfläche ihn bekommt: der geprüfte Inhalt (also mit zugeordneten
 * Modellen), sein Abdruck, der Stand, die Frist und – nach dem Anlegen – was entstanden ist.
 */
export interface EntwurfAnsicht {
  id: EntwurfId;
  status: repo.entwuerfe.Entwurf["status"];
  /** Vorlagen-Kennung mit Fassung, z. B. `content-team@3f0a1b2c4d5e`. */
  quelle: string;
  titel: string;
  inhalt: TeamEntwurf;
  abdruck: string;
  validUntil?: string;
  createdAt: string;
  /** Ob „Rückgängig“ jetzt noch ginge (nur bei Stand `angelegt` gefüllt). */
  rueckgaengig?: { moeglich: boolean };
}

/**
 * Liest den gespeicherten Inhalt eines Entwurfs und prüft ihn erneut. Ein Inhalt, der die Prüfung
 * nicht mehr besteht, wird nie angelegt: Das Format ist dieselbe Quelle wie beim Erstellen, und
 * eine Zeile, die sie verletzt, kann nur durch eine Änderung von außen entstanden sein
 * (fail-closed).
 */
async function inhaltLesen(
  roh: unknown,
  modelle: readonly ModellEintrag[],
): Promise<{ inhalt: TeamEntwurf; abdruck: string }> {
  const geprueft = await pruefeEntwurf(roh, { modelle });
  if (!geprueft.ok) throw new PaiBotError("intern");
  return { inhalt: geprueft.entwurf, abdruck: geprueft.abdruck };
}

async function zuAnsicht(
  db: Database,
  entwurf: repo.entwuerfe.Entwurf,
  modelle: readonly ModellEintrag[],
): Promise<EntwurfAnsicht> {
  const gelesen = await inhaltLesen(entwurf.content, modelle);
  return {
    id: entwurf.id,
    status: entwurf.status,
    quelle: entwurf.source,
    titel: entwurf.title,
    inhalt: gelesen.inhalt,
    abdruck: gelesen.abdruck,
    ...(entwurf.validUntil === undefined ? {} : { validUntil: entwurf.validUntil }),
    createdAt: entwurf.createdAt,
    ...(entwurf.status === "angelegt"
      ? { rueckgaengig: { moeglich: await rueckgaengigMoeglich(db, entwurf.id) } }
      : {}),
  };
}

async function rueckgaengigMoeglich(db: Database, id: EntwurfId): Promise<boolean> {
  const stand = await repo.entwuerfe.nutzung(db, id);
  return stand.allUnused && stand.allUnchanged;
}

/** Eine Vorlage, wie die Liste sie zeigt: Titel, Beschreibung und der ganze Entwurf. */
export interface VorlageAnsicht {
  kennung: string;
  quelle: string;
  titel: string;
  beschreibung?: string;
  inhalt: TeamEntwurf;
  abdruck: string;
  hinweise: TeamVorlage["hinweise"];
}

function vorlageAnsicht(vorlage: TeamVorlage): VorlageAnsicht {
  return {
    kennung: vorlage.kennung,
    quelle: vorlage.quelle,
    titel: vorlage.titel,
    ...(vorlage.beschreibung === undefined ? {} : { beschreibung: vorlage.beschreibung }),
    inhalt: vorlage.entwurf,
    abdruck: vorlage.abdruck,
    hinweise: vorlage.hinweise,
  };
}

/**
 * `GET /api/team-vorlagen`: die Vorlagen aus dem Image, mit den eigenen Modellen zugeordnet. Liest
 * nur Dateien von der Platte – kein Netz (`vorlagen.ts`).
 */
export const teamVorlagenListe: RoutenAktion<"teamVorlagenListe"> = async (k) => {
  const vorlagen = await ladeVorlagen({ modelle: await modellListe(k.db) });
  return { daten: { vorlagen: vorlagen.map(vorlageAnsicht) } };
};

/** `GET /api/team-entwuerfe`: alle Entwürfe, neueste zuerst. */
export const teamEntwuerfeListe: RoutenAktion<"teamEntwuerfeListe"> = async (k) => {
  const modelle = await modellListe(k.db);
  const liste = await repo.entwuerfe.list(k.db);
  return {
    daten: { entwuerfe: await Promise.all(liste.map((e) => zuAnsicht(k.db, e, modelle))) },
  };
};

/** `GET /api/team-entwuerfe/:id`: ein Entwurf. Der Verfall wirkt beim Lesen mit. */
export const teamEntwurfLesen: RoutenAktion<"teamEntwurfLesen"> = async (k) => {
  const entwurf = await repo.entwuerfe.mitVerfall(k.db, entwurfsId(k.params));
  if (entwurf === undefined) throw new PaiBotError("nicht_gefunden");
  return { daten: { entwurf: await zuAnsicht(k.db, entwurf, await modellListe(k.db)) } };
};

/**
 * `POST /api/team-entwuerfe`: erstellt einen Entwurf aus einer Vorlage des Images. Die Grenzen
 * „höchstens N offen“ und „N je Tag“ zieht das Tor aus den Fakten `offeneEntwuerfe` und
 * `entwuerfeHeute`; der Not-Aus sperrt über `killSwitch`.
 */
export const teamEntwurfErstellen: RoutenAktion<"teamEntwurfErstellen"> = async (k) => {
  const modelle = await modellListe(k.db);
  const vorlage = await ladeVorlage(k.eingabe.template, { modelle });
  if (vorlage === undefined) throw new PaiBotError("nicht_gefunden");
  const einstellungen = await repo.settings.get(k.db);
  const jetzt = new Date();
  const entwurfId = newId("entwurf");
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "team.entwurf_erstellen", target: { entwurfId } },
    {
      herkunft: HERKUNFT,
      offeneEntwuerfe: await repo.entwuerfe.zaehleOffen(k.db),
      maxOffeneEntwuerfe: LIMITS.teamDraftsOpen,
      entwuerfeHeute: await repo.entwuerfe.zaehleSeit(
        k.db,
        tagesbeginn(jetzt, einstellungen?.timezone ?? "UTC"),
      ),
      maxEntwuerfeProTag: LIMITS.teamDraftsPerDay,
      killSwitch: einstellungen?.killSwitch ?? false,
    },
    async () => {
      const entwurf = await repo.entwuerfe.create(k.db, {
        id: entwurfId,
        origin: HERKUNFT,
        source: vorlage.quelle,
        title: vorlage.titel,
        content: vorlage.entwurf,
        digest: vorlage.abdruck,
        formatVersion: ENTWURF_FORMAT_FASSUNG,
        validUntil: new Date(jetzt.getTime() + LIMITS.teamDraftValidDays * 24 * 60 * 60 * 1000),
      });
      return { value: entwurf, result: { status: "ok" } };
    },
  );
  return {
    daten: { entwurf: await zuAnsicht(k.db, ergebnis.value, modelle) },
    status: 201,
  };
};

/**
 * `DELETE /api/team-entwuerfe/:id`: verwirft einen offenen Entwurf. Der Inhalt bleibt lesbar; der
 * Not-Aus hält das Verwerfen nicht auf, es nimmt nur etwas weg.
 */
export const teamEntwurfVerwerfen: RoutenAktion<"teamEntwurfVerwerfen"> = async (k) => {
  const entwurfId = entwurfsId(k.params);
  const entwurf = await repo.entwuerfe.get(k.db, entwurfId);
  if (entwurf === undefined) throw new PaiBotError("nicht_gefunden");
  await k.tor(
    k.nachweis,
    { type: "team.entwurf_verwerfen", target: { entwurfId } },
    { entwurfOffen: entwurf.status === "offen" },
    async () => {
      if ((await repo.entwuerfe.verwerfen(k.db, entwurfId)) === undefined) {
        throw new PaiBotError("nicht_gefunden");
      }
      return { value: undefined, result: { status: "ok" } };
    },
  );
  return { daten: { verworfen: entwurfId } };
};

/**
 * Ordnet einen Bot des Entwurfs einem eigenen Modell zu. „Wie Pai“ heißt: das Modell des
 * Standard-Bots. Eine Kennung gilt nur, wenn genau ein eingeschaltetes Modell sie trägt – das hat
 * `pruefeEntwurf` schon geprüft und sonst auf „wie Pai“ zurückgestellt, darum reicht hier die
 * Suche. Ohne Modell bleibt `undefined`; das macht den Fakt `modelsAvailable` falsch.
 */
async function modellFuer(
  db: Database,
  bot: EntwurfBot,
  wiePai: ModelId | undefined,
): Promise<ModelId | undefined> {
  if (bot.modell === WIE_PAI) return wiePai;
  const slug = bot.modell.slug;
  const treffer = (await repo.models.list(db, { enabledOnly: true })).filter(
    (modell) => modell.slug === slug,
  );
  return treffer.length === 1 ? (treffer[0]?.id as ModelId) : wiePai;
}

/** Was aus einem Entwurf angelegt wird, mit allen Fakten, die das Tor dafür braucht. */
interface Vorhaben {
  bots: repo.entwuerfe.EntwurfBotAnlage[];
  /** Jeder Bot hat ein Modell (Vorbedingung „Modelle vorhanden“). */
  modelsAvailable: boolean;
  /** Kein Name ist vergeben oder mit einem bestehenden zu verwechseln, keiner beginnt mit „Team “. */
  namesFree: boolean;
  /** Die Leitung ist einer der Bots, die angelegt werden (Vorbedingung „Ansprechpartner“). */
  contactInDraft: boolean;
}

/**
 * Rechnet aus dem geprüften Inhalt, was angelegt würde. Hier wird nichts abgelehnt: Die Fakten
 * gehen ans Tor, und das Tor entscheidet. So steht jede Ablehnung in einem Beleg.
 */
async function vorhabenAus(db: Database, inhalt: TeamEntwurf): Promise<Vorhaben> {
  const leitung = inhalt.team.leitung.name;
  const wiePai = (await repo.bots.getDefault(db))?.modelId as ModelId | undefined;
  const vorhandene = await repo.bots.list(db);
  const gesehen: { id: string; name: string }[] = vorhandene.map((b) => ({
    id: b.id,
    name: b.name,
  }));
  let namesFree = true;
  let modelsAvailable = true;
  const bots: repo.entwuerfe.EntwurfBotAnlage[] = [];
  for (const bot of inhalt.bots) {
    if (neuerNameUnzulaessig(bot.name, gesehen) !== undefined) namesFree = false;
    gesehen.push({ id: `\u0000entwurf:${bot.name}`, name: bot.name });
    const modelId = await modellFuer(db, bot, wiePai);
    if (modelId === undefined) modelsAvailable = false;
    bots.push({
      name: bot.name,
      role: bot.aufgabe,
      instructions: bot.anweisung,
      avatarShape: bot.form,
      color: bot.farbe,
      maxOutputTokens: bot.antwortLaenge,
      ...(modelId === undefined ? {} : { modelId }),
      ...(bot.name === leitung ? { leitung: true } : {}),
    });
  }
  return {
    bots,
    modelsAvailable,
    namesFree,
    contactInDraft: bots.some((b) => b.leitung === true),
  };
}

/**
 * `POST /api/team-entwuerfe/:id/anlegen`: legt Team und Bots in **einer** Transaktion an.
 *
 * Die Seite schickt den Inhalt mit, den sie zeigt (`content`): eine geänderte Anweisung, ein
 * abgewählter Bot. Der Server prüft ihn mit dem Format und rechnet seinen Abdruck selbst; der
 * Abdruck aus der Anfrage (`seenDigest`) muss dazu passen, sonst lehnt das Tor mit
 * „Entwurf veraltet“ ab (Vorbedingung „Entwurf-Fassung passt“). Beide Abdrücke stehen damit in der
 * Entscheidung, und die Transaktion schreibt genau diesen Inhalt in den Entwurf.
 *
 * Reihe (`nacheinander`): Die gezählte Zahl der Bots muss bis zum Einfügen gelten. Über Prozesse
 * hinweg hält zusätzlich die Sperre der Datenbank (`repo.entwuerfe.anwenden`).
 */
export const teamEntwurfAnlegen: RoutenAktion<"teamEntwurfAnlegen"> = async (k) =>
  nacheinander(async () => {
    const entwurfId = entwurfsId(k.params);
    const modelle = await modellListe(k.db);
    const entwurf = await repo.entwuerfe.mitVerfall(k.db, entwurfId);
    if (entwurf === undefined) throw new PaiBotError("nicht_gefunden");

    const roh = k.eingabe.content === undefined ? entwurf.content : k.eingabe.content;
    const geprueft = await pruefeEntwurf(roh, { modelle });
    if (!geprueft.ok) {
      // Der Grund jeder Fundstelle steht im Feldnamen (`bots[1].anweisung: zu_lang`): Die Codes des
      // Formats sind feiner als die der API-Hülle, und der Besitzer soll die Stelle sehen.
      throw new PaiBotError("eingabe_ungueltig", {
        felder: geprueft.fehler.slice(0, ENTWURF_GRENZEN.fehlerMax).map((f) => ({
          feld: `${f.pfad === "" ? "content" : f.pfad}: ${f.code}`,
          code: "ungueltig" as const,
        })),
      });
    }
    const inhalt = geprueft.entwurf;
    const abdruck = await entwurfAbdruck(inhalt);
    const vorhaben = await vorhabenAus(k.db, inhalt);
    const einstellungen = await repo.settings.get(k.db);
    const botsVorher = await repo.bots.count(k.db);

    const ergebnis = await k.tor(
      k.nachweis,
      { type: "team.entwurf_anlegen", target: { entwurfId } },
      {
        entwurfOffen: entwurf.status === "offen",
        entwurfDigest: abdruck,
        seenEntwurfDigest: k.eingabe.seenDigest,
        namesFree: vorhaben.namesFree,
        modelsAvailable: vorhaben.modelsAvailable,
        contactInDraft: vorhaben.contactInDraft,
        draftBots: vorhaben.bots.length,
        maxDraftBots: ENTWURF_GRENZEN.botsMax,
        botsAfter: botsVorher + vorhaben.bots.length,
        maxBots: LIMITS.bots,
        killSwitch: einstellungen?.killSwitch ?? false,
      },
      async (erlaubnis) => {
        const angelegt = await repo.entwuerfe.anwenden(k.db, {
          entwurfId,
          actionId: erlaubnis.actionId,
          inhalt,
          abdruck,
          team: {
            name: inhalt.team.name,
            collaboration: inhalt.team.zusammenarbeit,
            acceptanceDefault: inhalt.team.abnahme,
          },
          bots: vorhaben.bots,
          maxBots: LIMITS.bots,
        });
        return { value: angelegt, result: { status: "ok" } };
      },
      { undo: { possible: true, hint: RUECKGAENGIG_HINWEIS } },
    );
    return {
      daten: {
        team: ergebnis.value.team,
        bots: ergebnis.value.bots.map((bot) => ({ id: bot.id as BotId, name: bot.name })),
        beleg: ergebnis.receipts.decision.receiptId,
      },
      status: 201,
    };
  });

/** Steht als Rücknahme-Hinweis im Beleg des Anlegens (höchstens 300 Zeichen). */
const RUECKGAENGIG_HINWEIS = "Rückgängig, solange niemand an einen der neuen Bots geschrieben hat";

/**
 * `POST /api/team-entwuerfe/:id/zuruecknehmen`: nimmt das angelegte Team als Ganzes zurück. Die
 * Fakten `allUnused` und `allUnchanged` liest der Server aus der Datenbank; das Tor lehnt über
 * V-43 ab, wenn jemand schon an einen der neuen Bots geschrieben hat. Der Not-Aus hält das nicht
 * auf: Zurücknehmen nimmt nur etwas weg.
 */
export const teamEntwurfZuruecknehmen: RoutenAktion<"teamEntwurfZuruecknehmen"> = async (k) => {
  const entwurfId = entwurfsId(k.params);
  const entwurf = await repo.entwuerfe.get(k.db, entwurfId);
  if (entwurf === undefined) throw new PaiBotError("nicht_gefunden");
  const stand = await repo.entwuerfe.nutzung(k.db, entwurfId);
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "team.entwurf_zuruecknehmen", target: { entwurfId } },
    { allUnused: stand.allUnused, allUnchanged: stand.allUnchanged },
    async (erlaubnis) => {
      const weg = await repo.entwuerfe.zuruecknehmen(k.db, entwurfId, erlaubnis.actionId);
      return { value: weg, result: { status: "ok" } };
    },
  );
  return { daten: { zurueckgenommen: ergebnis.value } };
};
