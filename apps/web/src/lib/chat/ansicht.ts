/**
 * PaiBot – Zustands-Kern der Chat-Ansicht als reine Funktionen: aus dem geladenen Verlauf und der
 * Folge der Ereignisse wird, was die Oberfläche zeigt. Doppelte und alte Ereignisse ändern nichts.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ConversationEvent } from "@paibot/shared/ereignisse";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { ServedBy } from "@paibot/shared/grundtypen";
import type { Message, Route, Run } from "@paibot/shared/objekte";
import type { BelegKurz, ChatVerlauf, ModellInfo } from "./typen";

export type NachrichtZustand = "fertig" | "streamt" | "abgebrochen" | "fehler";

export interface AnsichtNachricht {
  art: "nachricht";
  id: string;
  rolle: "du" | "bot";
  text: string;
  /** ISO-Zeit. */
  zeit: string;
  zustand: NachrichtZustand;
  runId?: string;
  route?: Route;
  modell?: ModellInfo;
  /** Wer laut Antwort der Schnittstelle geantwortet hat (nur, wenn sie einen Anbieter nennt). */
  servedBy?: ServedBy;
  fehlerCode?: ErrorCode;
  /** Satz zum Fehler aus dem Ereignis (sonst gilt der Text zum Code). */
  fehlerText?: string;
}

/** Ein Lauf endete ohne Antwort (abgelehnt, fehlgeschlagen oder vor dem ersten Wort abgebrochen). */
export interface AnsichtLaufEnde {
  art: "lauf-ende";
  runId: string;
  ergebnis: "abgebrochen" | "fehlgeschlagen" | "abgelehnt";
  code: ErrorCode;
  text?: string;
  /** Grund, wenn die Datenschleuse die Anfrage gestoppt hat. */
  schleuseGrund?: string;
  zeit: string;
}

export type AnsichtEintrag = AnsichtNachricht | AnsichtLaufEnde;

export interface AktiverLauf {
  id: string;
  /** wartet: in der Schlange; schreibt: der Bot arbeitet. */
  phase: "wartet" | "schreibt";
  /** Stopp wurde angefragt. */
  abbruch: boolean;
}

export interface ChatAnsicht {
  /** Höchste verarbeitete Nummer im Ereignis-Strom. */
  letzteSeq: number;
  eintraege: AnsichtEintrag[];
  lauf?: AktiverLauf;
  /** Läufe, die schon beendet sind (eine späte Antwort der Route belebt sie nicht wieder). */
  beendet: string[];
  /** Belege dieser Unterhaltung, neueste zuerst. */
  belege: BelegKurz[];
  /** Die Datenschleuse hat im letzten Lauf gestoppt (Zustand „nicht bereit“). */
  schleuseBlockiert: boolean;
  /** Zuletzt fertig gewordene Antwort (für die Ansage im Live-Bereich). */
  fertigeAntwort?: string;
}

/** Was die Ereignisse selbst nicht enthalten: Herkunft des aktuellen Modells. */
export interface AnsichtKontext {
  modell?: ModellInfo;
}

const NACHRICHT_ZUSTAND: Record<Message["status"], NachrichtZustand> = {
  complete: "fertig",
  streaming: "streamt",
  cancelled: "abgebrochen",
  failed: "fehler",
};

const LAUF_ENDE: Partial<Record<Run["status"], AnsichtLaufEnde["ergebnis"]>> = {
  cancelled: "abgebrochen",
  failed: "fehlgeschlagen",
  denied: "abgelehnt",
};

/** Das Modell ohne die gelesenen Vorgaben seiner Regel (und damit ohne Kennzeichnung). */
export function ohneVorgabe(modell: ModellInfo): ModellInfo {
  const { vorgabe: _weg, ...rest } = modell;
  return rest;
}

/**
 * Das Modell einer Antwort mit der Vorgabe seiner Regel, aber nur, wenn die Vorgabe nachweislich
 * schon zur Zeit der Antwort galt: Ihre Prüfung liegt vor dem Zeitpunkt der Antwort. Sonst bleibt
 * nur der Name (fail-closed, keine Kennzeichnung): Die gespeicherte Vorgabe ist die von heute und
 * sagt nichts darüber, was die Regel zur Zeit der Antwort vorgab.
 */
export function modellZurAntwort(modell: ModellInfo, antwortZeit: string): ModellInfo {
  const v = modell.vorgabe;
  if (v === undefined) return modell;
  const geprueft = Date.parse(v.geprueftAm);
  const antwort = Date.parse(antwortZeit);
  return Number.isFinite(geprueft) && Number.isFinite(antwort) && geprueft < antwort
    ? modell
    : ohneVorgabe(modell);
}

/**
 * Das Modell des Bots für den Chat-Kopf. Endete nach der Prüfung der Vorgabe ein Lauf mit „Regel
 * unbekannt“ (der Anbieter kennt die Regel nicht mehr), steht die Vorgabe nicht mehr da: Die Marke
 * verschwindet sofort und nicht erst nach erneutem Prüfen.
 */
export function kopfModell(
  modell: ModellInfo | undefined,
  eintraege: readonly AnsichtEintrag[],
): ModellInfo | undefined {
  const v = modell?.vorgabe;
  if (modell === undefined || v === undefined) return modell;
  const geprueft = Date.parse(v.geprueftAm);
  const widerlegt = eintraege.some(
    (e) =>
      e.art === "lauf-ende" && e.code === "regel_unbekannt" && !(Date.parse(e.zeit) < geprueft),
  );
  return widerlegt ? ohneVorgabe(modell) : modell;
}

/**
 * Nur deine Nachrichten und End-Antworten kommen in die Ansicht. Ein Zwischentext eines Laufs mit
 * Werkzeugen (`step` gesetzt) ist weder Eintrag noch Antwort seines Laufs, auch wenn der Lesestand
 * ihn enthielte.
 */
function ausNachricht(m: Message, modelle: Record<string, ModellInfo>): AnsichtNachricht | null {
  if (m.role === "system" || m.step !== undefined) return null;
  const info = m.modelId === undefined ? undefined : modelle[m.modelId];
  const modell = info === undefined ? undefined : modellZurAntwort(info, m.createdAt);
  return {
    art: "nachricht",
    id: m.id,
    rolle: m.role === "user" ? "du" : "bot",
    text: m.content,
    zeit: m.createdAt,
    zustand: NACHRICHT_ZUSTAND[m.status],
    ...(m.runId === undefined ? {} : { runId: m.runId }),
    ...(m.route === undefined ? {} : { route: m.route }),
    ...(modell === undefined ? {} : { modell }),
    ...(m.servedBy === undefined ? {} : { servedBy: m.servedBy }),
    ...(m.errorCode === undefined ? {} : { fehlerCode: m.errorCode }),
  };
}

/** Leere Ansicht (neue Unterhaltung). */
export function leereAnsicht(): ChatAnsicht {
  return { letzteSeq: 0, eintraege: [], beendet: [], belege: [], schleuseBlockiert: false };
}

function sortiereBelege(belege: BelegKurz[]): BelegKurz[] {
  // Angekündigte (noch ohne Nummer) oben, sonst neueste zuerst.
  return [...belege].sort(
    (a, b) => (b.seq ?? Number.MAX_SAFE_INTEGER) - (a.seq ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Baut die Ansicht aus einem Lesestand: Nachrichten, beendete Läufe ohne Antwort (an ihrer
 * Stelle hinter der auslösenden Nachricht), der aktive Lauf und seine Ereignisse bis jetzt.
 */
export function ansichtAus(verlauf: ChatVerlauf, kontext: AnsichtKontext = {}): ChatAnsicht {
  // Der Text einer noch streamenden Antwort entsteht allein aus ihren Ereignissen; eine
  // abgeschlossene Antwort bringt ihren Text mit, ihre Ereignisse zählen nicht noch einmal.
  const ausStrom = new Set<string>(
    verlauf.ereignisse.flatMap((e) => (e.type === "text.delta" ? [e.data.messageId] : [])),
  );
  const eintraege: AnsichtEintrag[] = [];
  for (const m of verlauf.nachrichten) {
    const e = ausNachricht(m, verlauf.modelle);
    if (e === null) continue;
    eintraege.push(e.zustand === "streamt" && ausStrom.has(e.id) ? { ...e, text: "" } : e);
  }
  const mitAntwort = new Set(
    eintraege.filter((e) => e.art === "nachricht" && e.rolle === "bot").map((e) => e.runId),
  );
  // Älteste zuerst einsortieren, damit mehrere Hinweise hinter einer Nachricht in Reihenfolge stehen.
  const beendet: string[] = [];
  for (const lauf of [...verlauf.laeufe].reverse()) {
    const ergebnis = LAUF_ENDE[lauf.status];
    beendet.push(lauf.id);
    if (ergebnis === undefined || mitAntwort.has(lauf.id)) continue;
    const hinweis: AnsichtLaufEnde = {
      art: "lauf-ende",
      runId: lauf.id,
      ergebnis,
      code: lauf.errorCode ?? (ergebnis === "abgebrochen" ? "unterbrochen" : "intern"),
      zeit: lauf.finishedAt ?? lauf.createdAt,
    };
    const stelle = eintraege.findIndex(
      (e) => e.art === "nachricht" && e.id === lauf.triggerMessageId,
    );
    if (stelle < 0) {
      eintraege.push(hinweis);
      continue;
    }
    // Hinter die Nachricht und alles, was schon zu ihr gehört (Hinweise und Antworten, auch
    // frühere Fassungen einer neu erzeugten Antwort).
    let ziel = stelle + 1;
    while (ziel < eintraege.length) {
      const e = eintraege[ziel];
      if (e?.art === "lauf-ende" || (e?.art === "nachricht" && e.rolle === "bot")) ziel += 1;
      else break;
    }
    eintraege.splice(ziel, 0, hinweis);
  }

  let ansicht: ChatAnsicht = {
    letzteSeq: 0,
    eintraege,
    beendet,
    belege: sortiereBelege(verlauf.belege),
    schleuseBlockiert:
      verlauf.aktiverLauf === undefined && verlauf.laeufe[0]?.errorCode === "schleuse_blockiert",
  };
  const aktiv = verlauf.aktiverLauf;
  if (aktiv !== undefined) {
    ansicht.lauf = {
      id: aktiv.id,
      phase: aktiv.status === "queued" ? "wartet" : "schreibt",
      abbruch: aktiv.cancelRequestedAt !== undefined,
    };
  }
  const erste = verlauf.ereignisse[0]?.seq;
  if (erste !== undefined) ansicht.letzteSeq = erste - 1;
  for (const ereignis of verlauf.ereignisse) ansicht = ereignisAnwenden(ansicht, ereignis, kontext);
  ansicht.letzteSeq = Math.max(ansicht.letzteSeq, verlauf.letzteSeq);
  delete ansicht.fertigeAntwort;
  return ansicht;
}

function ersetze(
  eintraege: AnsichtEintrag[],
  id: string,
  aendern: (n: AnsichtNachricht) => AnsichtNachricht,
): AnsichtEintrag[] {
  return eintraege.map((e) => (e.art === "nachricht" && e.id === id ? aendern(e) : e));
}

function findeNachricht(a: ChatAnsicht, id: string): AnsichtNachricht | undefined {
  return a.eintraege.find((e): e is AnsichtNachricht => e.art === "nachricht" && e.id === id);
}

function streamendeAntwort(a: ChatAnsicht, runId: string): AnsichtNachricht | undefined {
  return a.eintraege.find(
    (e): e is AnsichtNachricht => e.art === "nachricht" && e.rolle === "bot" && e.runId === runId,
  );
}

/** Beendet den Lauf `runId` in der Ansicht. */
function laufBeenden(a: ChatAnsicht, runId: string): ChatAnsicht {
  const beendet = a.beendet.includes(runId) ? a.beendet : [...a.beendet, runId];
  const { lauf, ...rest } = a;
  if (lauf !== undefined && lauf.id !== runId) return { ...rest, lauf, beendet };
  return { ...rest, beendet };
}

/**
 * Wendet ein Ereignis an. Ereignisse mit einer Nummer, die schon verarbeitet ist, ändern nichts;
 * eine schon bekannte Nachricht wird nicht doppelt angelegt.
 */
export function ereignisAnwenden(
  a: ChatAnsicht,
  e: ConversationEvent,
  kontext: AnsichtKontext = {},
): ChatAnsicht {
  if (e.seq <= a.letzteSeq) return a;
  const weiter = { ...a, letzteSeq: e.seq };
  const runId = e.runId;
  switch (e.type) {
    case "message.created": {
      if (e.data.role === "system" || findeNachricht(weiter, e.data.messageId)) return weiter;
      const neu: AnsichtNachricht = {
        art: "nachricht",
        id: e.data.messageId,
        rolle: e.data.role === "user" ? "du" : "bot",
        text: e.data.text,
        zeit: e.time,
        zustand: e.data.role === "user" ? "fertig" : "streamt",
        ...(runId === undefined || e.data.role === "user" ? {} : { runId }),
      };
      const mitNachricht = { ...weiter, eintraege: [...weiter.eintraege, neu] };
      if (neu.rolle === "bot" && runId !== undefined && weiter.lauf?.id === runId) {
        return { ...mitNachricht, lauf: { ...weiter.lauf, phase: "schreibt" } };
      }
      return mitNachricht;
    }
    case "run.queued": {
      if (weiter.beendet.includes(e.data.runId)) return weiter;
      return {
        ...weiter,
        lauf: { id: e.data.runId, phase: "wartet", abbruch: false },
        schleuseBlockiert: false,
      };
    }
    case "run.started": {
      if (weiter.beendet.includes(e.data.runId)) return weiter;
      const abbruch = weiter.lauf?.id === e.data.runId ? weiter.lauf.abbruch : false;
      return { ...weiter, lauf: { id: e.data.runId, phase: "schreibt", abbruch } };
    }
    case "text.delta": {
      const vorhanden = findeNachricht(weiter, e.data.messageId);
      if (vorhanden === undefined) {
        const neu: AnsichtNachricht = {
          art: "nachricht",
          id: e.data.messageId,
          rolle: "bot",
          text: e.data.text,
          zeit: e.time,
          zustand: "streamt",
          runId: e.data.runId,
        };
        return { ...weiter, eintraege: [...weiter.eintraege, neu] };
      }
      // Eine abgeschlossene Nachricht (fertig, abgebrochen, Fehler) trägt schon ihren ganzen Text,
      // z. B. aus einem Lesestand zwischen Speichern der Antwort und Ende des Laufs.
      if (vorhanden.zustand !== "streamt") return weiter;
      return {
        ...weiter,
        eintraege: ersetze(weiter.eintraege, e.data.messageId, (n) => ({
          ...n,
          text: n.text + e.data.text,
        })),
      };
    }
    case "message.completed": {
      const nachricht = findeNachricht(weiter, e.data.messageId);
      // Herkunft vom Modell der Nachricht bzw. des Bots; ohne beides nur der Name, nie ein „EU“.
      // Die Vorgabe der Regel kommt nie vom Bot von heute: Das Ereignis nennt das Modell nicht, nur
      // eine Nachricht mit eigener Modell-Angabe trägt eine Vorgabe mit.
      const modell: ModellInfo = {
        ...(nachricht?.modell ?? (kontext.modell === undefined ? {} : ohneVorgabe(kontext.modell))),
        name: e.data.modelLabel,
      };
      const servedBy = e.data.servedBy;
      const eintraege = ersetze(weiter.eintraege, e.data.messageId, (n) => ({
        ...n,
        zustand: "fertig",
        route: e.data.route,
        modell,
        ...(servedBy === undefined ? {} : { servedBy }),
      }));
      const lauf = runId ?? nachricht?.runId;
      const mit = { ...weiter, eintraege, fertigeAntwort: e.data.messageId };
      return lauf === undefined ? mit : laufBeenden(mit, lauf);
    }
    case "run.cancelled":
    case "run.failed":
    case "run.denied": {
      const antwort = streamendeAntwort(weiter, e.data.runId);
      const ergebnis =
        e.type === "run.cancelled"
          ? "abgebrochen"
          : e.type === "run.failed"
            ? "fehlgeschlagen"
            : "abgelehnt";
      // Ein Grund der Datenschleuse, der vorher kam, gehört zu diesem Ende.
      const grund = weiter.eintraege.find(
        (x): x is AnsichtLaufEnde => x.art === "lauf-ende" && x.runId === e.data.runId,
      )?.schleuseGrund;
      let eintraege = weiter.eintraege.filter(
        (x) => !(x.art === "lauf-ende" && x.runId === e.data.runId),
      );
      if (antwort !== undefined && antwort.text !== "") {
        eintraege = ersetze(eintraege, antwort.id, (n) => ({
          ...n,
          zustand: e.type === "run.cancelled" ? "abgebrochen" : "fehler",
          fehlerCode: e.data.code,
          fehlerText: e.data.text,
        }));
      } else {
        if (antwort !== undefined) eintraege = eintraege.filter((x) => x !== antwort);
        eintraege = [
          ...eintraege,
          {
            art: "lauf-ende",
            runId: e.data.runId,
            ergebnis,
            code: e.data.code,
            text: e.data.text,
            zeit: e.time,
            ...(grund === undefined ? {} : { schleuseGrund: grund }),
          },
        ];
      }
      const blockiert = weiter.schleuseBlockiert || e.data.code === "schleuse_blockiert";
      return laufBeenden({ ...weiter, eintraege, schleuseBlockiert: blockiert }, e.data.runId);
    }
    case "schleuse.blockiert": {
      // Der Grund wird vorgemerkt und erscheint mit dem Ende des Laufs.
      const vorhanden = weiter.eintraege.some(
        (x) => x.art === "lauf-ende" && x.runId === e.data.runId,
      );
      const eintraege: AnsichtEintrag[] = vorhanden
        ? weiter.eintraege.map((x) =>
            x.art === "lauf-ende" && x.runId === e.data.runId
              ? { ...x, schleuseGrund: e.data.reason }
              : x,
          )
        : [
            ...weiter.eintraege,
            {
              art: "lauf-ende",
              runId: e.data.runId,
              ergebnis: "abgelehnt",
              code: "schleuse_blockiert",
              schleuseGrund: e.data.reason,
              zeit: e.time,
            },
          ];
      return { ...weiter, eintraege, schleuseBlockiert: true };
    }
    case "beleg.created": {
      if (weiter.belege.some((b) => b.id === e.data.belegId)) return weiter;
      const neu: BelegKurz = {
        id: e.data.belegId,
        vollstaendig: false,
        aktion: e.data.action,
        zeit: e.time,
        ...(runId === undefined ? {} : { runId }),
        ...(e.data.messageId === undefined ? {} : { messageId: e.data.messageId }),
      };
      return { ...weiter, belege: sortiereBelege([neu, ...weiter.belege]) };
    }
    default:
      return weiter;
  }
}

/** Mehrere Ereignisse nacheinander. */
export function ereignisseAnwenden(
  a: ChatAnsicht,
  ereignisse: readonly ConversationEvent[],
  kontext: AnsichtKontext = {},
): ChatAnsicht {
  return ereignisse.reduce((stand, e) => ereignisAnwenden(stand, e, kontext), a);
}

/**
 * Antwort der Route „Nachricht senden“: deine Nachricht und der eingereihte Lauf erscheinen
 * sofort. Kam der Strom schneller, ändert das nichts; ein schon beendeter Lauf bleibt beendet.
 */
export function gesendet(
  a: ChatAnsicht,
  g: { messageId: string; runId: string; text: string; zeit: string },
): ChatAnsicht {
  let weiter = a;
  if (!findeNachricht(a, g.messageId)) {
    weiter = {
      ...weiter,
      eintraege: [
        ...weiter.eintraege,
        {
          art: "nachricht",
          id: g.messageId,
          rolle: "du",
          text: g.text,
          zeit: g.zeit,
          zustand: "fertig",
        },
      ],
    };
  }
  if (weiter.beendet.includes(g.runId) || weiter.lauf?.id === g.runId) return weiter;
  return {
    ...weiter,
    lauf: { id: g.runId, phase: "wartet", abbruch: false },
    schleuseBlockiert: false,
  };
}

/**
 * Antwort der Route „neu erzeugen“: der neue Lauf wartet. Kam der Strom schneller, ändert das
 * nichts; ein schon beendeter Lauf bleibt beendet.
 */
export function neuErzeugt(a: ChatAnsicht, g: { runId: string }): ChatAnsicht {
  if (a.beendet.includes(g.runId) || a.lauf?.id === g.runId) return a;
  return { ...a, lauf: { id: g.runId, phase: "wartet", abbruch: false }, schleuseBlockiert: false };
}

/**
 * Die Antwort, die sich neu erzeugen lässt: die letzte Nachricht, wenn sie eine abgeschlossene
 * Antwort des Bots ist (Hinweise zu Läufen ohne Antwort dahinter zählen nicht).
 */
export function neuErzeugbar(a: ChatAnsicht): AnsichtNachricht | undefined {
  const letzte = [...a.eintraege].reverse().find((e) => e.art === "nachricht");
  if (letzte?.art !== "nachricht" || letzte.rolle !== "bot" || letzte.zustand === "streamt") {
    return undefined;
  }
  return letzte;
}

/** Stopp wurde angefragt. */
export function abbruchAngefragt(a: ChatAnsicht): ChatAnsicht {
  return a.lauf === undefined ? a : { ...a, lauf: { ...a.lauf, abbruch: true } };
}

/** Stopp kam zu spät: der Lauf war schon zu Ende (die Ereignisse folgen). */
export function abbruchZurueck(a: ChatAnsicht): ChatAnsicht {
  return a.lauf === undefined ? a : { ...a, lauf: { ...a.lauf, abbruch: false } };
}

/** Übernimmt vollständige Belege vom Server; angekündigte ohne Gegenstück bleiben stehen. */
export function belegeMischen(a: ChatAnsicht, vollstaendig: readonly BelegKurz[]): ChatAnsicht {
  const bekannt = new Map(vollstaendig.map((b) => [b.id, b]));
  const rest = a.belege.filter((b) => !bekannt.has(b.id));
  return { ...a, belege: sortiereBelege([...vollstaendig, ...rest]) };
}

/** Der Beleg, der unter einer Antwort steht: Ergebnis der Modell-Anfrage, sonst die Entscheidung. */
export function belegZurAntwort(belege: readonly BelegKurz[], runId: string | undefined) {
  if (runId === undefined) return undefined;
  const passend = belege.filter((b) => b.runId === runId && b.aktion === "modell.anfragen");
  return (
    passend.find((b) => b.art === "result") ?? passend.find((b) => b.vollstaendig) ?? passend[0]
  );
}

/** Darf gerade gesendet werden? Nicht, solange ein Lauf aktiv ist. */
export function sendenGesperrt(a: ChatAnsicht): boolean {
  return a.lauf !== undefined;
}
