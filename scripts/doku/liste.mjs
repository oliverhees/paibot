/**
 * PaiBot – liest und prüft docs/screenshots.json und legt die Reihenfolge der Aufnahmen fest.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Ohne Seiteneffekte, damit Tests es direkt prüfen können. Fehler kommen als ListenFehler mit
// verständlichem Text.
import { ANBIETER_FELDER, SCHLEUSE_ZUSTAENDE, SONDERWERTE, ZUSTAENDE } from "./lauf.mjs";

export class ListenFehler extends Error {}

const MODI = new Set(["app", "entwicklung"]);
const ZIEL_ARTEN = ["css", "beschriftung", "rolle", "text"];
const AKTIONEN = [
  "klick",
  "warteAuf",
  "warteAufText",
  "tippe",
  "taste",
  "gehe",
  "ablauf",
  "zeige",
  "anbieter",
];
const ERLAUBTE_ZUSATZFELDER = { tippe: ["text"] };

const fehler = (text) => {
  throw new ListenFehler(text);
};

function istText(wert) {
  return typeof wert === "string" && wert.length > 0;
}

/** Ziel eines Klicks oder einer Eingabe: CSS-Text oder { css | beschriftung | rolle+name | text }. */
function pruefeZiel(wo, ziel, standard) {
  if (istText(ziel)) return { [standard]: ziel, genau: true };
  if (!ziel || typeof ziel !== "object" || Array.isArray(ziel)) {
    fehler(`${wo}: Ziel ist ein Text oder ein Objekt mit einem von ${ZIEL_ARTEN.join(", ")}.`);
  }
  const arten = Object.keys(ziel).filter((k) => ZIEL_ARTEN.includes(k));
  const unbekannt = Object.keys(ziel).filter(
    (k) => !ZIEL_ARTEN.includes(k) && k !== "name" && k !== "genau" && k !== "nr",
  );
  if (arten.length !== 1 || unbekannt.length > 0 || !istText(ziel[arten[0]])) {
    fehler(`${wo}: Ziel braucht genau eines von ${ZIEL_ARTEN.join(", ")} (Text).`);
  }
  if (ziel.name !== undefined && (arten[0] !== "rolle" || !istText(ziel.name))) {
    fehler(`${wo}: „name“ gibt es nur zusammen mit „rolle“.`);
  }
  if (ziel.genau !== undefined && typeof ziel.genau !== "boolean") {
    fehler(`${wo}: „genau“ ist true oder false.`);
  }
  if (ziel.nr !== undefined && (!Number.isInteger(ziel.nr) || ziel.nr < 0)) {
    fehler(`${wo}: „nr“ ist die Stelle unter mehreren Treffern, ab 0.`);
  }
  return { ...ziel, genau: ziel.genau ?? true };
}

function pruefeSonderwert(wo, text) {
  if (text.startsWith("$") && !text.startsWith("$$") && !(text in SONDERWERTE)) {
    fehler(
      `${wo}: Unbekannter Sonderwert „${text}“. Erlaubt: ${Object.keys(SONDERWERTE).join(", ")} ` +
        "(ein wörtliches $ am Anfang als $$).",
    );
  }
}

/** Verhalten des Test-Anbieters für einen Schritt „anbieter“: nur bekannte Felder mit Text bzw. Zahl. */
function pruefeAnbieter(wo, wert) {
  if (!wert || typeof wert !== "object" || Array.isArray(wert) || Object.keys(wert).length === 0) {
    fehler(`${wo}: „anbieter“ ist ein Objekt, z. B. { "reply": "…", "chunkDelayMs": 200 }.`);
  }
  for (const [feld, v] of Object.entries(wert)) {
    const art = ANBIETER_FELDER[feld];
    if (art === undefined) {
      fehler(
        `${wo}: „anbieter“ kennt „${feld}“ nicht (erlaubt: ${Object.keys(ANBIETER_FELDER).join(", ")}).`,
      );
    }
    if (art === "text" && typeof v !== "string") fehler(`${wo}: „anbieter.${feld}“ ist ein Text.`);
    if (art === "zahl" && (!Number.isInteger(v) || v < 0 || v > 600_000)) {
      fehler(`${wo}: „anbieter.${feld}“ ist eine ganze Zahl von 0 bis 600000.`);
    }
    if (
      art === "modelle" &&
      (!Array.isArray(v) ||
        v.length === 0 ||
        !v.every((m) => m && istText(m.id) && istText(m.name)))
    ) {
      fehler(`${wo}: „anbieter.${feld}“ ist eine Liste von Modellen mit „id“ und „name“.`);
    }
  }
  return { ...wert };
}

/** Prüft einen Schritt und bringt ihn in eine einheitliche Form. */
export function pruefeSchritt(wo, schritt) {
  if (!schritt || typeof schritt !== "object" || Array.isArray(schritt)) {
    fehler(`${wo}: Ein Schritt ist ein Objekt, z. B. { "klick": "<CSS-Selector>" }.`);
  }
  const aktionen = Object.keys(schritt).filter((k) => AKTIONEN.includes(k));
  if (aktionen.length !== 1) {
    fehler(`${wo}: Ein Schritt hat genau eine Aktion aus ${AKTIONEN.join(", ")}.`);
  }
  const aktion = aktionen[0];
  const erlaubt = new Set([aktion, ...(ERLAUBTE_ZUSATZFELDER[aktion] ?? [])]);
  const fremd = Object.keys(schritt).filter((k) => !erlaubt.has(k));
  if (fremd.length > 0)
    fehler(`${wo}: Unbekannte Felder im Schritt „${aktion}“: ${fremd.join(", ")}.`);
  const wert = schritt[aktion];
  switch (aktion) {
    case "klick":
      return { klick: pruefeZiel(wo, wert, "css") };
    case "tippe": {
      if (typeof schritt.text !== "string") fehler(`${wo}: „tippe“ braucht „text“.`);
      pruefeSonderwert(wo, schritt.text);
      return { tippe: pruefeZiel(wo, wert, "beschriftung"), text: schritt.text };
    }
    case "zeige":
      return { zeige: pruefeZiel(wo, wert, "css") };
    case "anbieter":
      return { anbieter: pruefeAnbieter(wo, wert) };
    case "warteAuf":
    case "warteAufText":
    case "taste":
    case "ablauf":
      if (!istText(wert)) fehler(`${wo}: „${aktion}“ braucht einen Text.`);
      return { [aktion]: wert };
    case "gehe":
      if (!istText(wert) || !wert.startsWith("/"))
        fehler(`${wo}: „gehe“ braucht einen Pfad, der mit / beginnt.`);
      return { gehe: wert };
    default:
      return fehler(`${wo}: unbekannte Aktion.`);
  }
}

function pruefeSchritte(wo, schritte) {
  if (schritte === undefined) return [];
  if (!Array.isArray(schritte)) fehler(`${wo}: „vorher“ ist eine Liste von Schritten.`);
  return schritte.map((s, i) => pruefeSchritt(`${wo}, Schritt ${i + 1}`, s));
}

/** Setzt benannte Abläufe (`{ "ablauf": "<name>" }`) ein, auch geschachtelt, ohne Kreise. */
export function setzeAblaeufeEin(wo, schritte, ablaeufe, pfad = []) {
  const aus = [];
  for (const schritt of schritte) {
    if (schritt.ablauf === undefined) {
      aus.push(schritt);
      continue;
    }
    const name = schritt.ablauf;
    if (!(name in ablaeufe)) fehler(`${wo}: Den Ablauf „${name}“ gibt es nicht in „ablaeufe“.`);
    if (pfad.includes(name)) fehler(`${wo}: Der Ablauf „${name}“ ruft sich selbst auf.`);
    aus.push(...setzeAblaeufeEin(wo, ablaeufe[name], ablaeufe, [...pfad, name]));
  }
  return aus;
}

/** Prüft die ganze Liste; liefert die Aufnahmen mit Standardwerten und eingesetzten Abläufen. */
export function pruefeListe(roh) {
  if (
    !roh ||
    typeof roh !== "object" ||
    !Array.isArray(roh.aufnahmen) ||
    roh.aufnahmen.length === 0
  ) {
    fehler("Die Liste „aufnahmen“ fehlt oder ist leer.");
  }
  const ablaeufe = {};
  if (roh.ablaeufe !== undefined) {
    if (typeof roh.ablaeufe !== "object" || Array.isArray(roh.ablaeufe)) {
      fehler("„ablaeufe“ ist ein Objekt aus Name und Liste von Schritten.");
    }
    for (const [name, schritte] of Object.entries(roh.ablaeufe)) {
      ablaeufe[name] = pruefeSchritte(`Ablauf „${name}“`, schritte);
    }
  }
  const namen = new Set();
  let mitDanach = 0;
  const aufnahmen = roh.aufnahmen.map((eintrag, index) => {
    const wo = `Aufnahme ${index + 1}`;
    if (!eintrag || typeof eintrag !== "object") fehler(`${wo}: kein Objekt.`);
    if (typeof eintrag.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(eintrag.name)) {
      fehler(
        `${wo}: „name“ fehlt oder ist ungültig (erlaubt: Kleinbuchstaben, Ziffern, Bindestrich).`,
      );
    }
    if (namen.has(eintrag.name)) fehler(`${wo}: Name „${eintrag.name}“ kommt doppelt vor.`);
    namen.add(eintrag.name);
    const benannt = `${wo} („${eintrag.name}“)`;
    if (typeof eintrag.pfad !== "string" || !eintrag.pfad.startsWith("/")) {
      fehler(`${benannt}: „pfad“ muss mit / beginnen.`);
    }
    if (eintrag.thema !== undefined && eintrag.thema !== "dunkel" && eintrag.thema !== "hell") {
      fehler(`${benannt}: „thema“ ist „dunkel“ oder „hell“.`);
    }
    if (eintrag.modus !== undefined && !MODI.has(eintrag.modus)) {
      fehler(`${benannt}: „modus“ ist „app“ oder „entwicklung“.`);
    }
    for (const feld of ["breite", "hoehe"]) {
      const v = eintrag[feld];
      if (v !== undefined && (!Number.isInteger(v) || v < 200 || v > 4000)) {
        fehler(`${benannt}: „${feld}“ ist eine ganze Zahl von 200 bis 4000.`);
      }
    }
    if (
      eintrag.skalierung !== undefined &&
      (typeof eintrag.skalierung !== "number" || eintrag.skalierung < 1 || eintrag.skalierung > 3)
    ) {
      fehler(`${benannt}: „skalierung“ ist eine Zahl von 1 bis 3.`);
    }
    if (eintrag.zustand !== undefined && !ZUSTAENDE.includes(eintrag.zustand)) {
      fehler(`${benannt}: „zustand“ ist eines von ${ZUSTAENDE.map((z) => `„${z}“`).join(", ")}.`);
    }
    if (eintrag.anmeldung !== undefined && typeof eintrag.anmeldung !== "boolean") {
      fehler(`${benannt}: „anmeldung“ ist true oder false.`);
    }
    if (
      eintrag.anmeldung === true &&
      (eintrag.zustand === undefined || eintrag.zustand === "frisch")
    ) {
      fehler(
        `${benannt}: Mit „anmeldung“ braucht es „zustand“ „eingerichtet“ oder „mit-beispieldaten“.`,
      );
    }
    if (eintrag.modus === "entwicklung" && (eintrag.zustand !== undefined || eintrag.anmeldung)) {
      fehler(
        `${benannt}: Entwicklungs-Seiten laufen ohne Datenbank, „zustand“ und „anmeldung“ gibt es dort nicht.`,
      );
    }
    if (eintrag.danach !== undefined) {
      if (eintrag.danach !== "eingerichtet" || eintrag.zustand !== "frisch") {
        fehler(
          `${benannt}: „danach“: „eingerichtet“ gibt es nur bei „zustand“: „frisch“ (die Schritte schließen die Einrichtung ab).`,
        );
      }
      mitDanach += 1;
    }
    if (
      eintrag.status !== undefined &&
      (!Number.isInteger(eintrag.status) || eintrag.status < 200 || eintrag.status > 599)
    ) {
      fehler(`${benannt}: „status“ ist ein HTTP-Status (z. B. 404).`);
    }
    if (eintrag.datenschleuse !== undefined) {
      if (!SCHLEUSE_ZUSTAENDE.includes(eintrag.datenschleuse)) {
        fehler(
          `${benannt}: „datenschleuse“ ist eines von ${SCHLEUSE_ZUSTAENDE.map((z) => `„${z}“`).join(", ")}.`,
        );
      }
      if (eintrag.zustand === undefined || eintrag.modus === "entwicklung") {
        fehler(
          `${benannt}: „datenschleuse“ gibt es nur zusammen mit „zustand“ (App aus pnpm doku:app).`,
        );
      }
    }
    if (eintrag.zeigeFertig !== undefined && typeof eintrag.zeigeFertig !== "boolean") {
      fehler(`${benannt}: „zeigeFertig“ ist wahr oder falsch.`);
    }
    if (eintrag.verdecke !== undefined) {
      if (
        !Array.isArray(eintrag.verdecke) ||
        eintrag.verdecke.length === 0 ||
        !eintrag.verdecke.every(istText)
      ) {
        fehler(`${benannt}: „verdecke“ ist eine Liste von CSS-Selectoren.`);
      }
    }
    const vorher = setzeAblaeufeEin(benannt, pruefeSchritte(benannt, eintrag.vorher), ablaeufe);
    return {
      breite: 1280,
      hoehe: 800,
      skalierung: 2,
      modus: "app",
      thema: "dunkel",
      anmeldung: false,
      status: 200,
      ...(eintrag.zustand !== undefined ? { datenschleuse: "aus" } : {}),
      verdecke: [],
      ...eintrag,
      vorher,
    };
  });
  if (mitDanach > 1)
    fehler(
      "Nur eine Aufnahme darf „danach“ haben (die Einrichtung lässt sich nur einmal abschließen).",
    );
  return aufnahmen;
}

/**
 * Reihenfolge: Entwicklungs-Seiten, dann App-Seiten ohne Zustand, dann je Zustand in der Folge
 * frisch → eingerichtet → mit-beispieldaten. Innerhalb eines Zustands bleibt die Reihenfolge der
 * Liste; eine Aufnahme mit „danach“ kommt an das Ende ihres Zustands. So wird jeder Zustand nur
 * einmal hergestellt.
 */
export function ordneAufnahmen(aufnahmen) {
  const rang = (a) => {
    if (a.modus === "entwicklung") return 0;
    if (a.zustand === undefined) return 1;
    return 2 + ZUSTAENDE.indexOf(a.zustand) * 2 + (a.danach ? 1 : 0);
  };
  return aufnahmen
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rang(x.a) - rang(y.a) || x.i - y.i)
    .map(({ a }) => a);
}
