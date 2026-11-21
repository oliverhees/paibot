/**
 * PaiBot – Prüf-Logik der Belege-Seite als reine Funktionen: ganze Kette und einzelner Beleg,
 * Ergebnis in Worten nach den Urteilen des Prüfers. Der Prüfer (`@paibot/receipts/pruefen`) wird
 * übergeben, damit dieselbe Logik im Browser (Web Crypto) und als gekennzeichneter Rückfall auf dem
 * Server läuft. Lädt selbst weder Zod noch Server-Code.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ChainReport, CheckResult, RuleHistory, RuleVersion } from "@paibot/receipts/pruefen";
import type { ChainAnchor, ChainProblem, PublicKeyInfo, ReceiptEntry } from "@paibot/shared/belege";
import { t } from "@paibot/shared/texte";
import { kennung } from "./darstellung";

/** Was die Seite vom Prüfer braucht. */
export type Pruefer = Pick<
  typeof import("@paibot/receipts/pruefen"),
  "verifyChain" | "verifyReceipt" | "rulesAsOf"
>;

/** Regeln zum Nachrechnen: alle Fassungen mit Nummer und die heute gültigen (Route `/api/regeln`). */
export interface RegelDaten {
  stand: number;
  aktive: readonly RuleVersion[];
  fassungen: readonly RuleVersion[];
}

export interface PruefPunkt {
  art: "ok" | "fehler" | "hinweis";
  text: string;
}

/** `nicht_pruefbar`: Belege aus einer neueren PaiBot-Fassung; nie „gültig“. */
export type PruefStufe = "gueltig" | "gebrochen" | "nicht_pruefbar" | "ungueltig";

/**
 * Wie das Urteil aussieht (`PruefUrteil`): „nicht prüfbar“ wie „gebrochen“ als Warnung, mit
 * eigenem Text. Mit `warnung` (Rückschritt der Fassung) zeigt auch eine gültige Kette die
 * Warn-Ansicht; die Stufe selbst bleibt.
 */
export function urteilZustand(
  stufe: PruefStufe,
  warnung = false,
): "gueltig" | "gebrochen" | "ungueltig" {
  if (stufe === "nicht_pruefbar") return "gebrochen";
  if (stufe === "gueltig" && warnung) return "gebrochen";
  return stufe;
}

/** Probleme, die die Kette nicht ungültig machen, sondern nur nicht beglaubigt bzw. nicht prüfbar. */
const HINWEIS_PROBLEME: readonly ChainProblem[] = [
  "schluesselwechsel_nicht_beglaubigt",
  "fassung_unbekannt",
];
export type PruefQuelle = "browser" | "server";

export interface KettenErgebnis {
  stufe: PruefStufe;
  titel: string;
  punkte: PruefPunkt[];
  geprueft: number;
  kopfSeq?: number;
  /** Erste Stelle mit einem Fehler (Einzelprüfung oder Befund). */
  fehlerSeq?: number;
  /** Ab hier nicht vom ursprünglichen Schlüssel beglaubigt. */
  nichtBeglaubigtAb?: number;
  anker: "geprueft" | "fehlt";
  quelle: PruefQuelle;
  /** Warnung ohne Einfluss auf die Stufe: nach einem Beleg einer neueren Tor-Fassung folgt einer einer älteren. */
  warnung?: boolean;
}

export interface EinzelErgebnis {
  stufe: PruefStufe;
  titel: string;
  punkte: PruefPunkt[];
  quelle: PruefQuelle;
}

type Roh = Record<string, unknown>;

function objekt(wert: unknown): Roh | undefined {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert)
    ? (wert as Roh)
    : undefined;
}

/** Regel-Fassungen für das Nachrechnen mit dem damaligen Regelstand. */
export function regelQuelle(regeln: RegelDaten, pruefer: Pruefer): RuleHistory {
  return {
    asOf: async (stand) => pruefer.rulesAsOf(regeln.fassungen, stand),
    current: async () => regeln.aktive,
  };
}

/**
 * Probleme, bei denen Entscheidung und Ergebnis einer Aktion nicht zusammenpassen. Der Prüfer
 * erkennt sie beim Durchlaufen der Kette (jede Aktion genau eine Entscheidung und höchstens ein
 * Ergebnis, das Ergebnis nach seiner Entscheidung und passend zu ihr).
 */
export const PAAR_PROBLEME: readonly ChainProblem[] = [
  "ergebnis_ohne_entscheidung",
  "ergebnis_passt_nicht_zur_entscheidung",
  "aktion_doppelt",
];

// ---------------------------------------------------------------------------------------------
// Texte

const CHECK_REIHENFOLGE = ["inhalt", "signatur", "kette", "entscheidung"] as const;

/** Grund einer fehlgeschlagenen Einzelprüfung in Worten. */
export function grundText(checks: readonly CheckResult[]): string {
  for (const name of CHECK_REIHENFOLGE) {
    const check = checks.find((c) => c.check === name && c.status === "fehler");
    if (check === undefined) continue;
    if (name !== "entscheidung") return t(`belege.grund.${name}`);
    return t(`belege.grund.entscheidung.${check.problem ?? "entscheidung_abweichend"}`);
  }
  return t("belege.grund.unbekannt");
}

/** Problem der Kette in Worten; mit Stelle, wenn der Prüfer eine nennt. */
export function problemText(problem: ChainProblem, seq?: number): string {
  const satz = t(`belege.problem.${problem}`);
  return seq === undefined ? satz : `${satz} ${t("belege.stelle", { kennung: kennung(seq) })}`;
}

function quellePunkt(quelle: PruefQuelle): PruefPunkt {
  return {
    art: "hinweis",
    text: quelle === "browser" ? t("belege.quelle.browser") : t("pruefung.server"),
  };
}

function ohneRegelstand(entry: ReceiptEntry): boolean {
  const body = objekt(entry.body);
  return body?.type === "decision" && objekt(body.decision)?.ruleStand === undefined;
}

// ---------------------------------------------------------------------------------------------
// Ganze Kette

export interface KettenZusatz {
  /** Entscheidungen ohne Regelstand (ältere Ketten; ab Fassung 2 meldet sie der Prüfer). */
  ohneRegelstand: number;
  quelle: PruefQuelle;
}

/** Übersetzt den Bericht des Prüfers in ein Ergebnis in Worten. */
export function kettenErgebnis(bericht: ChainReport, zusatz: KettenZusatz): KettenErgebnis {
  const { verdict } = bericht;
  const fehlerCheck = bericht.firstFailure?.checks.find((c) => c.status === "fehler")?.check;
  const ungueltigeBefunde = verdict.findings.filter((f) => !HINWEIS_PROBLEME.includes(f.problem));
  const paarBefund = verdict.findings.some((f) => PAAR_PROBLEME.includes(f.problem));
  const stufe: PruefStufe =
    verdict.level === "vertrauenswuerdig"
      ? "gueltig"
      : verdict.level === "vertrauen_gebrochen"
        ? "gebrochen"
        : verdict.level === "nicht_pruefbar"
          ? "nicht_pruefbar"
          : "ungueltig";

  const kandidaten = [bericht.firstFailure?.seq, ...ungueltigeBefunde.map((f) => f.seq)].filter(
    (s): s is number => s !== undefined,
  );
  const fehlerSeq =
    stufe === "ungueltig" && kandidaten.length > 0 ? Math.min(...kandidaten) : undefined;

  // Ein Befund des Prüfers mit Stelle, wenn er die erste Fehlerstelle ist (z. B. „Aktion doppelt“).
  const befundAnStelle =
    fehlerSeq === undefined ? undefined : ungueltigeBefunde.find((f) => f.seq === fehlerSeq);
  let titel: string;
  if (bericht.checked === 0 && stufe === "gueltig") {
    titel = t("belege.urteil.leer");
  } else if (stufe === "gueltig") {
    titel = t("belege.urteil.gueltig_anzahl", { anzahl: bericht.checked });
  } else if (stufe === "nicht_pruefbar") {
    titel = t("belege.urteil.nicht_pruefbar");
  } else if (stufe === "gebrochen") {
    titel = t("belege.urteil.gebrochen_ab", { kennung: kennung(bericht.notAttestedFrom ?? 0) });
  } else if (bericht.firstFailure !== undefined && bericht.firstFailure.seq === fehlerSeq) {
    titel = t("belege.urteil.ungueltig_an", {
      kennung: kennung(bericht.firstFailure.seq),
      grund: grundText(bericht.firstFailure.checks),
    });
  } else if (befundAnStelle !== undefined && fehlerSeq !== undefined) {
    titel = t("belege.urteil.ungueltig_an", {
      kennung: kennung(fehlerSeq),
      grund: problemText(befundAnStelle.problem),
    });
  } else if (ungueltigeBefunde[0] !== undefined) {
    titel = t("belege.urteil.ungueltig_grund", {
      grund: problemText(ungueltigeBefunde[0].problem),
    });
  } else if (bericht.firstFailure !== undefined) {
    titel = t("belege.urteil.ungueltig_an", {
      kennung: kennung(bericht.firstFailure.seq),
      grund: grundText(bericht.firstFailure.checks),
    });
  } else {
    titel = t("belege.urteil.ungueltig");
  }

  const schluesselProblem = verdict.findings.some(
    (f) => f.problem === "schluessel_nicht_aus_kette",
  );
  // Entscheidungen aus einer neueren Fassung lassen sich weder nachrechnen noch ihren Ergebnissen
  // nach Inhalt zuordnen: dann kein grüner Haken, sondern ein Hinweis mit der Anzahl.
  const nichtPruefbar = verdict.findings.filter((f) => f.problem === "fassung_unbekannt").length;
  const teilweise = (fehler: boolean, ok: string, offen: string): PruefPunkt =>
    fehler
      ? { art: "fehler", text: ok }
      : nichtPruefbar > 0
        ? { art: "hinweis", text: offen }
        : { art: "ok", text: ok };
  const punkte: PruefPunkt[] = [
    {
      art: fehlerCheck === "inhalt" ? "fehler" : "ok",
      text: t("belege.geprueft.inhalt", { anzahl: bericht.checked }),
    },
    {
      art: fehlerCheck === "signatur" || schluesselProblem ? "fehler" : "ok",
      text: t("belege.geprueft.signatur"),
    },
    {
      art: fehlerCheck === "kette" ? "fehler" : "ok",
      text: t("belege.geprueft.kette", { bis: kennung(bericht.head?.seq ?? 0) }),
    },
    teilweise(
      fehlerCheck === "entscheidung",
      t("belege.geprueft.entscheidung"),
      t("belege.geprueft.entscheidung_nicht_pruefbar", { anzahl: nichtPruefbar }),
    ),
  ];
  // Ältere Ketten (vor Fassung 2): Entscheidungen ohne Regelstand sind erlaubt, aber sichtbar. Ab
  // Fassung 2 meldet der Prüfer sie als Fehler „Regelstand fehlt“.
  const regelstandFehlt = verdict.findings.some((f) => f.problem === "regelstand_fehlt");
  if (zusatz.ohneRegelstand > 0 && !regelstandFehlt) {
    punkte.push({
      art: "hinweis",
      text: t("belege.geprueft.ohne_regelstand", { anzahl: zusatz.ohneRegelstand }),
    });
  }
  punkte.push(
    teilweise(
      paarBefund,
      t("belege.geprueft.paare"),
      t("belege.geprueft.paare_nicht_pruefbar", { anzahl: nichtPruefbar }),
    ),
  );
  for (const befund of verdict.findings) {
    punkte.push({
      art: HINWEIS_PROBLEME.includes(befund.problem) ? "hinweis" : "fehler",
      text: problemText(befund.problem, befund.seq),
    });
  }
  // Rückschritt der Fassung: eine Warnung, die Stufe der Kette bleibt.
  for (const hinweis of verdict.notes ?? []) {
    punkte.push({
      art: "fehler",
      text: `${t(`belege.warnung.${hinweis.note}`)} ${t("belege.stelle", { kennung: kennung(hinweis.seq) })}`,
    });
  }
  if (verdict.anchor === "geprueft") {
    const ankerFehler = verdict.findings.some((f) =>
      [
        "andere_installation",
        "kette_kuerzer_als_anker",
        "kopf_abweichend",
        "anderer_anfang_als_anker",
      ].includes(f.problem),
    );
    punkte.push({
      art: ankerFehler ? "fehler" : "ok",
      text: t("belege.geprueft.anker"),
    });
  } else {
    punkte.push({ art: "hinweis", text: t("belege.anker.ohne") });
    punkte.push({ art: "hinweis", text: t("belege.anker.ausgetauscht") });
  }
  punkte.push(quellePunkt(zusatz.quelle));

  return {
    stufe,
    titel,
    punkte,
    geprueft: bericht.checked,
    ...(bericht.head === undefined ? {} : { kopfSeq: bericht.head.seq }),
    ...(fehlerSeq === undefined ? {} : { fehlerSeq }),
    ...(bericht.notAttestedFrom === undefined
      ? {}
      : { nichtBeglaubigtAb: bericht.notAttestedFrom }),
    anker: verdict.anchor,
    quelle: zusatz.quelle,
    ...((verdict.notes ?? []).length > 0 ? { warnung: true } : {}),
  };
}

export interface KettenOptionen {
  regeln: RegelDaten;
  /** Vom Nutzer außerhalb aufbewahrter Anker; nie der Anker aus dem Kopf eines Exports. */
  anker?: ChainAnchor;
  /** Schlüssel von anderswo (Datenbank), nur zum Vergleich. */
  publicKeys?: readonly PublicKeyInfo[];
  quelle?: PruefQuelle;
}

/** Prüft eine ganze Kette (auch stückweise geladen) und liefert das Ergebnis in Worten. */
export async function pruefeKette(
  eintraege: Iterable<ReceiptEntry> | AsyncIterable<ReceiptEntry>,
  optionen: KettenOptionen,
  pruefer: Pruefer,
): Promise<KettenErgebnis> {
  let ohneStand = 0;
  async function* mitBuchfuehrung() {
    for await (const entry of eintraege) {
      if (ohneRegelstand(entry)) ohneStand++;
      yield entry;
    }
  }
  const bericht = await pruefer.verifyChain(mitBuchfuehrung(), {
    ruleHistory: regelQuelle(optionen.regeln, pruefer),
    ...(optionen.anker === undefined ? {} : { anchor: optionen.anker }),
    ...(optionen.publicKeys === undefined ? {} : { publicKeys: optionen.publicKeys }),
  });
  return kettenErgebnis(bericht, {
    ohneRegelstand: ohneStand,
    quelle: optionen.quelle ?? "browser",
  });
}

// ---------------------------------------------------------------------------------------------
// Einzelner Beleg

export interface EinzelDaten {
  beleg: ReceiptEntry;
  vorgaenger?: ReceiptEntry;
  nachfolger?: ReceiptEntry;
  /** Start-Beleg und alle Schlüsselwechsel der Kette (Route `/api/belege/schluessel`). */
  schluesselBelege: readonly ReceiptEntry[];
  regeln: RegelDaten;
}

interface Schluessel {
  keyId: string;
  publicKey: string;
  /** Ab dieser Nummer signiert dieser Schlüssel. */
  ab: number;
  beglaubigt: boolean;
}

function info(s: Schluessel): PublicKeyInfo {
  return { keyId: s.keyId, publicKey: s.publicKey, fingerprint: "" } as PublicKeyInfo;
}

/**
 * Schlüssel aus der Kette: der Start nennt den ersten, jeder Schlüsselwechsel den nächsten. Jeder
 * dieser Belege wird selbst geprüft (Inhalt, Signatur des bisherigen bzw. neuen Schlüssels).
 */
async function schluesselFolge(
  belege: readonly ReceiptEntry[],
  pruefer: Pruefer,
): Promise<{ folge: Schluessel[]; stimmt: boolean }> {
  const sortiert = [...belege].sort((a, b) => a.seq - b.seq);
  const folge: Schluessel[] = [];
  let stimmt = true;
  const bestanden = (checks: readonly CheckResult[]) =>
    checks.every((c) => (c.check !== "inhalt" && c.check !== "signatur") || c.status === "ok");
  for (const entry of sortiert) {
    const body = objekt(entry.body);
    const facts = objekt(body?.facts);
    if (folge.length === 0) {
      if (body?.type !== "start" || entry.seq !== 1 || typeof facts?.publicKey !== "string") {
        return { folge, stimmt: false };
      }
      const start: Schluessel = {
        keyId: String(body.keyId),
        publicKey: facts.publicKey,
        ab: 1,
        beglaubigt: true,
      };
      if (!bestanden(await pruefer.verifyReceipt(entry, null, [info(start)]))) stimmt = false;
      folge.push(start);
      continue;
    }
    if (body?.type !== "key_change" || typeof facts?.publicKey !== "string") continue;
    const aktiv = folge[folge.length - 1] as Schluessel;
    const neu: Schluessel = {
      keyId: String(facts.newKeyId),
      publicKey: facts.publicKey,
      ab: entry.seq + 1,
      beglaubigt: aktiv.beglaubigt && facts.signedBy === "previous",
    };
    const checks = await pruefer.verifyReceipt(entry, null, [info(aktiv), info(neu)]);
    if (!bestanden(checks)) stimmt = false;
    if (facts.signedBy === "previous" && entry.keyId !== aktiv.keyId) stimmt = false;
    folge.push(neu);
  }
  return { folge, stimmt };
}

/**
 * Prüft einen einzelnen Beleg: Prüfsumme, Signatur mit dem Schlüssel, der an dieser Stelle aus der
 * Kette folgt, Verbindung zum vorigen und zum nächsten Beleg und (bei Entscheidungen) das
 * Nachrechnen mit dem damaligen Regelstand. Ob die ganze Kette vollständig ist, sagt erst
 * `pruefeKette`.
 */
export async function pruefeEinzeln(
  daten: EinzelDaten,
  pruefer: Pruefer,
  quelle: PruefQuelle = "browser",
): Promise<EinzelErgebnis> {
  const { beleg } = daten;
  const body = objekt(beleg.body);
  const { folge, stimmt } = await schluesselFolge(daten.schluesselBelege, pruefer);
  const vorher = folge.filter((s) => s.ab <= beleg.seq);
  const aktiv = vorher[vorher.length - 1];
  let ring: Schluessel[] = aktiv === undefined ? [] : [aktiv];
  let erwartet = aktiv;
  if (body?.type === "key_change") {
    const neu = folge.find((s) => s.ab === beleg.seq + 1);
    if (neu !== undefined) ring = [...ring, neu];
    if (objekt(body.facts)?.signedBy === "new") erwartet = neu;
  }

  const mitStand = objekt(objekt(body?.decision))?.ruleStand !== undefined;
  const checks = await pruefer.verifyReceipt(beleg, daten.vorgaenger ?? null, ring.map(info), {
    rules: mitStand ? daten.regeln.fassungen : daten.regeln.aktive,
  });
  const status = (name: CheckResult["check"]) => checks.find((c) => c.check === name);

  const punkte: PruefPunkt[] = [];
  const inhalt = status("inhalt");
  punkte.push(
    inhalt?.status === "ok"
      ? { art: "ok", text: t("pruefung.inhalt.ok") }
      : { art: "fehler", text: t("pruefung.inhalt.fehler") },
  );
  const signatur = status("signatur");
  punkte.push(
    signatur?.status === "ok"
      ? {
          art: "ok",
          text: t("pruefung.signatur.ok", { kurzform: signatur.fingerprint ?? "–" }),
        }
      : { art: "fehler", text: t("pruefung.signatur.fehler") },
  );
  const schluesselAusKette =
    stimmt && erwartet !== undefined && String(beleg.keyId) === erwartet.keyId;
  const beglaubigt = schluesselAusKette && erwartet?.beglaubigt === true;
  punkte.push(
    !schluesselAusKette
      ? { art: "fehler", text: t("belege.einzel.schluessel_fehler") }
      : beglaubigt
        ? { art: "ok", text: t("belege.einzel.schluessel_ok") }
        : { art: "hinweis", text: t("belege.einzel.schluessel_nicht_beglaubigt") },
  );
  const kette = status("kette");
  punkte.push(
    kette?.status === "ok"
      ? { art: "ok", text: t("belege.einzel.vorgaenger_ok") }
      : { art: "fehler", text: t("belege.einzel.vorgaenger_fehler") },
  );
  let nachfolgerOk = true;
  if (daten.nachfolger === undefined) {
    punkte.push({ art: "hinweis", text: t("belege.einzel.neuester") });
  } else {
    nachfolgerOk = objekt(daten.nachfolger.body)?.prev === beleg.hash;
    punkte.push(
      nachfolgerOk
        ? { art: "ok", text: t("belege.einzel.nachfolger_ok") }
        : { art: "fehler", text: t("belege.einzel.nachfolger_fehler") },
    );
  }
  const entscheidung = status("entscheidung");
  if (entscheidung !== undefined && entscheidung.status !== "entfaellt") {
    punkte.push(
      entscheidung.status === "ok"
        ? {
            art: "ok",
            text: t("pruefung.entscheidung.ok", {
              regel: entscheidung.rule?.id ?? "–",
            }),
          }
        : entscheidung.status === "nicht_pruefbar"
          ? { art: "hinweis", text: t("belege.einzel.nicht_pruefbar") }
          : {
              art: "fehler",
              text: t(
                `belege.grund.entscheidung.${entscheidung.problem ?? "entscheidung_abweichend"}`,
              ),
            },
    );
    if (entscheidung.ruleStand === "nicht_festgehalten") {
      punkte.push({ art: "hinweis", text: t("belege.regelstand.nicht_festgehalten") });
    }
  }
  if (body?.type === "result") {
    // Ein Ergebnis wird nach der Fassung seiner Entscheidung geprüft; das kann nur die Kette.
    punkte.push({ art: "hinweis", text: t("belege.einzel.ergebnis_kette") });
  }
  punkte.push({ art: "hinweis", text: t("belege.einzel.hinweis_kette") });
  punkte.push(quellePunkt(quelle));

  const fehler = checks.some((c) => c.status === "fehler") || !schluesselAusKette || !nachfolgerOk;
  if (fehler) {
    const grund = checks.some((c) => c.status === "fehler")
      ? grundText(checks)
      : !schluesselAusKette
        ? t("belege.grund.schluessel")
        : t("belege.grund.kette");
    return { stufe: "ungueltig", titel: t("belege.einzel.ungueltig", { grund }), punkte, quelle };
  }
  if (entscheidung?.status === "nicht_pruefbar") {
    return {
      stufe: "nicht_pruefbar",
      titel: t("belege.einzel.nicht_pruefbar"),
      punkte,
      quelle,
    };
  }
  if (!beglaubigt) {
    return { stufe: "gebrochen", titel: t("belege.einzel.gebrochen"), punkte, quelle };
  }
  return { stufe: "gueltig", titel: t("belege.einzel.gueltig"), punkte, quelle };
}

// ---------------------------------------------------------------------------------------------
// Stand einer Zeile der Liste nach einer Prüfung der Kette

export interface ZeilenStand {
  text: string;
  art: "ok" | "warn" | "fehler" | "neutral";
  geprueft: boolean;
}

/** Was die Liste für einen Beleg anzeigt, nachdem (oder bevor) die Kette geprüft wurde. */
export function zeilenStand(seq: number, ergebnis: KettenErgebnis | undefined): ZeilenStand {
  if (ergebnis === undefined || ergebnis.kopfSeq === undefined || seq > ergebnis.kopfSeq) {
    return { text: t("belege.zeile.offen"), art: "neutral", geprueft: false };
  }
  if (ergebnis.fehlerSeq !== undefined) {
    if (seq === ergebnis.fehlerSeq) {
      return { text: t("belege.zeile.fehler"), art: "fehler", geprueft: true };
    }
    if (seq > ergebnis.fehlerSeq) {
      return { text: t("belege.zeile.unbestaetigt"), art: "warn", geprueft: true };
    }
  }
  if (ergebnis.nichtBeglaubigtAb !== undefined && seq >= ergebnis.nichtBeglaubigtAb) {
    return { text: t("belege.zeile.nicht_beglaubigt"), art: "warn", geprueft: true };
  }
  if (
    (ergebnis.stufe === "ungueltig" && ergebnis.fehlerSeq === undefined) ||
    ergebnis.stufe === "nicht_pruefbar"
  ) {
    return { text: t("belege.zeile.unbestaetigt"), art: "warn", geprueft: true };
  }
  return { text: t("belege.zeile.geprueft"), art: "ok", geprueft: true };
}
