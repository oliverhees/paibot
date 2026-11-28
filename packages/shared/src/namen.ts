/**
 * PaiBot – Namen von Bots vergleichen und prüfen: gleiche Schreibweise heißt gleicher Bot,
 * ähnliche Zeichen heißen nie gleich, und ein Name, der mit „Team “ beginnt, gehört einem Team
 * und nicht einem Bot. Reine Funktionen, ohne Datenbank; der Raum und die Verwaltung nutzen
 * dieselben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { PaiBotError } from "./errors";
import { t } from "./i18n";

const UNSICHTBAR = /[\p{Cf}\p{Cc}]/gu;
const LEERRAUM = /\s+/gu;

/**
 * Vergleichsform eines Namens: Unicode-Normalform NFKC, Kleinschreibung, unsichtbare Steuer- und
 * Formatzeichen (z. B. Nullbreite-Zeichen) entfernt, Leerraum zu einem Leerzeichen zusammengefasst.
 * Zeichen aus anderen Schriften bleiben, was sie sind: ein kyrillisches „а“ ist kein lateinisches „a“.
 */
export function vergleichsName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(UNSICHTBAR, (zeichen) => (/\s/u.test(zeichen) ? " " : ""))
    .replace(LEERRAUM, " ")
    .trim()
    .toLowerCase();
}

/**
 * Teilmenge häufiger kyrillischer und griechischer Buchstaben, die lateinischen zum Verwechseln
 * ähnlich sehen (kleingeschrieben, nach `vergleichsName`). Bewusst klein: sie erkennt die
 * naheliegenden Fälle, nicht jede denkbare Verwechslung.
 */
const AEHNLICH: Readonly<Record<string, string>> = {
  а: "a",
  в: "b",
  с: "c",
  ԁ: "d",
  е: "e",
  һ: "h",
  і: "i",
  ј: "j",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  ԛ: "q",
  ѕ: "s",
  т: "t",
  у: "y",
  х: "x",
  α: "a",
  β: "b",
  γ: "y",
  ε: "e",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
  "1": "l",
  "0": "o",
};

/** Grobe Form für „sieht gleich aus“: wie `vergleichsName`, dazu ähnliche Zeichen vereinheitlicht. */
export function aehnlichkeitsForm(name: string): string {
  let form = "";
  for (const zeichen of vergleichsName(name)) form += AEHNLICH[zeichen] ?? zeichen;
  return form;
}

/** Namen, die im selben Raum nicht auseinanderzuhalten wären. */
export interface NamensKonflikt {
  readonly art: "gleich" | "aehnlich";
  readonly botIds: readonly string[];
}

/**
 * Sucht Bots, deren Namen sich nur in Groß-/Kleinschreibung, Unicode-Form oder unsichtbaren
 * Zeichen („gleich“) oder in ähnlich aussehenden Zeichen („aehnlich“) unterscheiden.
 */
export function namensKonflikte(
  bots: readonly { readonly id: string; readonly name: string }[],
): NamensKonflikt[] {
  const gleich = new Map<string, string[]>();
  const aehnlich = new Map<string, string[]>();
  for (const bot of bots) {
    const a = vergleichsName(bot.name);
    gleich.set(a, [...(gleich.get(a) ?? []), bot.id]);
    const b = aehnlichkeitsForm(bot.name);
    aehnlich.set(b, [...(aehnlich.get(b) ?? []), bot.id]);
  }
  const ergebnis: NamensKonflikt[] = [];
  for (const ids of gleich.values())
    if (ids.length > 1) ergebnis.push({ art: "gleich", botIds: ids });
  for (const ids of aehnlich.values()) {
    if (ids.length < 2) continue;
    const schonGleich = ergebnis.some(
      (k) => k.botIds.length === ids.length && k.botIds.every((id) => ids.includes(id)),
    );
    if (!schonGleich) ergebnis.push({ art: "aehnlich", botIds: ids });
  }
  return ergebnis;
}

/**
 * Ein Bot-Name, der mit „Team “ beginnt, würde wie die Anrede eines ganzen Teams aussehen; diese
 * Namen sind für Teams reserviert. Geprüft wird auf der Vergleichsform, damit auch „ＴＥＡＭ　…“
 * oder „team …“ erkannt wird.
 */
export function istTeamName(name: string): boolean {
  return /^team\s/u.test(vergleichsName(name));
}

/**
 * Welcher Name für einen **neuen** Bot nicht geht: `reserviert`, wenn er mit „Team “ beginnt;
 * `gleich` oder `aehnlich`, wenn ein bestehender Bot mit diesem Namen nicht auseinanderzuhalten
 * wäre; `undefined`, wenn der Name geht. Der neue Bot bringt noch keine Kennung mit, darum nimmt
 * die Prüfung nur seinen Namen.
 */
export function neuerNameUnzulaessig(
  name: string,
  vorhandene: readonly { readonly id: string; readonly name: string }[],
): "reserviert" | "gleich" | "aehnlich" | undefined {
  if (istTeamName(name)) return "reserviert";
  const NEU = "\u0000neu";
  const konflikt = namensKonflikte([...vorhandene, { id: NEU, name }]).find((k) =>
    k.botIds.includes(NEU),
  );
  return konflikt?.art;
}

/**
 * Der Fehler zu einem Namens-Grund, in einer Fassung für die Oberfläche: Feld `name`, Text und
 * Ausweg aus der zentralen Textdatei. Eine Quelle für beide Wege – die Prüfung vor dem Tor in der
 * Web-App und die Prüfung unter der Sperre in der Datenbank.
 */
export function namensFehler(grund: "reserviert" | "gleich" | "aehnlich"): PaiBotError {
  const schluessel =
    grund === "reserviert" ? "teams.fehler.name_reserviert" : "teams.fehler.name_belegt";
  return new PaiBotError("eingabe_ungueltig", {
    felder: [{ feld: "name", code: "ungueltig" }],
    text: t(schluessel),
    ausweg: t(`${schluessel}.ausweg`),
  });
}

/**
 * Welcher Name für einen bestehenden Bot nicht geht. Wie `neuerNameUnzulaessig`, nur dass der Bot
 * selbst nicht mit sich in Konflikt gerät: Wer seinen Namen behält oder nur die Schreibweise
 * ändert, darf speichern.
 */
export function namensaenderungUnzulaessig(
  id: string,
  name: string,
  vorhandene: readonly { readonly id: string; readonly name: string }[],
): "reserviert" | "gleich" | "aehnlich" | undefined {
  return neuerNameUnzulaessig(
    name,
    vorhandene.filter((bot) => bot.id !== id),
  );
}
