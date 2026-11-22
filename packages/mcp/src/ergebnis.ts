/**
 * PaiBot – Ergebnis eines fremden Werkzeugs in Text verwandeln: Form zuerst ohne Rekursion prüfen,
 * dann nur Text-Teile übernehmen, bereinigen und kürzen. Bilder, Ton und Verweise werden durch
 * feste Sätze ersetzt. Ein Fehler des Werkzeugs (`isError`) wird nie mit dem Text des Servers
 * weitergegeben, sondern als fester Satz.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { kanonischeForm } from "./abdruck";
import { bereinigeText } from "./bereinigen";
import { MCP_FEHLERTEXTE, type McpFehlerCode } from "./fehler";
import { type McpGrenzen, mitStandardGrenzen } from "./grenzen";
import { pruefeStruktur } from "./struktur";

export interface McpErgebnis {
  /** `fehler` bei `isError`, unlesbarer oder zu großer Antwort. */
  status: "ok" | "fehler";
  /** Text für das Modell: bereinigt, gekürzt, in fester Form; bei `fehler` ein fester Satz. */
  text: string;
  /** Der Text wurde auf die Höchstlänge gekürzt. */
  gekuerzt: boolean;
  /**
   * Irgendein Text des fremden Servers steckt in `text` (auch gekürzt). Dann zählt der Aufruf als
   * fremder Inhalt; bei festen Sätzen ist es `false`.
   */
  enthaeltFremdenText: boolean;
  /** Zahl der Teile, die nicht als Text übernommen wurden (Bild, Ton, Verweis, Ressource …). */
  ausgelasseneTeile: number;
  fehlercode: McpFehlerCode | null;
}

/** Satz für ein Ergebnis, das zu groß oder nicht lesbar ist. */
const AUSGELASSEN: Readonly<Record<string, string>> = Object.freeze({
  image: "Bild",
  audio: "Ton",
  resource: "eingebettete Ressource",
  resource_link: "Verweis",
});

const MAX_TEILE = 200;
const KUERZUNG = "\n[… gekürzt]";

function fest(fehlercode: McpFehlerCode): McpErgebnis {
  return {
    status: "fehler",
    text: MCP_FEHLERTEXTE[fehlercode],
    gekuerzt: false,
    enthaeltFremdenText: false,
    ausgelasseneTeile: 0,
    fehlercode,
  };
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

/**
 * Macht aus dem Rückgabewert von `callTool` den Text für das Modell. Wirft nie. Reihenfolge:
 * (1) Form, Tiefe, Größe, Kreise ohne Rekursion prüfen, (2) `isError` → fester Satz, (3) Text-Teile
 * bereinigen und zusammenfügen, andere Teile durch feste Sätze ersetzen, (4) auf die Höchstlänge kürzen.
 */
export function ergebnisZuText(
  ergebnis: unknown,
  eigeneGrenzen?: Partial<McpGrenzen>,
): McpErgebnis {
  const grenzen = mitStandardGrenzen(eigeneGrenzen);
  const struktur = pruefeStruktur(ergebnis, {
    maxTiefe: grenzen.maxRohTiefe,
    maxKnoten: grenzen.maxKnoten,
    maxZeichen: grenzen.maxAntwortBytes,
  });
  if (!struktur.ok) {
    return fest(
      struktur.problem === "typ_unzulaessig" || struktur.problem === "kreis"
        ? "app_antwort_ungueltig"
        : "werkzeug_ergebnis_zu_gross",
    );
  }
  if (!istObjekt(ergebnis)) return fest("app_antwort_ungueltig");
  if (ergebnis.isError === true) return fest("werkzeug_fehler");

  const teile: string[] = [];
  let ausgelassen = 0;
  let verbraucht = 0;
  let gekuerzt = false;
  let fremderText = false;
  // Platz für den Kürzungs-Hinweis und die Zeile über ausgelassene Teile bleibt frei.
  const platz = Math.max(1, grenzen.maxErgebnisZeichen - 160);

  const haengeAn = (roh: string): void => {
    if (verbraucht >= platz) {
      gekuerzt = true;
      return;
    }
    const sauber = bereinigeText(roh, {
      maxZeichen: platz - verbraucht,
      zeilenumbrueche: true,
    });
    if (sauber.gekuerzt) gekuerzt = true;
    if (sauber.text.length === 0) return;
    fremderText = true;
    teile.push(sauber.text);
    verbraucht += sauber.text.length + 1;
  };

  const inhalt = ergebnis.content;
  if (Array.isArray(inhalt)) {
    if (inhalt.length > MAX_TEILE) gekuerzt = true;
    for (const teil of inhalt.slice(0, MAX_TEILE)) {
      if (istObjekt(teil) && teil.type === "text" && typeof teil.text === "string") {
        haengeAn(teil.text);
      } else {
        ausgelassen += 1;
      }
    }
  }
  if (teile.length === 0 && ergebnis.structuredContent !== undefined) {
    // Nur, wenn kein Text da ist; die Form wurde oben schon geprüft, die Umwandlung ist beschränkt.
    haengeAn(kanonischeForm(ergebnis.structuredContent));
  } else if (teile.length === 0 && ergebnis.toolResult !== undefined) {
    haengeAn(kanonischeForm(ergebnis.toolResult));
  }

  if (ausgelassen > 0) {
    const arten = new Set<string>();
    if (Array.isArray(inhalt)) {
      for (const teil of inhalt.slice(0, MAX_TEILE)) {
        if (istObjekt(teil) && teil.type !== "text") {
          const art = typeof teil.type === "string" ? AUSGELASSEN[teil.type] : undefined;
          arten.add(art ?? "anderer Inhalt");
        }
      }
    }
    teile.push(`[Nicht als Text übernommen: ${[...arten].sort().join(", ")}]`);
  }
  let text = teile.join("\n");
  if (gekuerzt) text = `${text}${KUERZUNG}`;
  return {
    status: "ok",
    text,
    gekuerzt,
    enthaeltFremdenText: fremderText,
    ausgelasseneTeile: ausgelassen,
    fehlercode: null,
  };
}
