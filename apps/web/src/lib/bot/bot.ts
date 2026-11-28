/**
 * PaiBot – der Bot der ersten Version: lesen, Name, Anweisung und Aussehen ändern, Modell wählen,
 * und der Überblick „Was dein Bot darf“, abgeleitet aus den geltenden Regeln.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo } from "@paibot/db";
import { BOT_FIELDS } from "@paibot/shared/aktionen";
import type { BotInput } from "@paibot/shared/eingaben";
import { PaiBotError } from "@paibot/shared/fehler";
import type { BotId, ModelId, ProviderId } from "@paibot/shared/ids";
import type { Bot, Region } from "@paibot/shared/objekte";
import { isTextKey, t } from "@paibot/shared/texte";
import { ACTOR_FACT, type RuleDefinition } from "@paibot/shared/tor";
import { STANDARD_RULES_5 } from "@paibot/shared/tor-fassung-5";
import type { RoutenKontext } from "../api/route";
import { anbieterHerkunft } from "../modelle/herkunft";

type BotFeld = (typeof BOT_FIELDS)[number];

/** Welche Felder sich gegenüber dem gespeicherten Bot ändern (für den Fakt `fields`). */
export function geaenderteFelder(alt: Bot, neu: BotInput): BotFeld[] {
  return BOT_FIELDS.filter((feld) => alt[feld] !== neu[feld]);
}

// Bewusst der Standard-Bot: `GET`/`PUT /api/bot` gehören zum Haupt-Assistenten. Die weiteren
// Bots ändert der Besitzer über die Routen unter `/api/bots/:id` (`lib/teams/verwaltung.ts`).
async function standardBot(db: Database): Promise<Bot> {
  const bot = await repo.bots.getDefault(db);
  if (bot === undefined) throw new PaiBotError("nicht_gefunden");
  return bot;
}

/** Modell des Bots, wie die Seiten es zeigen. */
export interface BotModell {
  id: ModelId;
  displayName: string;
  slug: string;
  anbieter: string;
  /** Kennung des Anbieters, zu dem das Modell gehört. */
  anbieterId: ProviderId;
  region: Region;
  /** Belegbare Herkunft in Worten (`anbieterHerkunft`), nie ein pauschales „EU“. */
  herkunft: string;
}

export async function modellVon(db: Database, bot: Bot): Promise<BotModell | undefined> {
  if (bot.modelId === undefined) return undefined;
  const modell = await repo.models.get(db, bot.modelId as ModelId);
  if (modell === undefined) return undefined;
  const anbieter = await repo.providers.get(db, modell.providerId as never);
  if (anbieter === undefined) return undefined;
  return {
    id: modell.id as ModelId,
    displayName: modell.displayName,
    slug: modell.slug,
    anbieter: anbieter.name,
    anbieterId: anbieter.id as ProviderId,
    region: anbieter.region,
    herkunft: anbieterHerkunft(anbieter),
  };
}

/** `GET /api/bot`. */
export async function botLesen(k: RoutenKontext<"bot">) {
  const bot = await standardBot(k.db);
  return { daten: { bot, modell: (await modellVon(k.db, bot)) ?? null } };
}

/** `PUT /api/bot`: speichert nur, was sich geändert hat; ohne Änderung `eingabe_ungueltig`. */
export async function botAendern(k: RoutenKontext<"botAendern">) {
  const alt = await standardBot(k.db);
  const felder = geaenderteFelder(alt, k.eingabe);
  if (felder.length === 0) {
    throw new PaiBotError("eingabe_ungueltig", {
      text: t("bot.unveraendert"),
      felder: [{ feld: "eingabe", code: "ungueltig" }],
    });
  }
  const botId = alt.id as BotId;
  const patch = Object.fromEntries(felder.map((f) => [f, k.eingabe[f]]));
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "bot.aendern", target: { botId } },
    { fields: felder },
    async () => {
      const neu = await repo.bots.update(k.db, botId, patch);
      if (neu === undefined) throw new PaiBotError("nicht_gefunden");
      return { value: neu, result: { status: "ok" } };
    },
  );
  return { daten: { bot: ergebnis.value } };
}

function nichtInListe(): PaiBotError {
  return new PaiBotError("eingabe_ungueltig", {
    text: t("modelle.nicht_in_liste"),
    ausweg: t("modelle.nicht_in_liste.ausweg"),
    felder: [{ feld: "modelId", code: "ungueltig" }],
  });
}

/**
 * `PUT /api/bot/modell`: nur ein Modell, das der Anbieter in seiner zuletzt geholten Liste gemeldet
 * hat (wählbar) und dessen Anbieter aktiv ist.
 */
export async function botModell(k: RoutenKontext<"botModell">) {
  const modelId = k.eingabe.modelId as ModelId;
  const modell = await repo.models.get(k.db, modelId);
  if (modell === undefined || !modell.enabled) throw nichtInListe();
  const anbieter = await repo.providers.get(k.db, modell.providerId as never);
  if (anbieter === undefined || !anbieter.enabled) throw nichtInListe();
  const bot = await standardBot(k.db);
  const botId = bot.id as BotId;
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "modell.waehlen", target: { botId, modelId } },
    {},
    async () => {
      const neu = await repo.bots.setModel(k.db, botId, modelId);
      if (neu === undefined) throw new PaiBotError("nicht_gefunden");
      return { value: neu, result: { status: "ok" } };
    },
  );
  return { daten: { bot: ergebnis.value, modell: await modellVon(k.db, ergebnis.value) } };
}

/** Ein Eintrag im Überblick „Was dein Bot darf“. */
export interface RechtEintrag {
  id: string;
  text: string;
}

export interface BotRechte {
  erlaubt: RechtEintrag[];
  fragt: RechtEintrag[];
  nie: RechtEintrag[];
}

/**
 * Regeln der Zusammenarbeit (Tor-Fassung 5): Sie wirken nur mit Teams und ihren Schaltern, für die
 * es noch keine Bedienung gibt. Bis dahin stehen sie nicht im Überblick, sonst sähe es so aus, als
 * dürfte der Bot schon Aufträge geben.
 */
const ZUSAMMENARBEIT: ReadonlySet<string> = new Set(STANDARD_RULES_5.map((r) => r.id));

function giltFuerBot(regel: RuleDefinition): boolean {
  if (ZUSAMMENARBEIT.has(regel.id)) return false;
  return regel.conditions.some((c) => c.fact === ACTOR_FACT && c.op === "eq" && c.value === "bot");
}

/** Text einer Regel auf der Seite „Was dein Bot darf“: der Titel der Regel, wie überall sonst. */
function regelText(regel: RuleDefinition): string {
  const schluessel = `regel.${regel.id}`;
  return isTextKey(schluessel) ? (t as (key: string) => string)(schluessel) : regel.title;
}

/**
 * Leitet aus den aktiven Regeln ab, was der Bot darf: Regeln, die für den Akteur „Bot“ gelten,
 * nach ihrer Wirkung (erlauben, fragen, ablehnen). Dazu kommt die feste Grenze G-01. Rein.
 */
export function botRechte(regeln: readonly RuleDefinition[]): BotRechte {
  const rechte: BotRechte = { erlaubt: [], fragt: [], nie: [] };
  const sortiert = [...regeln].sort((a, b) => a.id.localeCompare(b.id));
  for (const regel of sortiert) {
    if (!regel.enabled || !giltFuerBot(regel)) continue;
    const eintrag = { id: regel.id, text: regelText(regel) };
    if (regel.effect === "allow") rechte.erlaubt.push(eintrag);
    else if (regel.effect === "ask") rechte.fragt.push(eintrag);
    else rechte.nie.push(eintrag);
  }
  rechte.nie.push({ id: "G-01", text: t("bot.darf.g01") });
  return rechte;
}

/** Alles, was die Seite `/bot` vom Server braucht (ohne Geheimnisse). */
export interface BotSeitenDaten {
  bot: Pick<Bot, "id" | "name" | "instructions" | "avatarShape" | "color" | "maxOutputTokens">;
  modell?: BotModell;
  rechte: BotRechte;
}

// Bewusst der Standard-Bot: Die Seite `/bot` ist der Haupt-Assistent. Der Steckbrief eines
// weiteren Bots kommt aus `lib/teams/seite.ts#botSeite` mit der Kennung aus der Adresse.
export async function botSeitenDaten(db: Database): Promise<BotSeitenDaten | undefined> {
  const bot = await repo.bots.getDefault(db);
  if (bot === undefined) return undefined;
  const regeln = await repo.rules.listActive(db);
  const modell = await modellVon(db, bot);
  return {
    bot: {
      id: bot.id,
      name: bot.name,
      instructions: bot.instructions,
      avatarShape: bot.avatarShape,
      color: bot.color,
      maxOutputTokens: bot.maxOutputTokens,
    },
    ...(modell === undefined ? {} : { modell }),
    rechte: botRechte(regeln),
  };
}
