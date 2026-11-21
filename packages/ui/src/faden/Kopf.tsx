/**
 * PaiBot – Kopf eines Fadens: Karte mit Ziel, „Fertig, wenn“ und Staffelstab; auf- und zuklappbar.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useEffect, useRef, useState } from "react";
import { NurLesbar } from "../basis/NurLesbar";
import { BelegZeichen } from "./BelegZeichen";
import { BotAvatar } from "./BotAvatar";
import { FragenBand } from "./Fragen";
import { alleZiele, budgetProzent, kopfForm, laufendeEtappe, zielStand } from "./funktionen";
import styles from "./Kopf.module.css";
import { StabBahn, StabVerdichtet } from "./Staffelstab";
import { Sym } from "./symbole";
import { reinerText, sauberName } from "./text";
import type {
  FadenBot,
  FadenKopfDaten,
  FadenStand,
  Lieferstueck,
  VorschlagWahl,
  Ziel,
} from "./typen";

/** Liest, was der Besitzer zuletzt gewählt hat: `true` = zu, `false` = offen, sonst nichts. */
export function leseGemerkt(schluessel: string): boolean | null {
  try {
    const wert = window.localStorage.getItem(schluessel);
    return wert === "zu" ? true : wert === "offen" ? false : null;
  } catch {
    return null;
  }
}

/** Merkt die Wahl nur im Browser; scheitert der Speicher, geht es ohne weiter. */
export function schreibeGemerkt(schluessel: string, zu: boolean): void {
  try {
    window.localStorage.setItem(schluessel, zu ? "zu" : "offen");
  } catch {
    // Speicher gesperrt (privates Fenster, blockierte Daten): der Kopf funktioniert trotzdem.
  }
}

export interface FadenKopfProps {
  daten: FadenKopfDaten;
  bots: Readonly<Record<string, FadenBot>>;
  /** Unter diesem Schlüssel merkt der Browser, ob der Kopf offen oder zu ist. */
  merkSchluessel?: string;
  /** Startzustand statt der Form nach den Schwellen (zum Beispiel für Tests). */
  zuStart?: boolean;
  onZu?: (zu: boolean) => void;
  /** Knöpfe „Stab nehmen“ und „Faden anhalten“ im Kopf zeigen. Ohne Angabe: nur bei kleinen Fäden. */
  mitSteuerung?: boolean;
  onStabNehmen?: () => void;
  onAnhalten?: () => void;
  onFortsetzen?: () => void;
  onVorschlag?: (wahl: VorschlagWahl) => void;
  onSelbst?: () => void;
  /** „Öffnen“ an einem Stück der Ergebnis-Karte. */
  onOeffnen?: (id: string) => void;
}

function standArt(stand: FadenStand): "ok" | "warn" | undefined {
  if (stand === "fertig") return "ok";
  if (stand === "wartet_auf_dich" || stand === "grenze") return "warn";
  return undefined;
}

function Haken({ stand }: { stand: Ziel["stand"] }) {
  return (
    <span className={styles.haken} aria-hidden="true">
      {stand === "erledigt" && <Sym name="haken" groesse={9} />}
    </span>
  );
}

function Balken({ prozent }: { prozent: number }) {
  const p = budgetProzent(prozent);
  return (
    <span className={styles.balken} data-voll={p >= 100 ? "true" : undefined} aria-hidden="true">
      <i style={{ width: `${p}%` }} />
    </span>
  );
}

function Tiefe({ an, max }: { an: number; max: number }) {
  return (
    <span className={styles.tiefe} aria-hidden="true">
      {Array.from({ length: Math.max(0, max) }, (_, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihe von Kästchen
          key={i}
          data-an={i < an ? "true" : undefined}
          data-voll={an >= max ? "true" : undefined}
        />
      ))}
    </span>
  );
}

/** Zeile mit Budget und Tiefe; auch in der Leiste benutzt. */
export function BudgetZeile({
  prozent,
  an,
  max,
  mitTiefe = true,
}: {
  prozent: number;
  an: number;
  max: number;
  mitTiefe?: boolean;
}) {
  const p = budgetProzent(prozent);
  return (
    <div className={styles.zahlen}>
      <span className={styles.mess}>
        {t("faden.kopf.budget")}
        <Balken prozent={p} />
        <span>{p} %</span>
      </span>
      {mitTiefe && (
        <span className={`${styles.mess} ${styles.handyWeg}`}>
          {t("faden.kopf.tiefe")}
          <Tiefe an={an} max={max} />
          <span>{t("faden.kopf.tiefe_wert", { an, max })}</span>
        </span>
      )}
    </div>
  );
}

function Lieferkachel({ symbol }: { symbol: Lieferstueck["symbol"] }) {
  if (symbol === "plakat")
    return <span className={`${styles.kachel} ${styles.plakat}`} aria-hidden="true" />;
  return (
    <span className={styles.kachel} aria-hidden="true">
      <Sym name={symbol === "auge" ? "auge" : "doku"} groesse={20} />
    </span>
  );
}

function dranWort(daten: FadenKopfDaten): string {
  if (daten.stand === "angehalten") return t("faden.stand.angehalten");
  if (daten.stand === "fertig") return t("faden.stand.fertig");
  const dran = daten.stab
    .filter((p) => p.dran)
    .map((p) => (p.id === "du" ? t("faden.stab.du") : sauberName(p.name)));
  return dran.length > 0
    ? t("faden.kopf.dran", { name: dran.join(", ") })
    : t("faden.kopf.nicht_dran");
}

/**
 * Kopf eines Fadens. Offen: Ziel, „Fertig, wenn“, Staffelstab, Budget und Tiefe. Zu: eine schmale
 * Zeile. Beides lässt sich mit echten Knöpfen wechseln (`aria-expanded`, Enter, Leertaste). Ab
 * fünf Zielen oder sechs Beteiligten startet er als schmale Zeile; was der Besitzer wählt, merkt
 * sich der Browser. Fertig meldet nur der Server: Die Ergebnis-Karte erscheint nur, wenn
 * `stand` auf „fertig“ steht und ein Ergebnis da ist, nie aus Text.
 */
export function FadenKopf({
  daten,
  bots,
  merkSchluessel,
  zuStart,
  onZu,
  mitSteuerung,
  onStabNehmen,
  onAnhalten,
  onFortsetzen,
  onVorschlag,
  onSelbst,
  onOeffnen,
}: FadenKopfProps) {
  const ziele = alleZiele(daten.etappen);
  const form = kopfForm({ ziele: ziele.length, beteiligte: daten.beteiligte });
  const [zu, setZu] = useState(zuStart ?? form.kopfZu);
  const eng = useRef<HTMLButtonElement>(null);
  const griff = useRef<HTMLButtonElement>(null);
  const fokusNach = useRef<"eng" | "griff" | null>(null);

  // Nach dem Laden gilt, was der Besitzer zuletzt gewählt hat (nicht beim ersten Zeichnen,
  // damit Server und Browser dasselbe zeichnen).
  // biome-ignore lint/correctness/useExhaustiveDependencies: nur einmal je Schlüssel lesen
  useEffect(() => {
    if (!merkSchluessel || zuStart !== undefined) return;
    const gemerkt = leseGemerkt(merkSchluessel);
    if (gemerkt !== null) setZu(gemerkt);
  }, [merkSchluessel]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: läuft bei jedem Wechsel von auf und zu
  useEffect(() => {
    if (fokusNach.current === "eng") eng.current?.focus();
    else if (fokusNach.current === "griff") griff.current?.focus();
    fokusNach.current = null;
  }, [zu]);

  const wechsle = (neuZu: boolean, mitTastatur: boolean) => {
    if (mitTastatur) fokusNach.current = neuZu ? "eng" : "griff";
    setZu(neuZu);
    if (merkSchluessel) schreibeGemerkt(merkSchluessel, neuZu);
    onZu?.(neuZu);
  };

  const stand = zielStand(ziele);
  const zielStandText = t("faden.kopf.ziel_stand", stand);
  const fertig = daten.stand === "fertig" && daten.ergebnis !== undefined;
  const titel = reinerText(daten.titel, 200);
  const etappe = laufendeEtappe(daten.etappen);
  const leitung = daten.stab.find((p) => p.fuehrt);
  const leitungBot = leitung ? bots[leitung.id] : undefined;

  if (zu) {
    const titelZu =
      fertig && daten.ergebnis
        ? t("faden.ergebnis.fertig", { titel: reinerText(daten.ergebnis.titel, 120) })
        : titel;
    const dran = dranWort(daten);
    const beschreibung = [
      titelZu,
      zielStandText,
      etappe?.name ? reinerText(etappe.name, 60) : "",
      dran,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <div className={styles.engUmschlag} data-baustein="kopf" data-zu="true">
        <button
          ref={eng}
          type="button"
          className={styles.eng}
          aria-expanded={false}
          aria-label={`${t("faden.kopf.ausklappen")}: ${beschreibung}`}
          onClick={(e) => wechsle(false, e.detail === 0)}
        >
          <Sym name="ziel" groesse={15} />
          <span className={styles.titel}>{titelZu}</span>
          <span className={styles.angabe}>
            <span className={styles.ring} aria-hidden="true">
              {ziele.map((z) => (
                <i key={z.id} data-stand={z.stand} />
              ))}
            </span>
            <b>{zielStandText}</b>
          </span>
          {etappe?.name && !fertig && (
            <>
              <span className={`${styles.trenner} ${styles.handyWeg}`} aria-hidden="true" />
              <span className={`${styles.angabe} ${styles.handyWeg}`}>
                {reinerText(etappe.name, 60)}
              </span>
            </>
          )}
          <span className={styles.trenner} aria-hidden="true" />
          <span className={styles.angabe}>
            {!fertig &&
              daten.stand !== "angehalten" &&
              daten.stab.some((p) => p.dran && p.farbe) && (
                <BotAvatar
                  farbe={daten.stab.find((p) => p.dran && p.farbe)?.farbe ?? "limette"}
                  {...(daten.stab.find((p) => p.dran && p.farbe)?.form
                    ? { form: daten.stab.find((p) => p.dran && p.farbe)?.form }
                    : {})}
                  zustand="ruhig"
                  groesse={20}
                  still
                />
              )}
            {dran}
          </span>
          {!fertig && (
            <>
              <span className={`${styles.trenner} ${styles.handyWeg}`} aria-hidden="true" />
              <span className={`${styles.angabe} ${styles.handyWeg}`}>
                <Balken prozent={daten.budget.prozent} />
                {budgetProzent(daten.budget.prozent)} %
              </span>
            </>
          )}
          <Sym name="unten" groesse={16} />
        </button>
      </div>
    );
  }

  const griffKnopf = (
    <button
      ref={griff}
      type="button"
      className={styles.griff}
      aria-expanded={true}
      aria-label={t("faden.kopf.einklappen")}
      title={t("faden.kopf.einklappen")}
      onClick={(e) => wechsle(true, e.detail === 0)}
    >
      <Sym name="oben" groesse={16} />
    </button>
  );

  if (fertig && daten.ergebnis) {
    const erg = daten.ergebnis;
    return (
      <section
        className={styles.karte}
        aria-label={t("faden.ergebnis.region")}
        data-baustein="kopf"
        data-zu="false"
        data-stand="fertig"
      >
        <div className={styles.ergebnis}>
          <div className={styles.ergebnisKopf}>
            {leitungBot && (
              <BotAvatar
                farbe={leitungBot.farbe}
                {...(leitungBot.form ? { form: leitungBot.form } : {})}
                zustand="fertig"
                groesse={32}
              />
            )}
            <div className={styles.titel}>
              <b>{t("faden.ergebnis.fertig", { titel: reinerText(erg.titel, 120) })}</b>
              <small>{reinerText(erg.untertitel, 200)}</small>
            </div>
            <span className={styles.stand} data-art="ok">
              <Sym name="haken" groesse={12} />
              {t("faden.stand.fertig")}
            </span>
            {griffKnopf}
          </div>
          <ul className={styles.lieferungen}>
            {erg.lieferungen.map((l) => (
              <li key={l.id} className={styles.lieferung}>
                <Lieferkachel symbol={l.symbol} />
                <div className={styles.lieferText}>
                  <b>{reinerText(l.titel, 80)}</b>
                  <small>{reinerText(l.meta, 120)}</small>
                  <div className={styles.lieferAktion}>
                    <button
                      type="button"
                      className={styles.knopf}
                      aria-label={t("faden.ergebnis.oeffnen_label", {
                        titel: reinerText(l.titel, 80),
                      })}
                      onClick={() => onOeffnen?.(l.id)}
                    >
                      {t("faden.ergebnis.oeffnen")}
                    </button>
                    {l.beleg && <BelegZeichen info={l.beleg} />}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.ergebnisFuss}>
          <span>
            <Sym name="beleg" groesse={14} />
            {reinerText(erg.uebergaben, 80)}
          </span>
          <span>
            <BudgetZeile
              prozent={daten.budget.prozent}
              an={daten.tiefe.an}
              max={daten.tiefe.max}
              mitTiefe={false}
            />
          </span>
          {erg.dauer && (
            <span>
              <Sym name="uhr" groesse={14} />
              {reinerText(erg.dauer, 40)}
            </span>
          )}
        </div>
      </section>
    );
  }

  const gross = form.gross;
  const steuerung = mitSteuerung ?? !gross;
  const art = standArt(daten.stand);
  const zielHandy =
    gross && etappe?.name
      ? `${reinerText(etappe.name, 40)} · ${zielStandText}`
      : `${t("faden.kopf.fertig_wenn")} · ${zielStandText}`;

  return (
    <section
      className={styles.karte}
      aria-label={t("faden.kopf.region")}
      data-baustein="kopf"
      data-zu="false"
      data-stand={daten.stand}
    >
      <div className={styles.kopfzeile}>
        <Sym name="ziel" groesse={15} />
        <h2 className={styles.ziel} style={{ margin: 0 }}>
          {titel}
          <small>{t("faden.kopf.abnahme", { name: sauberName(daten.abnahme) })}</small>
        </h2>
        <span className={styles.zielHandy}>{zielHandy}</span>
        <span className={styles.stand} data-art={art}>
          {reinerText(daten.standText, 60)}
        </span>
        <span className={styles.stand} data-rolle="zahl">
          <span aria-hidden="true">{zielStandText}</span>
          <NurLesbar>{t("faden.kopf.ziel_stand_label", stand)}</NurLesbar>
        </span>
        {griffKnopf}
      </div>

      {gross ? (
        <>
          <ul className={styles.etappen} style={{ margin: 0, listStyle: "none" }}>
            {daten.etappen
              .filter((e) => e.name)
              .map((e) => {
                const s = zielStand(e.ziele);
                const erledigt = s.erledigt === s.gesamt && s.gesamt > 0;
                const laufend = e.id === etappe?.id && !erledigt;
                return (
                  <li
                    key={e.id}
                    className={styles.etappe}
                    data-stand={erledigt ? "erledigt" : laufend ? "laufend" : "offen"}
                  >
                    {erledigt && <Sym name="haken" groesse={12} />}
                    {reinerText(e.name, 40)} {s.erledigt}/{s.gesamt}
                  </li>
                );
              })}
          </ul>
          <ul className={styles.zielGitter} aria-label={t("faden.kopf.fertig_wenn")}>
            {(etappe?.ziele ?? []).map((z) => {
              const bot = z.botId ? bots[z.botId] : undefined;
              return (
                <li key={z.id} className={styles.zielZeile} data-stand={z.stand}>
                  <Haken stand={z.stand} />
                  {bot && (
                    <BotAvatar
                      farbe={bot.farbe}
                      {...(bot.form ? { form: bot.form } : {})}
                      zustand="ruhig"
                      groesse={20}
                      still
                    />
                  )}
                  <span className={styles.zielText}>
                    {reinerText(z.text, 120)}
                    {z.hinweis && (
                      <small
                        data-art={
                          z.stand === "laeuft" ? "aktiv" : z.stand === "wartet" ? "warn" : undefined
                        }
                      >
                        {reinerText(z.hinweis, 120)}
                      </small>
                    )}
                    {z.stand === "erledigt" && (
                      <NurLesbar>{` (${t("faden.stand.fertig")})`}</NurLesbar>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className={styles.kriterien}>
          <span className={styles.fertigWenn}>{t("faden.kopf.fertig_wenn")}</span>
          <ul>
            {ziele.map((z) => (
              <li key={z.id} className={styles.krit} data-stand={z.stand}>
                <Haken stand={z.stand} />
                {reinerText(z.text, 80)}
                {z.stand === "erledigt" && <NurLesbar>{` (${t("faden.stand.fertig")})`}</NurLesbar>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.fuss}>
        {gross ? (
          <StabVerdichtet plaetze={daten.stab} weitere={daten.weitere ?? []} />
        ) : (
          <StabBahn plaetze={daten.stab} />
        )}
        <div className={styles.rest}>
          <BudgetZeile
            prozent={daten.budget.prozent}
            an={daten.tiefe.an}
            max={daten.tiefe.max}
            mitTiefe={!gross}
          />
          {steuerung && (
            <div className={styles.knoepfe}>
              <button type="button" className={styles.knopf} onClick={() => onStabNehmen?.()}>
                <Sym name="stab" groesse={14} />
                {t("faden.stab.nehmen")}
              </button>
              {daten.stand === "angehalten" ? (
                <button
                  type="button"
                  className={styles.knopf}
                  data-art="haupt"
                  onClick={() => onFortsetzen?.()}
                >
                  {t("faden.stab.fortsetzen")}
                </button>
              ) : (
                <button type="button" className={styles.knopf} onClick={() => onAnhalten?.()}>
                  <Sym name="pause" groesse={14} />
                  {t("faden.stab.anhalten")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {daten.fragen && daten.fragen.length > 0 && (
        <FragenBand
          fragen={daten.fragen}
          bots={bots}
          {...(onVorschlag ? { onVorschlag } : {})}
          {...(onSelbst ? { onSelbst } : {})}
        />
      )}
    </section>
  );
}
