/**
 * PaiBot – Namen im Raum vergleichen
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Namen vergleichen: gleiche Schreibweise heißt gleicher Bot, ähnliche Zeichen heißen nie gleich. */

/** Ein Bot, wie der Raum ihn sieht. */
export interface RaumBot {
  readonly id: string;
  readonly name: string;
  readonly pausiert: boolean;
}

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
export function namensKonflikte(bots: readonly Pick<RaumBot, "id" | "name">[]): NamensKonflikt[] {
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
