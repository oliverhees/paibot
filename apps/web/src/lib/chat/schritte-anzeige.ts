/**
 * PaiBot – Schritte im Chat, aus Daten der Ansicht werden die Angaben der Bausteine: Werkzeug-Zeile
 * (Titel von PaiBot, Zustand in Worten, Fundstellen, Regel, Beleg) und die Herkunft je Schritt unter
 * der Antwort. Reine Funktionen; fremder Text bleibt Text und wird erst im Baustein bereinigt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { ServedBy } from "@paibot/shared/grundtypen";
import { errorText, isTextKey, t } from "@paibot/shared/texte";
import type { HerkunftSchritt, WerkzeugZeileProps } from "@paibot/ui";
import type { UnterAnbieterListe } from "../modelle/herkunft";
import { euMarke, kennzeichnungKurz } from "../modelle/vorgabe";
import type { AnsichtSchritt, AnsichtWerkzeug } from "./ansicht";
import { ohneVorgabe } from "./ansicht";
import { belegKennung } from "./anzeige";
import type { BelegKurz, ModellInfo } from "./typen";
import { WERKZEUG_DOKU } from "./werkzeug-anzeige";

/** Angaben für eine Werkzeug-Zeile ohne Bedienung (Aufklappen, Beleg öffnen). */
export type WerkzeugZeileAngaben = Omit<WerkzeugZeileProps, "offen" | "onUmschalten" | "beleg"> & {
  /** Beleg des Aufrufs, wenn er in der Liste der Belege vollständig da ist. */
  beleg?: { id: string; kennung: string };
};

/**
 * Die Zeile zu einem Aufruf. Der Titel kommt von PaiBot (feste Liste je Kennung); ein unbekanntes
 * Werkzeug heißt „Werkzeug“ und sein Name steht als Zitat. Der Zustand in Worten kommt allein aus
 * `status`, der Grund aus dem Fehlercode.
 */
export function werkzeugZeileAngaben(
  w: AnsichtWerkzeug,
  belege: readonly BelegKurz[],
): WerkzeugZeileAngaben {
  const bekannt = w.key === WERKZEUG_DOKU;
  const fundstellen = w.quellen?.length ?? 0;
  const zusatz =
    w.status !== "fertig"
      ? undefined
      : w.nichtsGefunden === true
        ? t("schritte.werkzeug.zusatz.nichts")
        : fundstellen === 0
          ? undefined
          : fundstellen === 1
            ? t("schritte.werkzeug.zusatz.abschnitt")
            : t("schritte.werkzeug.zusatz.abschnitte", { n: fundstellen });
  const entscheidung =
    w.entscheidungBelegId === undefined
      ? undefined
      : belege.find((b) => b.id === w.entscheidungBelegId);
  const regelId = entscheidung?.entscheidung?.regeln
    .map((r) => r.id)
    .find((id) => isTextKey(`regel.${id}`));
  const beleg = w.belegId === undefined ? undefined : belege.find((b) => b.id === w.belegId);
  return {
    titel: bekannt
      ? t("schritte.werkzeug.titel.doku_nachschlagen")
      : t("schritte.werkzeug.titel.unbekannt"),
    ...(bekannt ? { symbol: "suche" as const } : {}),
    ...(bekannt ? {} : { nameVomModell: w.nameVomModell ?? w.name }),
    ...(w.eingabeKurz === undefined ? {} : { eingabeKurz: w.eingabeKurz }),
    status: w.status,
    ...((w.status === "abgelehnt" || w.status === "fehlgeschlagen") && w.code !== undefined
      ? { statusText: errorText(w.code) }
      : {}),
    ...(zusatz === undefined ? {} : { zusatz }),
    ...(fundstellen === 0 || w.quellen === undefined
      ? {}
      : { quellen: w.quellen.map((q) => ({ seite: q.seite, abschnitt: q.titel })) }),
    ...(regelId === undefined
      ? {}
      : { regel: { id: regelId, titel: t(`regel.${regelId}` as "regel.R-001") } }),
    ...(beleg?.seq === undefined
      ? {}
      : { beleg: { id: beleg.id, kennung: belegKennung(beleg.seq) } }),
  };
}

/** Name des Unter-Anbieters aus der Liste, sonst die Kennung aus der Antwort. */
function unterAnbieterName(
  servedBy: ServedBy | undefined,
  liste: UnterAnbieterListe | undefined,
): string | undefined {
  const slug = servedBy?.provider;
  return slug === undefined ? undefined : (liste?.eintraege[slug]?.name ?? slug);
}

function schrittHerkunft(
  modell: ModellInfo,
  servedBy: ServedBy | undefined,
  gemeldet: string | undefined,
  liste: UnterAnbieterListe | undefined,
): HerkunftSchritt {
  const satz = kennzeichnungKurz(modell.vorgabe);
  const marke = euMarke(modell.vorgabe);
  const unter = unterAnbieterName(servedBy, liste);
  const gemeldetes = gemeldet ?? servedBy?.model;
  return {
    modell: {
      name: modell.name,
      ...(modell.anbieter?.templateKey === "eurouter" ? { nameFrei: true } : {}),
      ...(satz === undefined || marke === undefined ? {} : { kennzeichnung: { marke, satz } }),
    },
    ...(unter === undefined ? {} : { unterAnbieter: unter }),
    ...(gemeldetes === undefined ? {} : { gemeldet: gemeldetes }),
  };
}

/**
 * Modell und Unter-Anbieter aller Schritte einer Antwort, der Reihe nach, die Antwort zuletzt.
 * Die Herkunft steht nur je Schritt; ein Schritt ohne eigene Modell-Angabe bekommt den Namen des
 * Modells des Bots ohne Vorgabe (nie eine Kennzeichnung, die nicht belegt ist).
 */
export function herkunftKette(
  schritte: readonly AnsichtSchritt[],
  antwort: { modell: ModellInfo; servedBy?: ServedBy },
  botModell: ModellInfo | undefined,
  liste: UnterAnbieterListe | undefined,
): HerkunftSchritt[] {
  const davor = [...schritte]
    .filter((x) => x.ende !== "antwort")
    .sort((a, b) => a.step - b.step)
    .map((x) =>
      schrittHerkunft(
        x.modell ??
          (botModell === undefined ? ohneVorgabe(antwort.modell) : ohneVorgabe(botModell)),
        x.servedBy,
        x.modelReported,
        liste,
      ),
    );
  return [...davor, schrittHerkunft(antwort.modell, antwort.servedBy, undefined, liste)];
}

/** Zahl der Werkzeug-Aufrufe in diesen Schritten. */
export function zahlWerkzeuge(schritte: readonly AnsichtSchritt[]): number {
  return schritte.reduce((n, x) => n + x.werkzeuge.length, 0);
}
