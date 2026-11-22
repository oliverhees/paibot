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
import type {
  BelegKurz,
  ChatVerlauf,
  LaufWerkzeuge,
  ModellInfo,
  QuelleAnzeige,
  WerkzeugAnzeige,
  WerkzeugAnzeigeStatus,
} from "./typen";
import { WERKZEUG_DOKU } from "./werkzeug-anzeige";

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
  /**
   * `fest`: PaiBot hat diese Antwort selbst gegeben, nicht das Modell. Kommt nur aus der
   * gespeicherten Herkunft der Nachricht, nie aus ihrem Text.
   */
  herkunft?: "fest";
  /**
   * Die Antwort stützt sich auf Inhalte aus einer fremden Quelle (etwa einer App): Links darin
   * sind nicht anklickbar und zeigen ihr volles Ziel. Kommt aus dem Kennzeichen `untrusted` der
   * Nachricht; fehlt es dort, bleibt `fremd` ungesetzt.
   */
  fremd?: true;
  /**
   * Die Antwort kam über den Strom, ihr Lauf hatte Schritte, und ihre Herkunft ist noch nicht aus
   * dem Lesestand bestätigt (das Ereignis „angelegt“ nennt sie nicht).
   */
  herkunftOffen?: true;
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

/**
 * Wie ein Schritt eines Laufs mit Werkzeugen steht: `laeuft` (Text kommt noch), `antwort` (zu
 * Ende, der Text wird zur Antwort), `zwischentext` (zu Ende, danach folgte ein Werkzeug),
 * `verworfen` (ein späteres Ereignis hat den Text verworfen) oder `abgebrochen` (der Lauf endete
 * mitten im Schritt).
 */
export type SchrittEnde = "laeuft" | "antwort" | "zwischentext" | "verworfen" | "abgebrochen";

/** Ein Werkzeug-Aufruf eines Schritts. */
export interface AnsichtWerkzeug {
  actionId: string;
  key: string;
  /** Name des Werkzeugs, wie das Modell ihn nannte (geprüft). */
  name: string;
  /** Reihenfolge im Schritt. */
  position: number;
  /** Zustand nur aus `tool.finished` bzw. dem gespeicherten Aufruf, nie aus der Reihenfolge der Ereignisse. */
  status: WerkzeugAnzeigeStatus;
  code?: ErrorCode;
  /** Zustand, mit dem der gespeicherte Aufruf zuletzt gelesen wurde. */
  geladen?: WerkzeugAnzeigeStatus;
  quellen?: QuelleAnzeige[];
  nichtsGefunden?: boolean;
  eingabeKurz?: string;
  nameVomModell?: string;
  entscheidungBelegId?: string;
  belegId?: string;
}

/**
 * Ein Schritt eines Laufs mit Werkzeugen: sein vorläufiger Text und seine Werkzeug-Aufrufe. Er ist
 * nie ein Eintrag des Verlaufs und nie eine Antwort; die Antwort-Blase füllt sich nur aus
 * `text.delta` bzw. der gespeicherten Antwort.
 */
export interface AnsichtSchritt {
  runId: string;
  step: number;
  text: string;
  ende: SchrittEnde;
  /** Der Text stammt aus der gespeicherten Nachricht des Schritts; `draft.delta` ändert ihn nicht mehr. */
  gespeichert: boolean;
  /** ISO-Zeit. */
  zeit: string;
  werkzeuge: AnsichtWerkzeug[];
  servedBy?: ServedBy;
  /** Modell, das der Anbieter für diesen Schritt gemeldet hat. */
  modelReported?: string;
  /** Modell des Schritts, wenn die gespeicherte Nachricht es nennt. */
  modell?: ModellInfo;
}

export interface AktiverLauf {
  id: string;
  /** wartet: in der Schlange; schreibt: der Bot arbeitet; schlaegt_nach: ein Aufruf des Nachschlagens läuft. */
  phase: "wartet" | "schreibt" | "schlaegt_nach";
  /** Stopp wurde angefragt. */
  abbruch: boolean;
}

export interface ChatAnsicht {
  /** Höchste verarbeitete Nummer im Ereignis-Strom. */
  letzteSeq: number;
  eintraege: AnsichtEintrag[];
  /** Schritte von Läufen mit Werkzeugen (leer, solange kein Werkzeug eingeschaltet ist). */
  schritte: AnsichtSchritt[];
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
    ...(m.origin === "fest" ? { herkunft: "fest" as const } : {}),
    ...(m.untrusted === true ? { fremd: true as const } : {}),
  };
}

/** Ein Zwischentext (Nachricht mit `step`) als Schritt der Ansicht. */
function schrittAus(m: Message, modelle: Record<string, ModellInfo>): AnsichtSchritt | null {
  if (m.role === "system" || m.step === undefined || m.runId === undefined) return null;
  const info = m.modelId === undefined ? undefined : modelle[m.modelId];
  const modell = info === undefined ? undefined : modellZurAntwort(info, m.createdAt);
  return {
    runId: m.runId,
    step: m.step,
    text: m.content,
    ende:
      m.status === "complete"
        ? "zwischentext"
        : m.status === "streaming"
          ? "laeuft"
          : "abgebrochen",
    gespeichert: true,
    zeit: m.createdAt,
    werkzeuge: [],
    ...(m.servedBy === undefined ? {} : { servedBy: m.servedBy }),
    ...(modell === undefined ? {} : { modell }),
  };
}

const WERKZEUG_STATUS: Record<
  "succeeded" | "failed" | "denied" | "cancelled",
  WerkzeugAnzeigeStatus
> = {
  succeeded: "fertig",
  failed: "fehlgeschlagen",
  denied: "abgelehnt",
  cancelled: "abgebrochen",
};

/** Ein gelesener Aufruf als Werkzeug der Ansicht; `geladen` = sein Zustand beim Lesen. */
function werkzeugAus(w: WerkzeugAnzeige): AnsichtWerkzeug {
  return {
    actionId: w.actionId,
    key: w.key,
    name: w.name,
    position: w.position,
    status: w.status,
    geladen: w.status,
    ...(w.code === undefined ? {} : { code: w.code }),
    ...(w.quellen === undefined ? {} : { quellen: w.quellen }),
    ...(w.nichtsGefunden === undefined ? {} : { nichtsGefunden: w.nichtsGefunden }),
    ...(w.eingabeKurz === undefined ? {} : { eingabeKurz: w.eingabeKurz }),
    ...(w.nameVomModell === undefined ? {} : { nameVomModell: w.nameVomModell }),
    ...(w.entscheidungBelegId === undefined ? {} : { entscheidungBelegId: w.entscheidungBelegId }),
    ...(w.belegId === undefined ? {} : { belegId: w.belegId }),
  };
}

/** Leere Ansicht (neue Unterhaltung). */
export function leereAnsicht(): ChatAnsicht {
  return {
    letzteSeq: 0,
    eintraege: [],
    schritte: [],
    beendet: [],
    belege: [],
    schleuseBlockiert: false,
  };
}

// ---------------------------------------------------------------- Schritte

/** Schritt `(runId, step)`; gibt es ihn nicht, entsteht er leer und „läuft“. */
function mitSchritt(
  a: ChatAnsicht,
  runId: string,
  step: number,
  zeit: string,
  aendern: (s: AnsichtSchritt) => AnsichtSchritt,
): ChatAnsicht {
  const stelle = a.schritte.findIndex((x) => x.runId === runId && x.step === step);
  if (stelle < 0) {
    const neu: AnsichtSchritt = {
      runId,
      step,
      text: "",
      ende: "laeuft",
      gespeichert: false,
      zeit,
      werkzeuge: [],
    };
    return { ...a, schritte: [...a.schritte, aendern(neu)] };
  }
  return { ...a, schritte: a.schritte.map((x, i) => (i === stelle ? aendern(x) : x)) };
}

/** Wendet `aendern` auf den Aufruf `actionId` an, in welchem Schritt er auch steht. */
function mitWerkzeug(
  a: ChatAnsicht,
  actionId: string,
  aendern: (w: AnsichtWerkzeug) => AnsichtWerkzeug,
): ChatAnsicht {
  if (!a.schritte.some((x) => x.werkzeuge.some((w) => w.actionId === actionId))) return a;
  return {
    ...a,
    schritte: a.schritte.map((x) =>
      x.werkzeuge.some((w) => w.actionId === actionId)
        ? { ...x, werkzeuge: x.werkzeuge.map((w) => (w.actionId === actionId ? aendern(w) : w)) }
        : x,
    ),
  };
}

/** Hat der Schritt etwas zu zeigen: Text oder einen Aufruf? */
export function schrittSichtbar(x: AnsichtSchritt): boolean {
  return x.text !== "" || x.werkzeuge.length > 0;
}

/** Die Schritte eines Laufs, nach ihrer Nummer. */
export function schritteVon(a: ChatAnsicht, runId: string): AnsichtSchritt[] {
  return a.schritte.filter((x) => x.runId === runId).sort((x, y) => x.step - y.step);
}

/** Der Lauf endete ohne Antwort: Schritte mitten im Text und Aufrufe, die noch liefen, gelten als abgebrochen. */
function schritteAbbrechen(a: ChatAnsicht, runId: string): ChatAnsicht {
  if (!a.schritte.some((x) => x.runId === runId)) return a;
  return {
    ...a,
    schritte: a.schritte.map((x) =>
      x.runId !== runId
        ? x
        : {
            ...x,
            ende: x.ende === "laeuft" || x.ende === "antwort" ? "abgebrochen" : x.ende,
            werkzeuge: x.werkzeuge.map((w) =>
              w.status === "laeuft" ? { ...w, status: "abgebrochen" as const } : w,
            ),
          },
    ),
  };
}

/** Die Antwort des Laufs steht da: der vorläufige Text ihres Schritts hat seinen Zweck erfüllt. */
function antwortSchrittEntfernen(a: ChatAnsicht, runId: string): ChatAnsicht {
  if (!a.schritte.some((x) => x.runId === runId && x.ende === "antwort")) return a;
  return { ...a, schritte: a.schritte.filter((x) => !(x.runId === runId && x.ende === "antwort")) };
}

/**
 * Was die Anzeige beim Server nachfragen muss: je Lauf mit offenen Dingen ein Eintrag mit der
 * Kennung des Laufs und einem Schlüssel, der sich ändert, wenn es etwas Neues zu holen gibt.
 * Nachfragen heißt: die Aufrufe eines Laufs lesen, deren Zustand seit dem letzten Lesen anders
 * ist, bzw. die Herkunft von Antworten, die über den Strom kamen. Jeder Lauf wird einzeln
 * abgefragt, ein alter blockiert keinen neuen. Der Schlüssel enthält die noch offenen Dinge und
 * ob der Lauf beendet ist (mit dem Ende ändert er sich, damit der Endzustand noch gelesen wird);
 * wer ihn schon abgefragt hat, fragt nicht noch einmal, auch wenn der Server keine bessere
 * Antwort hatte.
 */
export function offeneNachfragen(a: ChatAnsicht): { runId: string; schluessel: string }[] {
  const laeufe = new Set<string>();
  for (const x of a.schritte)
    if (x.werkzeuge.some((w) => w.geladen !== w.status)) laeufe.add(x.runId);
  for (const e of a.eintraege) {
    if (e.art === "nachricht" && e.herkunftOffen === true && e.runId !== undefined) {
      laeufe.add(e.runId);
    }
  }
  return [...laeufe].map((runId) => {
    const offeneAufrufe = a.schritte
      .filter((x) => x.runId === runId)
      .flatMap((x) => x.werkzeuge.filter((w) => w.geladen !== w.status))
      .map((w) => `${w.actionId}:${w.status}`);
    const offeneAntworten = a.eintraege
      .filter((e) => e.art === "nachricht" && e.runId === runId && e.herkunftOffen === true)
      .map((e) => (e.art === "nachricht" ? e.id : ""));
    const ende = a.beendet.includes(runId) ? "ende" : "";
    return { runId, schluessel: [runId, ende, ...offeneAufrufe, ...offeneAntworten].join("|") };
  });
}

/**
 * Übernimmt, was der Server zu einem Lauf gelesen hat: Fundstellen, Frage, Belege und den
 * gespeicherten Zustand der Aufrufe (ein gespeicherter Zustand „läuft“ überschreibt kein schon
 * gemeldetes Ende) sowie die feste Herkunft und das Kennzeichen „fremder Inhalt“ von Antworten des
 * Laufs.
 */
export function nachfrageUebernehmen(
  a: ChatAnsicht,
  runId: string,
  antwort: LaufWerkzeuge,
): ChatAnsicht {
  let stand = a;
  for (const w of antwort.werkzeuge) {
    if (w.runId !== runId) continue;
    stand = mitSchritt(stand, runId, w.step, "", (x) => {
      const bekannt = x.werkzeuge.some((k) => k.actionId === w.actionId);
      const gelesen = werkzeugAus(w);
      if (!bekannt) return { ...x, werkzeuge: [...x.werkzeuge, gelesen] };
      return {
        ...x,
        werkzeuge: x.werkzeuge.map((k) =>
          k.actionId !== w.actionId
            ? k
            : {
                ...gelesen,
                status: w.status === "laeuft" ? k.status : w.status,
                key: k.key !== "" ? k.key : gelesen.key,
                position: k.position,
              },
        ),
      };
    });
  }
  // Ein beendeter Lauf ändert sich nicht mehr: Was der Server zuletzt gelesen hat, gilt, auch wenn
  // er einen Aufruf noch als „läuft“ sah oder mehr Aufrufe hat, als er nennt (Grenze der Route).
  if (stand.beendet.includes(runId)) {
    stand = {
      ...stand,
      schritte: stand.schritte.map((x) =>
        x.runId !== runId
          ? x
          : { ...x, werkzeuge: x.werkzeuge.map((k) => ({ ...k, geladen: k.status })) },
      ),
    };
  }
  const feste = new Set(antwort.feste);
  const fremde = new Set(antwort.fremde ?? []);
  return {
    ...stand,
    eintraege: stand.eintraege.map((e) => {
      if (e.art !== "nachricht" || e.runId !== runId || e.herkunftOffen !== true) return e;
      const { herkunftOffen: _weg, ...rest } = e;
      return {
        ...rest,
        ...(feste.has(e.id) ? { herkunft: "fest" as const } : {}),
        ...(fremde.has(e.id) ? { fremd: true as const } : {}),
      };
    }),
  };
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
  const schritte: AnsichtSchritt[] = [];
  for (const m of verlauf.nachrichten) {
    const schritt = schrittAus(m, verlauf.modelle);
    if (schritt !== null) schritte.push(schritt);
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
    schritte,
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
  // Aufrufe der gespeicherten Schritte, wie sie der Server gelesen hat.
  for (const w of verlauf.werkzeuge ?? []) {
    ansicht = mitSchritt(ansicht, w.runId, w.step, "", (x) => ({
      ...x,
      werkzeuge: [...x.werkzeuge, werkzeugAus(w)],
    }));
  }
  // Läufe, die ohne Antwort endeten: Aufrufe, die noch „liefen“, gelten als abgebrochen.
  for (const lauf of verlauf.laeufe) {
    if (LAUF_ENDE[lauf.status] !== undefined) ansicht = schritteAbbrechen(ansicht, lauf.id);
  }
  const erste = verlauf.ereignisse[0]?.seq;
  if (erste !== undefined) ansicht.letzteSeq = erste - 1;
  for (const ereignis of verlauf.ereignisse) ansicht = ereignisAnwenden(ansicht, ereignis, kontext);
  ansicht.letzteSeq = Math.max(ansicht.letzteSeq, verlauf.letzteSeq);
  // Steht die Antwort eines Laufs da, braucht ihr vorläufiger Text keinen Platz mehr.
  const fertigeLaeufe = new Set(
    ansicht.eintraege.flatMap((e) =>
      e.art === "nachricht" && e.rolle === "bot" && e.zustand !== "streamt" && e.runId !== undefined
        ? [e.runId]
        : [],
    ),
  );
  ansicht.schritte = ansicht.schritte.filter(
    (x) => !(x.ende === "antwort" && fertigeLaeufe.has(x.runId)),
  );
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
      const lauf = runId ?? nachricht?.runId;
      // Herkunft der Antwort (Modell oder PaiBot) und das Kennzeichen „fremder Inhalt“ stehen erst
      // im Lesestand: Das Ereignis „fertig“ nennt sie nicht. Deshalb fragt die Ansicht für jeden
      // fertigen Lauf nach (auch ohne Schritte), und bis dahin zeigt sie Links nur als Text.
      const eintraege = ersetze(weiter.eintraege, e.data.messageId, (n) => ({
        ...n,
        zustand: "fertig",
        route: e.data.route,
        modell,
        ...(servedBy === undefined ? {} : { servedBy }),
        ...(lauf !== undefined && n.herkunft === undefined ? { herkunftOffen: true as const } : {}),
      }));
      const ohneVorlaeufig = lauf === undefined ? weiter : antwortSchrittEntfernen(weiter, lauf);
      const mit = { ...ohneVorlaeufig, eintraege, fertigeAntwort: e.data.messageId };
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
      return laufBeenden(
        schritteAbbrechen({ ...weiter, eintraege, schleuseBlockiert: blockiert }, e.data.runId),
        e.data.runId,
      );
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
    case "draft.delta": {
      // Vorläufiger Text: nur im Schritt, nie in einer Nachricht. Ein gespeicherter Schritt trägt
      // seinen ganzen Text schon (Lesestand zwischen Speichern und Ende des Laufs).
      const mitText = mitSchritt(weiter, e.data.runId, e.data.step, e.time, (x) =>
        x.gespeichert || x.ende !== "laeuft" ? x : { ...x, text: x.text + e.data.text },
      );
      return weiter.lauf?.id === e.data.runId && weiter.lauf.phase === "schlaegt_nach"
        ? { ...mitText, lauf: { ...weiter.lauf, phase: "schreibt" } }
        : mitText;
    }
    case "step.finished": {
      // Das letzte Ende eines Schritts gilt; ein abgebrochener Schritt bleibt abgebrochen.
      const ende: SchrittEnde =
        e.data.ending === "antwort"
          ? "antwort"
          : e.data.ending === "verworfen"
            ? "verworfen"
            : "zwischentext";
      // Ohne Text und ohne Aufruf davor gibt es nichts zu zeigen: ein Lauf ohne Werkzeuge meldet
      // das Ende seiner Antwort auch, aber hat keinen Schritt.
      if (
        ende === "antwort" &&
        !weiter.schritte.some((x) => x.runId === e.data.runId && x.step === e.data.step)
      ) {
        return weiter;
      }
      return mitSchritt(weiter, e.data.runId, e.data.step, e.time, (x) => ({
        ...x,
        ende: x.ende === "abgebrochen" ? x.ende : ende,
        ...(e.data.servedBy === undefined ? {} : { servedBy: e.data.servedBy }),
        ...(e.data.modelReported === undefined ? {} : { modelReported: e.data.modelReported }),
      }));
    }
    case "tool.requested": {
      return mitSchritt(weiter, e.data.runId, e.data.step, e.time, (x) =>
        x.werkzeuge.some((w) => w.actionId === e.data.actionId)
          ? x
          : {
              ...x,
              werkzeuge: [
                ...x.werkzeuge,
                {
                  actionId: e.data.actionId,
                  key: e.data.key,
                  name: e.data.name,
                  position: x.werkzeuge.length,
                  status: "laeuft",
                },
              ],
            },
      );
    }
    case "tool.started": {
      const werkzeug = weiter.schritte
        .flatMap((x) => x.werkzeuge)
        .find((w) => w.actionId === e.data.actionId);
      if (werkzeug?.key !== WERKZEUG_DOKU || weiter.lauf?.id !== e.data.runId) return weiter;
      return { ...weiter, lauf: { ...weiter.lauf, phase: "schlaegt_nach" } };
    }
    case "tool.finished": {
      const status = WERKZEUG_STATUS[e.data.status];
      const geaendert = mitWerkzeug(weiter, e.data.actionId, (w) => ({
        ...w,
        status,
        ...(e.data.code === undefined ? {} : { code: e.data.code }),
      }));
      return geaendert.lauf?.id === e.data.runId && geaendert.lauf.phase === "schlaegt_nach"
        ? { ...geaendert, lauf: { ...geaendert.lauf, phase: "schreibt" } }
        : geaendert;
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
