/**
 * PaiBot – Ansicht „Belege“ im Browser: Liste mit Nachladen und Filter, „Ganze Kette prüfen“ im
 * Browser mit Fortschritt, Anker kopieren, sichern und zum Prüfen einfügen, Export.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { ChainAnchor, PublicKeyInfo, ReceiptEntry } from "@paibot/shared/belege";
import { t } from "@paibot/shared/texte";
import {
  AnkerKasten,
  Button,
  EmptyState,
  PruefUrteil,
  ScrollBereich,
  StatusChip,
  TextArea,
} from "@paibot/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import { belegZeile, kennung } from "../../../lib/belege/darstellung";
import { dateiSichern } from "../../../lib/belege/datei";
import {
  ketteStueckweise,
  LadeFehler,
  ladeRegeln,
  ladeServerKette,
} from "../../../lib/belege/laden";
import { BELEG_PFADE, belegeListePfad } from "../../../lib/belege/pfade";
import { kannImBrowserPruefen, prueferLaden } from "../../../lib/belege/pruefer-laden";
import { type KettenErgebnis, pruefeKette, zeilenStand } from "../../../lib/belege/pruefung";
import styles from "./belege.module.css";

export interface BelegeAnsichtProps {
  start: { items: ReceiptEntry[]; nextBefore?: number };
  seiteGroesse: number;
  /** Nummer des letzten Belegs (= Anzahl der Belege). */
  gesamt: number;
  zeitzone: string;
  jetzt: string;
  botNamen: Record<string, string>;
  /** Aktueller Anker als Text (fehlt bei leerer Kette). */
  anker?: string;
}

type KettenZustand =
  | { art: "bereit" }
  | { art: "laeuft"; geladen: number; gesamt: number }
  | { art: "fertig"; ergebnis: KettenErgebnis; hinweis?: string }
  | { art: "fehler"; text: string; ausweg?: string };

interface ExportAntwort {
  dateiname: string;
  inhalt: string;
  eintraege: number;
  belege: { entscheidung: { id: string; seq: number }; ergebnis: { id: string; seq: number } };
}

type ExportZustand =
  | { art: "bereit" }
  | { art: "laeuft" }
  | { art: "fertig"; antwort: Omit<ExportAntwort, "inhalt"> }
  | { art: "fehler"; text: string };

type Von = "alle" | "bot" | "besitzer";
type StatusFilter = "alle" | "geprueft" | "offen";

function fehlerText(fehler: unknown): { text: string; ausweg?: string } {
  if (fehler instanceof LadeFehler) {
    return { text: fehler.message, ...(fehler.ausweg ? { ausweg: fehler.ausweg } : {}) };
  }
  return { text: t("fehler.intern"), ausweg: t("fehler.intern.ausweg") };
}

export function BelegeAnsicht(props: BelegeAnsichtProps) {
  const [eintraege, setEintraege] = useState<ReceiptEntry[]>(props.start.items);
  const [naechste, setNaechste] = useState<number | undefined>(props.start.nextBefore);
  const [gesamt, setGesamt] = useState(props.gesamt);
  const [laedtMehr, setLaedtMehr] = useState(false);
  const [listenFehler, setListenFehler] = useState<string | undefined>();
  const [kette, setKette] = useState<KettenZustand>({ art: "bereit" });
  const [von, setVon] = useState<Von>("alle");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("alle");
  const [ankerText, setAnkerText] = useState("");
  const [ankerFehler, setAnkerFehler] = useState<string | undefined>();
  const [exportZustand, setExportZustand] = useState<ExportZustand>({ art: "bereit" });

  const jetzt = useMemo(() => new Date(props.jetzt), [props.jetzt]);
  const ergebnis = kette.art === "fertig" ? kette.ergebnis : undefined;
  const zeilen = useMemo(
    () =>
      eintraege.map((e) => {
        const zeile = belegZeile(e, { zeitzone: props.zeitzone, jetzt, botNamen: props.botNamen });
        return { ...zeile, stand: zeilenStand(e.seq, ergebnis) };
      }),
    [eintraege, props.zeitzone, jetzt, props.botNamen, ergebnis],
  );
  const sichtbar = zeilen.filter(
    (z) =>
      (von === "alle" || z.von === von) &&
      (statusFilter === "alle" || (statusFilter === "geprueft") === z.stand.geprueft),
  );

  async function mehrLaden() {
    if (naechste === undefined) return;
    setLaedtMehr(true);
    setListenFehler(undefined);
    const antwort = await apiFetch<{ items: ReceiptEntry[]; nextBefore?: number }>(
      "GET",
      belegeListePfad({ before: naechste, limit: props.seiteGroesse }),
    );
    setLaedtMehr(false);
    if (!antwort.ok) {
      setListenFehler(antwort.fehler.text);
      return;
    }
    setEintraege((alt) => [...alt, ...antwort.daten.items]);
    setNaechste(antwort.daten.nextBefore);
  }

  async function ersteSeiteNeu() {
    const antwort = await apiFetch<{ items: ReceiptEntry[]; nextBefore?: number }>(
      "GET",
      belegeListePfad({ limit: props.seiteGroesse }),
    );
    if (!antwort.ok) return;
    setEintraege(antwort.daten.items);
    setNaechste(antwort.daten.nextBefore);
    setGesamt(antwort.daten.items[0]?.seq ?? gesamt);
  }

  async function kettePruefen(anker?: ChainAnchor) {
    setKette({ art: "laeuft", geladen: 0, gesamt });
    try {
      if (!(await kannImBrowserPruefen())) {
        const { ergebnis: vomServer } = await ladeServerKette();
        setKette({
          art: "fertig",
          ergebnis: vomServer,
          ...(anker === undefined ? {} : { hinweis: t("belege.anker.nur_browser") }),
        });
        return;
      }
      const [{ pruefer }, regeln] = await Promise.all([prueferLaden(), ladeRegeln()]);
      const kopfSchluessel: PublicKeyInfo[] = [];
      const neu = await pruefeKette(
        ketteStueckweise(
          (stand) => setKette({ art: "laeuft", geladen: stand.geladen, gesamt: stand.gesamt }),
          (schluessel) => kopfSchluessel.push(...schluessel),
        ),
        { regeln, publicKeys: kopfSchluessel, ...(anker === undefined ? {} : { anker }) },
        pruefer,
      );
      setKette({ art: "fertig", ergebnis: neu });
    } catch (fehler) {
      setKette({ art: "fehler", ...fehlerText(fehler) });
    }
  }

  async function mitAnkerPruefen() {
    setAnkerFehler(undefined);
    let anker: ChainAnchor;
    try {
      const { ankerLesen } = await prueferLaden();
      anker = ankerLesen(ankerText);
    } catch {
      setAnkerFehler(t("belege.anker.ungueltig"));
      return;
    }
    await kettePruefen(anker);
  }

  async function ankerDatei(datei: File | undefined) {
    if (datei === undefined) return;
    setAnkerFehler(undefined);
    try {
      setAnkerText((await datei.text()).slice(0, 4000));
    } catch {
      setAnkerFehler(t("belege.anker.datei_fehler"));
    }
  }

  async function exportieren() {
    setExportZustand({ art: "laeuft" });
    const antwort = await apiFetch<ExportAntwort>("POST", BELEG_PFADE.belegeExport);
    if (!antwort.ok) {
      setExportZustand({ art: "fehler", text: antwort.fehler.text });
      return;
    }
    const { inhalt, ...rest } = antwort.daten;
    dateiSichern(rest.dateiname, inhalt, "application/x-ndjson");
    setExportZustand({ art: "fertig", antwort: rest });
    await ersteSeiteNeu();
  }

  const geprueft = ergebnis?.geprueft;

  return (
    <ScrollBereich className={styles.seite} label={t("seite.belege")}>
      <div className={styles.spalte}>
        <header className={styles.kopf}>
          <h1>{t("seite.belege")}</h1>
          {gesamt > 0 && (
            <Button
              art="primaer"
              laedt={kette.art === "laeuft"}
              onClick={() => void kettePruefen()}
            >
              {t("belege.kette_pruefen")}
            </Button>
          )}
        </header>
        <p className={styles.vorspann}>{t("belege.seite.vorspann")}</p>

        {gesamt === 0 ? (
          <EmptyState titel={t("belege.leer.titel")} text={t("belege.leer.text")} />
        ) : (
          <div className={styles.raster}>
            <div className={styles.haupt}>
              <div className={styles.zusammenfassung}>
                <div>
                  <span>{t("belege.summe.anzahl")}</span>
                  <strong className={styles.zahl}>{gesamt}</strong>
                </div>
                <div>
                  <span>{t("belege.summe.geprueft")}</span>
                  <strong className={styles.zahl}>
                    {geprueft === undefined ? t("belege.summe.noch_nicht") : geprueft}
                  </strong>
                </div>
                <div>
                  <span>{t("belege.summe.kette")}</span>
                  <strong className={styles.zahl}>
                    {t("belege.summe.von_bis", { von: kennung(1), bis: kennung(gesamt) })}
                  </strong>
                </div>
              </div>

              {kette.art === "laeuft" && (
                <PruefUrteil
                  zustand="laeuft"
                  titel={t("belege.kette.laeuft")}
                  fortschritt={{
                    wert: kette.geladen,
                    gesamt: kette.gesamt,
                    text: t("belege.kette.fortschritt", {
                      geladen: kette.geladen,
                      gesamt: kette.gesamt,
                    }),
                  }}
                />
              )}
              {kette.art === "fertig" && (
                <PruefUrteil
                  zustand={kette.ergebnis.stufe}
                  titel={kette.ergebnis.titel}
                  punkte={[
                    ...kette.ergebnis.punkte,
                    ...(kette.hinweis ? [{ art: "hinweis" as const, text: kette.hinweis }] : []),
                  ]}
                  {...(kette.ergebnis.quelle === "server" ? { quelle: t("pruefung.server") } : {})}
                />
              )}
              {kette.art === "fehler" && (
                <PruefUrteil
                  zustand="ungueltig"
                  titel={t("belege.kette.fehler", { text: kette.text })}
                  punkte={kette.ausweg ? [{ art: "hinweis", text: kette.ausweg }] : []}
                />
              )}

              <div className={styles.filter}>
                <fieldset className={styles.seg} aria-label={t("belege.filter.von")}>
                  {(["alle", "bot", "besitzer"] as const).map((wert) => (
                    <button
                      key={wert}
                      type="button"
                      aria-pressed={von === wert}
                      onClick={() => setVon(wert)}
                    >
                      {t(`belege.filter.von.${wert}`)}
                    </button>
                  ))}
                </fieldset>
                <select
                  id="belege-status"
                  className={styles.auswahl}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  aria-label={t("belege.filter.status")}
                >
                  <option value="alle">{t("belege.filter.status.alle")}</option>
                  <option value="geprueft">{t("belege.filter.status.geprueft")}</option>
                  <option value="offen">{t("belege.filter.status.offen")}</option>
                </select>
              </div>

              {sichtbar.length === 0 ? (
                <EmptyState
                  titel={t("belege.filter.leer.titel")}
                  text={t("belege.filter.leer.text")}
                  aktion={
                    <Button
                      onClick={() => {
                        setVon("alle");
                        setStatusFilter("alle");
                      }}
                    >
                      {t("belege.filter.zuruecksetzen")}
                    </Button>
                  }
                />
              ) : (
                <div className={styles.liste}>
                  <div className={styles.listeKopf} aria-hidden="true">
                    <span>{t("belege.spalte.zeit")}</span>
                    <span>{t("belege.spalte.kennung")}</span>
                    <span>{t("belege.spalte.von")}</span>
                    <span>{t("belege.spalte.aktion")}</span>
                    <span>{t("belege.spalte.ergebnis")}</span>
                    <span>{t("belege.spalte.pruefung")}</span>
                  </div>
                  <ul aria-label={t("belege.liste.label")}>
                    {sichtbar.map((z) => (
                      <li key={z.id}>
                        <Link
                          href={`/belege/${encodeURIComponent(z.id)}`}
                          prefetch={false}
                          className={styles.zeileLink}
                          aria-label={t("belege.zeile.label", {
                            kennung: z.kennung,
                            was: z.was,
                            ergebnis: z.ergebnis.text,
                            stand: z.stand.text,
                          })}
                        >
                          <span className={`${styles.zahl} ${styles.spalteBreit}`}>{z.zeit}</span>
                          <span className={`${styles.mono} ${styles.spalteBreit}`}>
                            {z.kennung}
                          </span>
                          <span className={styles.spalteBreit}>{z.wer}</span>
                          <span className={styles.was}>
                            <span>{z.was}</span>
                            <span className={`${styles.leise} ${styles.klein}`}>
                              {z.artText}
                              {z.regel ? ` · ${z.regel}` : ""}
                            </span>
                          </span>
                          <span className={styles.spalteBreit}>
                            <StatusChip art={z.ergebnis.art}>{z.ergebnis.text}</StatusChip>
                          </span>
                          <span>
                            <StatusChip art={z.stand.art}>{z.stand.text}</StatusChip>
                          </span>
                          <span className={styles.metaMobil} aria-hidden="true">
                            <span className={styles.zahl}>{z.zeit}</span>
                            <span className={styles.mono}>{z.kennung}</span>
                            <span>{z.wer}</span>
                            <span>{z.ergebnis.text}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {naechste !== undefined && (
                    <div className={styles.mehr}>
                      <Button art="leise" laedt={laedtMehr} onClick={() => void mehrLaden()}>
                        {t("belege.mehr_laden")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {listenFehler && (
                <p className={styles.leise} role="alert">
                  {listenFehler}
                </p>
              )}
            </div>

            <aside className={styles.seitlich} aria-label={t("belege.seitlich.label")}>
              <AnkerKasten
                titel={t("belege.anker.kasten.titel")}
                erklaerung={
                  <>
                    <p>{t("belege.anker.hinweis")}</p>
                    <p>{t("belege.anker.ausgetauscht")}</p>
                  </>
                }
                {...(props.anker === undefined ? {} : { anker: props.anker })}
                texte={{
                  kopieren: t("belege.anker.kopieren"),
                  kopiert: t("belege.anker.kopiert"),
                  kopierenFehler: t("belege.anker.kopieren_fehler"),
                  sichern: t("belege.anker.sichern"),
                  leer: t("belege.anker.leer"),
                  ankerLabel: t("belege.anker.titel"),
                }}
                onSichern={
                  props.anker === undefined
                    ? undefined
                    : () => dateiSichern("pb-anker.json", `${props.anker}\n`, "application/json")
                }
              >
                <div className={styles.ankerFeld}>
                  <TextArea
                    label={t("belege.anker.eigener.label")}
                    hilfe={t("belege.anker.eigener.hilfe")}
                    rows={3}
                    spellCheck={false}
                    value={ankerText}
                    onChange={(e) => setAnkerText(e.target.value)}
                    {...(ankerFehler ? { fehler: ankerFehler } : {})}
                  />
                  <label className={styles.dateiKnopf}>
                    <input
                      className={styles.dateiVersteckt}
                      type="file"
                      accept=".json,application/json,text/plain"
                      onChange={(e) => void ankerDatei(e.target.files?.[0])}
                    />
                    <span>{t("belege.anker.eigener.datei")}</span>
                  </label>
                  <div className={styles.reihe}>
                    <Button
                      art="zweit"
                      disabled={ankerText.trim() === "" || kette.art === "laeuft"}
                      onClick={() => void mitAnkerPruefen()}
                    >
                      {t("belege.anker.eigener.pruefen")}
                    </Button>
                  </div>
                </div>
              </AnkerKasten>

              <section className={styles.abschnitt} aria-labelledby="belege-export-titel">
                <h2 id="belege-export-titel">{t("belege.export.titel")}</h2>
                <p>{t("belege.export.text")}</p>
                <div className={styles.reihe}>
                  <Button
                    art="zweit"
                    laedt={exportZustand.art === "laeuft"}
                    onClick={() => void exportieren()}
                  >
                    {t("belege.exportieren")}
                  </Button>
                </div>
                <div role="status" aria-live="polite">
                  {exportZustand.art === "fertig" && (
                    <p>
                      {t("belege.export.fertig", {
                        datei: exportZustand.antwort.dateiname,
                        anzahl: exportZustand.antwort.eintraege,
                      })}{" "}
                      {t("belege.export.eigene_belege")}{" "}
                      <Link
                        className={styles.link}
                        prefetch={false}
                        href={`/belege/${encodeURIComponent(exportZustand.antwort.belege.entscheidung.id)}`}
                      >
                        {kennung(exportZustand.antwort.belege.entscheidung.seq)}
                      </Link>{" "}
                      {t("belege.export.und")}{" "}
                      <Link
                        className={styles.link}
                        prefetch={false}
                        href={`/belege/${encodeURIComponent(exportZustand.antwort.belege.ergebnis.id)}`}
                      >
                        {kennung(exportZustand.antwort.belege.ergebnis.seq)}
                      </Link>
                    </p>
                  )}
                  {exportZustand.art === "fehler" && <p role="alert">{exportZustand.text}</p>}
                </div>
                <p>{t("belege.export.befehl")}</p>
                <code className={styles.mono}>
                  pnpm belege:pruefen paibot-belege.jsonl --anker pb-anker.json
                </code>
              </section>

              <section className={styles.abschnitt} aria-labelledby="belege-regeln-titel">
                <h2 id="belege-regeln-titel">{t("belege.regeln.titel")}</h2>
                <p>{t("belege.regeln.text")}</p>
                <Link className={styles.link} prefetch={false} href="/regeln">
                  {t("belege.regeln.link")}
                </Link>
              </section>
            </aside>
          </div>
        )}
      </div>
    </ScrollBereich>
  );
}
