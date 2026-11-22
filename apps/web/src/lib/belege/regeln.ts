/**
 * PaiBot – Regeln, Grenzen und Vorbedingungen des Tors in Nutzer-Sprache (nur Server): Satz,
 * Erklärung, für welche Aktionen, Fassung und Stufe.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ActionType, Credential } from "@paibot/shared/aktionen";
import { isTextKey, t } from "@paibot/shared/texte";
import {
  ACTOR_FACT,
  LIMIT_IDS,
  PRECONDITION_IDS,
  PRECONDITIONS,
  type RuleCondition,
  type RuleDefinition,
} from "@paibot/shared/tor";
import { LIMITS_BY_ID_4, PRECONDITIONS_4 } from "@paibot/shared/tor-fassung-4";

export interface RegelZeile {
  nr: string;
  titel: string;
  /** „erlaubt“, „lehnt ab“, „fragt“ bzw. bei Grenzen „sonst abgelehnt“. */
  wirkung: string;
  erklaerung: string;
  stufen?: { text: string; an?: "ja" | "frage" | "nie" }[];
}

function regelName(id: string, ersatz: string): string {
  const schluessel = `regel.${id}`;
  return isTextKey(schluessel) ? t(schluessel as "regel.R-001") : ersatz;
}

function aktionName(typ: string): string {
  const schluessel = `aktion.${typ}`;
  return isTextKey(schluessel) ? t(schluessel as "aktion.lauf.abbrechen") : typ;
}

function nachweisName(wert: unknown): string {
  return wert === "sitzung" || wert === "passwort" || wert === "einrichtungs_code"
    ? t(`regeln.nachweis.${wert as Credential}`)
    : String(wert);
}

/** Bedingungen, die sich in Worten sagen lassen (Akteur, Nachweis, Bot der Unterhaltung). */
function bedingungen(conditions: readonly RuleCondition[]): string[] {
  const saetze: string[] = [];
  for (const c of conditions) {
    if (c.fact === ACTOR_FACT && c.op === "eq") {
      saetze.push(c.value === "bot" ? t("regeln.bedingung.bot") : t("regeln.bedingung.besitzer"));
    } else if (c.fact === "credential" && c.op === "in" && Array.isArray(c.value)) {
      saetze.push(
        t("regeln.bedingung.nachweis", { nachweise: c.value.map(nachweisName).join(", ") }),
      );
    } else if (c.fact === "credential" && c.op === "eq") {
      saetze.push(t("regeln.bedingung.nachweis", { nachweise: nachweisName(c.value) }));
    } else if (c.fact === "credential" && c.op === "ne") {
      saetze.push(t("regeln.bedingung.nicht_nachweis", { nachweis: nachweisName(c.value) }));
    } else if (c.fact === "botOfConversation") {
      saetze.push(t("regeln.bedingung.bot_der_unterhaltung"));
    } else {
      saetze.push(t("regeln.bedingung.weitere"));
    }
  }
  return [...new Set(saetze)];
}

function stufen(rule: RuleDefinition): RegelZeile["stufen"] {
  if (rule.effect === "deny") return [{ text: t("regeln.stufe.lehnt_ab"), an: "nie" }];
  return [
    { text: t("regeln.stufe.ask"), ...(rule.effect === "ask" ? { an: "frage" as const } : {}) },
    {
      text: t("regeln.stufe.prepare"),
      ...(rule.effect === "allow" && rule.stage === "prepare" ? { an: "ja" as const } : {}),
    },
    {
      text: t("regeln.stufe.execute"),
      ...(rule.effect === "allow" && rule.stage === "execute" ? { an: "ja" as const } : {}),
    },
  ];
}

/** Die geltenden Regeln, in der Reihenfolge, in der das Tor sie prüft. */
export function regelEintraege(regeln: readonly RuleDefinition[]): RegelZeile[] {
  return [...regeln]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .map((r) => {
      const fuer = r.action === "*" ? t("regeln.alle_aktionen") : `„${aktionName(r.action)}“`;
      const teile = [
        r.reason,
        t("regeln.gilt", { aktionen: fuer, fassung: r.version }),
        ...bedingungen(r.conditions),
      ];
      return {
        nr: r.id,
        titel: regelName(r.id, r.title),
        wirkung: t(`regeln.wirkung.${r.effect}`),
        erklaerung: teile.join(" · "),
        stufen: stufen(r),
      };
    });
}

/**
 * Grenzen, die nur Werkzeug-Aufrufe betreffen. Werkzeuge gibt es in dieser Fassung noch nicht;
 * die Seite zeigt sie deshalb nicht, wie die reinen Werkzeug-Vorbedingungen.
 */
export const NUR_WERKZEUG_GRENZEN: readonly string[] = ["G-17", "G-06", "G-07", "G-08", "G-40"];

/**
 * Nummern der Tor-Fassung 4 (Bot bereit, Entwürfe, Teams): Die Seite zeigt sie nicht, solange man
 * Bots und Teams noch nicht anlegen, pausieren oder ändern kann. Sie kommen mit der Bedienung.
 */
export const NOCH_NICHT_BEDIENBAR: readonly string[] = [
  ...Object.keys(LIMITS_BY_ID_4),
  ...Object.keys(PRECONDITIONS_4),
];

type SichtbareGrenze = Exclude<(typeof LIMIT_IDS)[number], keyof typeof LIMITS_BY_ID_4>;
type SichtbareVorbedingung = Exclude<
  (typeof PRECONDITION_IDS)[number],
  keyof typeof PRECONDITIONS_4
>;

/** Die festen Grenzen (ohne die reinen Werkzeug-Grenzen und die der Teams). */
export function grenzenEintraege(): RegelZeile[] {
  return LIMIT_IDS.filter(
    (id): id is SichtbareGrenze =>
      !NUR_WERKZEUG_GRENZEN.includes(id) && !NOCH_NICHT_BEDIENBAR.includes(id),
  ).map((id) => ({
    nr: id,
    titel: regelName(id, id),
    wirkung: t("regeln.wirkung.grenze"),
    erklaerung: t(`regeln.grenze.${id}`),
  }));
}

/** Vorbedingungen der Aktionen, die es in dieser Fassung gibt (ohne Werkzeug-Freigaben). */
export function vorbedingungenEintraege(): RegelZeile[] {
  return PRECONDITION_IDS.filter(
    (id): id is SichtbareVorbedingung =>
      !NOCH_NICHT_BEDIENBAR.includes(id) &&
      (PRECONDITIONS[id].actions as readonly ActionType[]).some(
        (a) => !a.startsWith("werkzeug.") && !a.startsWith("app."),
      ),
  ).map((id) => ({
    nr: id,
    titel: regelName(id, id),
    wirkung: t("regeln.wirkung.grenze"),
    erklaerung: `${t(`regeln.vorbedingung.${id}`)} · ${t("regeln.gilt_aktionen", {
      aktionen: (PRECONDITIONS[id].actions as readonly string[])
        .map((a) => `„${aktionName(a)}“`)
        .join(", "),
    })}`,
  }));
}
