/**
 * PaiBot – Ansicht eines Fadens: Seitenleiste, Gespräch mit Kopf, Faden-Leiste und Eingabe zusammengesetzt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./Ansicht.module.css";
import { AvatarStapel, BotAvatar } from "./BotAvatar";
import { AufrufLeiste, type EingabeBot, type EingabeSteuerung, FadenEingabe } from "./Eingabe";
import { erwaehnungAnhaengen } from "./erwaehnung";
import {
  alleZiele,
  type FilterWahl,
  filtereGespraech,
  kopfForm,
  zaehleAnMich,
  zaehleBeitraege,
} from "./funktionen";
import { FadenFilter, FadenGespraech, FilterLeer } from "./Gespraech";
import { FadenKopf, leseGemerkt, schreibeGemerkt } from "./Kopf";
import { FadenLeiste } from "./Leiste";
import { FadenSeitenleiste } from "./Seitenleiste";
import { Sym } from "./symbole";
import { reinerText, sauberName } from "./text";
import type {
  FadenBot,
  FadenKopfDaten,
  GespraechsEintrag,
  LeistenDaten,
  SeitenleisteDaten,
  VorschlagWahl,
} from "./typen";

export interface FadenSzene {
  /** Kennung des Fadens; unter ihr merkt der Browser Kopf und Leiste. */
  id: string;
  teamName: string;
  /** Kennung der Leitung (für „Ohne @ antwortet …“). */
  leitung: string;
  bots: Readonly<Record<string, FadenBot>>;
  seitenleiste: SeitenleisteDaten;
  /** Ohne Kopf: Zustand „leer“, es gibt noch kein Team. */
  kopf?: FadenKopfDaten;
  leiste?: LeistenDaten;
  gespraech: readonly GespraechsEintrag[];
  /** Bots für „@“ und „Aufrufen“. */
  eingabeBots: readonly EingabeBot[];
  /** Pai kennt den Faden mit („auch bei Pai sichtbar“). */
  sichtbarBeiPai?: boolean;
  /** Anzahl der Mitglieder im Team und Namen der Beteiligten (für die Zeile unter dem Titel). */
  mitglieder?: number;
  beteiligt?: number;
  /** Not-Aus: alle Bots angehalten. */
  halt?: boolean;
  /** Beschriftung der Leiste „Aufrufen:“ oder „Beteiligt:“. */
  aufrufText?: string;
  /** Nur im Zustand „leer“: eine Vorlage, die der Besitzer anlegen kann (Name, Beschreibung, Bots). */
  vorlage?: { name: string; text: string; bots: string[] };
}

export interface FadenAnsichtProps {
  szene: FadenSzene;
  /** Gesendeter Text; die Ansicht sendet nie von selbst, nur wenn der Besitzer abschickt. */
  onSenden?: (text: string) => void;
  onStabNehmen?: () => void;
  onAnhalten?: () => void;
  onFortsetzen?: () => void;
  onVorschlag?: (wahl: VorschlagWahl) => void;
  onZuschlag?: () => void;
  onGrenzenWahl?: (id: string) => void;
  onNeuesTeam?: () => void;
  onTeamAusVorlage?: () => void;
  onTeamSelbst?: () => void;
  /** Gespeicherter Start: Kopf und Leiste nicht aus dem Browser lesen. */
  ohneMerken?: boolean;
}

function Baum({ pai }: { pai: FadenBot | undefined }) {
  return (
    <div className={styles.baum} aria-hidden="true">
      <svg
        aria-hidden="true"
        viewBox="0 0 300 150"
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth="1.2"
        strokeDasharray="3 3"
      >
        <path d="M150 62 V76 M60 76 H240 M60 76 V96 M150 76 V96 M240 76 V96" />
      </svg>
      <div className={styles.knoten} style={{ left: 120, top: 0 }}>
        {pai && (
          <BotAvatar
            farbe={pai.farbe}
            {...(pai.form ? { form: pai.form } : {})}
            groesse={34}
            still
          />
        )}
        <span>Pai</span>
      </div>
      {[
        { x: 30, text: t("faden.leer.leitung"), form: "quadrat" },
        { x: 120, text: t("faden.leer.mitglied"), form: "kreis" },
        { x: 210, text: t("faden.leer.mitglied"), form: "raute" },
      ].map((k) => (
        <div key={k.x} className={styles.knoten} style={{ left: k.x, top: 96 }}>
          <span className={styles.geist} data-form={k.form} />
          {k.text}
        </div>
      ))}
    </div>
  );
}

/**
 * Die ganze Ansicht eines Fadens mit Beispiel- oder Server-Daten. Hier laufen die Regeln für
 * Schwellen, Umschalter und Vorschläge zusammen: Kopf und Leiste starten ab fünf Zielen oder
 * sechs Beteiligten schmal beziehungsweise offen; ein Antwort-Vorschlag setzt nur Text ins Feld.
 */
export function FadenAnsicht({
  szene,
  onSenden,
  onStabNehmen,
  onAnhalten,
  onFortsetzen,
  onVorschlag,
  onZuschlag,
  onGrenzenWahl,
  onNeuesTeam,
  onTeamAusVorlage,
  onTeamSelbst,
  ohneMerken = false,
}: FadenAnsichtProps) {
  const { kopf, leiste, bots } = szene;
  const ziele = kopf ? alleZiele(kopf.etappen).length : 0;
  const form = kopfForm({ ziele, beteiligte: kopf?.beteiligte ?? 0 });
  const [filter, setFilter] = useState<FilterWahl>("alles");
  const [text, setText] = useState("");
  const [leisteOffen, setLeisteOffen] = useState(form.leisteOffen);
  const [menue, setMenue] = useState(false);
  const eingabe = useRef<EingabeSteuerung>(null);
  const verlauf = useRef<HTMLDivElement>(null);
  const leistenId = useId();
  const merk = `paibot.faden.${szene.id}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: nur beim Wechsel des Fadens lesen
  useEffect(() => {
    setLeisteOffen(form.leisteOffen);
    if (ohneMerken) return;
    const gemerkt = leseGemerkt(`${merk}.leiste`);
    if (gemerkt !== null) setLeisteOffen(!gemerkt);
  }, [szene.id]);

  // Neue Beiträge: ans Ende springen (bei „weniger Bewegung“ ohne weiches Scrollen).
  // biome-ignore lint/correctness/useExhaustiveDependencies: nur bei neuen Einträgen
  useEffect(() => {
    const el = verlauf.current;
    if (!el) return;
    const ruhig = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: ruhig ? "auto" : "smooth" });
  }, [szene.gespraech.length, szene.id]);

  const leiteLeiste = (offen: boolean) => {
    setLeisteOffen(offen);
    if (!ohneMerken) schreibeGemerkt(`${merk}.leiste`, !offen);
  };

  const vorschlag = (wahl: VorschlagWahl) => {
    // Nur ins Feld: abgeschickt wird erst, wenn der Besitzer es selbst tut.
    setText(wahl.text);
    eingabe.current?.fokus();
    onVorschlag?.(wahl);
  };

  const sichtbar = filtereGespraech(szene.gespraech, filter);
  const anMich = zaehleAnMich(szene.gespraech);
  const leitung = bots[szene.leitung];
  const leitungName = sauberName(leitung?.name);
  const hatFaden = kopf !== undefined;
  const aufruf = szene.eingabeBots.map((b) => b);
  const mitLeiste = hatFaden && leiste !== undefined;
  const kopfzeile =
    szene.mitglieder && szene.beteiligt && szene.mitglieder >= 6
      ? t("faden.kopfzeile.gross", {
          team: sauberName(szene.teamName),
          anzahl: szene.mitglieder,
          beteiligt: szene.beteiligt,
        })
      : t("faden.kopfzeile.faden", { team: sauberName(szene.teamName) });

  return (
    <div
      className={styles.app}
      data-baustein="ansicht"
      data-leiste={mitLeiste && leisteOffen ? "true" : "false"}
      data-menue={menue ? "true" : "false"}
    >
      <div className={styles.seitenUmschlag}>
        <FadenSeitenleiste
          daten={szene.seitenleiste}
          bots={bots}
          {...(kopf ? { aktivFaden: kopf.id } : {})}
          {...(onFortsetzen ? { onFortsetzen } : {})}
          {...(onAnhalten ? { onNotAus: onAnhalten } : {})}
          {...(onNeuesTeam ? { onNeuesTeam } : {})}
        />
      </div>
      {menue && (
        <button
          type="button"
          className={styles.schleier}
          aria-label={t("faden.kopfzeile.menue")}
          onClick={() => setMenue(false)}
          tabIndex={-1}
        />
      )}

      <div className={styles.haupt} data-baustein="haupt">
        <header className={styles.kopfleiste}>
          <button
            type="button"
            className={styles.menue}
            aria-label={t("faden.kopfzeile.menue")}
            aria-expanded={menue}
            onClick={() => setMenue(!menue)}
          >
            <Sym name="menue" groesse={20} />
          </button>
          {(hatFaden ? leitung : bots.pai) && (
            <BotAvatar
              farbe={(hatFaden ? leitung : bots.pai)?.farbe ?? "limette"}
              {...((hatFaden ? leitung : bots.pai)?.form
                ? { form: (hatFaden ? leitung : bots.pai)?.form }
                : {})}
              groesse={hatFaden ? 32 : 28}
              zustand={szene.halt ? "angehalten" : "ruhig"}
              still
            />
          )}
          <div className={styles.titelBlock}>
            <h1>{hatFaden && kopf ? reinerText(kopf.titel, 120) : t("faden.leer.kopf")}</h1>
            <div className={styles.unterzeile}>{hatFaden ? kopfzeile : t("faden.leer.unter")}</div>
          </div>
          {hatFaden && szene.sichtbarBeiPai && (
            <span className={styles.chip}>
              <span aria-hidden="true">
                {bots.pai && <BotAvatar farbe={bots.pai.farbe} groesse={18} still />}
              </span>
              {t("faden.kopfzeile.pai")}
            </span>
          )}
          {mitLeiste && (
            <button
              type="button"
              className={styles.leistenKnopf}
              aria-expanded={leisteOffen}
              aria-controls={leistenId}
              onClick={() => leiteLeiste(!leisteOffen)}
            >
              <Sym name="liste" groesse={15} />
              {t("faden.leiste.zeigen")}
            </button>
          )}
        </header>

        {hatFaden && kopf ? (
          <>
            <div className={styles.verlauf} ref={verlauf} data-baustein="verlauf">
              <div className={styles.oben}>
                <FadenKopf
                  key={kopf.id}
                  daten={kopf}
                  bots={bots}
                  {...(ohneMerken ? {} : { merkSchluessel: `${merk}.kopf` })}
                  mitSteuerung={form.gross ? !leisteOffen : true}
                  {...(onStabNehmen ? { onStabNehmen } : {})}
                  {...(onAnhalten ? { onAnhalten } : {})}
                  {...(onFortsetzen ? { onFortsetzen } : {})}
                  onVorschlag={vorschlag}
                  onSelbst={() => eingabe.current?.fokus()}
                />
                {(form.gross || szene.gespraech.length > 12) && (
                  <FadenFilter
                    wahl={filter}
                    onWahl={setFilter}
                    anMich={anMich}
                    zaehler={zaehleBeitraege(szene.gespraech)}
                  />
                )}
              </div>
              <div className={styles.gespraech}>
                {filter === "an_mich" && sichtbar.length === 0 && <FilterLeer />}
                <FadenGespraech
                  eintraege={sichtbar}
                  bots={bots}
                  {...(onZuschlag ? { onZuschlag } : {})}
                  {...(onGrenzenWahl ? { onGrenzenWahl } : {})}
                  {...(onFortsetzen ? { onFortsetzen } : {})}
                />
              </div>
            </div>
            <div className={styles.eingabeZone} data-leiste={mitLeiste ? "true" : undefined}>
              <FadenEingabe
                ref={eingabe}
                bots={szene.eingabeBots}
                leitung={leitungName}
                wert={text}
                onWert={setText}
                onSenden={(x) => {
                  onSenden?.(x);
                }}
                deaktiviert={Boolean(szene.halt)}
                davor={
                  szene.halt ? null : (
                    <AufrufLeiste
                      bots={aufruf}
                      beschriftung={szene.aufrufText ?? t("faden.eingabe.aufrufen")}
                      onAufrufen={(b) => {
                        setText((alt) => erwaehnungAnhaengen(alt, sauberName(b.name)));
                        eingabe.current?.fokus();
                      }}
                    />
                  )
                }
              />
            </div>
          </>
        ) : (
          <>
            <div className={styles.verlauf}>
              <div className={styles.leer} data-baustein="leer">
                <Baum pai={bots.pai} />
                <h2>{t("faden.leer.titel")}</h2>
                <p>{t("faden.leer.text")}</p>
                <div className={styles.leerKnoepfe}>
                  <button
                    type="button"
                    className={styles.knopf}
                    onClick={() => (onTeamAusVorlage ?? onNeuesTeam)?.()}
                  >
                    <Sym name="plus" groesse={14} />
                    {t("faden.leer.vorlage")}
                  </button>
                  <button
                    type="button"
                    className={styles.knopfLeise}
                    onClick={() => (onTeamSelbst ?? onNeuesTeam)?.()}
                  >
                    {t("faden.leer.selbst")}
                  </button>
                </div>
                {szene.vorlage && (
                  <div className={styles.vorlage}>
                    <AvatarStapel
                      bots={szene.vorlage.bots.flatMap((id) =>
                        bots[id] ? [bots[id] as FadenBot] : [],
                      )}
                      groesse={22}
                      ueberlappung={6}
                    />
                    {t("faden.leer.vorlage_chip", {
                      name: sauberName(szene.vorlage.name),
                      text: reinerText(szene.vorlage.text, 80),
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.eingabeZone}>
              <FadenEingabe
                ref={eingabe}
                bots={[]}
                leitung="Pai"
                wert={text}
                onWert={setText}
                onSenden={(x) => onSenden?.(x)}
                platzhalter={t("faden.leer.platzhalter")}
                hinweis={t("faden.leer.hinweis")}
              />
            </div>
          </>
        )}
      </div>

      {mitLeiste && kopf && leiste && (
        <FadenLeiste
          id={leistenId}
          daten={leiste}
          bots={bots}
          stand={kopf.stand}
          budget={kopf.budget}
          tiefe={kopf.tiefe}
          offen={leisteOffen}
          onOffen={leiteLeiste}
          {...(onStabNehmen ? { onStabNehmen } : {})}
          {...(onAnhalten ? { onAnhalten } : {})}
          {...(onFortsetzen ? { onFortsetzen } : {})}
          onVorschlag={vorschlag}
          onSelbst={() => eingabe.current?.fokus()}
        />
      )}
    </div>
  );
}
