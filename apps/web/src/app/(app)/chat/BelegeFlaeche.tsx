/**
 * PaiBot – Reiter „Belege“ der Arbeitsfläche: die Belege der aktuellen Unterhaltung, neuester
 * oben; ein Klick zeigt die wichtigsten Felder. Nur lesen; geprüft wird auf der Seite des Belegs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { errorText, isTextKey, t } from "@paibot/shared/texte";
import { Icon, LoadingState } from "@paibot/ui";
import Link from "next/link";
import { belegAdresse, belegKennung, uhrzeit, zeitpunkt } from "../../../lib/chat/anzeige";
import type { BelegKurz } from "../../../lib/chat/typen";
import styles from "./chat.module.css";

export interface BelegeFlaecheProps {
  belege: readonly BelegKurz[];
  zeitzone: string;
  botName: string;
  /** Kennung des geöffneten Belegs; ohne sie die Liste. */
  offen?: string;
  onOeffnen: (id: string | undefined) => void;
}

function aktionText(b: BelegKurz): string {
  return t(`aktion.${b.aktion}`);
}

function werText(b: BelegKurz, botName: string): string | undefined {
  if (b.akteur === undefined) return undefined;
  return b.akteur === "besitzer"
    ? t("chat.beleg.wer.besitzer")
    : t("chat.beleg.wer.bot", { name: botName });
}

function regelText(id: string): string {
  const schluessel = `regel.${id}`;
  return isTextKey(schluessel) ? `${id} „${t(schluessel as "regel.R-001")}“` : id;
}

/** Häkchen nur, wenn das Tor erlaubt bzw. die Aktion geklappt hat; sonst ein neutrales Zeichen. */
function belegIcon(b: BelegKurz) {
  const gut = b.entscheidung?.outcome === "allow" || b.ergebnis?.status === "ok";
  return gut ? "check" : "beleg";
}

/** Entscheidung und Ergebnis derselben Aktion gehören zusammen (gleicher Lauf bzw. gleiche Nachricht). */
export function partnerBeleg(b: BelegKurz, belege: readonly BelegKurz[]): BelegKurz | undefined {
  return belege.find(
    (x) =>
      x.id !== b.id &&
      x.vollstaendig &&
      x.aktion === b.aktion &&
      x.art !== b.art &&
      ((b.runId !== undefined && x.runId === b.runId) ||
        (b.messageId !== undefined && x.messageId === b.messageId)),
  );
}

function Detail({
  beleg,
  belege,
  zeitzone,
  botName,
}: {
  beleg: BelegKurz;
  belege: readonly BelegKurz[];
  zeitzone: string;
  botName: string;
}) {
  if (!beleg.vollstaendig || beleg.seq === undefined) {
    return <LoadingState text={t("chat.belege.laedt")} />;
  }
  const partner = partnerBeleg(beleg, belege);
  const entscheidung = beleg.entscheidung ?? partner?.entscheidung;
  const ergebnis = beleg.ergebnis ?? partner?.ergebnis;
  const kennung = belegKennung(beleg.seq);
  const wer = werText(beleg, botName);
  return (
    <article className={styles.beleg} aria-labelledby={`beleg-${beleg.id}`}>
      <div className={styles.belegKopf}>
        <span className={styles.siegel} data-gut={belegIcon(beleg) === "check" || undefined}>
          <Icon name={belegIcon(beleg)} />
        </span>
        <div className={styles.belegTitel}>
          <span className={styles.etikett}>{t("chat.beleg.titel", { kennung })}</span>
          <strong id={`beleg-${beleg.id}`}>{aktionText(beleg)}</strong>
        </div>
      </div>
      <dl className={styles.belegZeilen}>
        <dt>{t("chat.beleg.feld.was")}</dt>
        <dd>
          {aktionText(beleg)}
          {beleg.art && (
            <>
              <br />
              <span className={styles.leise}>{t(`chat.beleg.art.${beleg.art}`)}</span>
            </>
          )}
        </dd>
        {wer && (
          <>
            <dt>{t("chat.beleg.feld.wer")}</dt>
            <dd>{wer}</dd>
          </>
        )}
        {entscheidung && (
          <>
            <dt>{t("chat.beleg.feld.entscheidung")}</dt>
            <dd>{t(`chat.beleg.outcome.${entscheidung.outcome}`)}</dd>
            <dt>{t("chat.beleg.feld.regeln")}</dt>
            <dd>
              {entscheidung.regeln.length === 0 ? (
                t("chat.beleg.keine_regeln")
              ) : (
                <ul className={styles.regeln}>
                  {entscheidung.regeln.map((r) => (
                    <li key={`${r.id}-${r.version}`}>
                      {regelText(r.id)} <span className={styles.mono}>v{r.version}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
            <dt>{t("chat.beleg.feld.grund")}</dt>
            <dd>{entscheidung.grund}</dd>
          </>
        )}
        {ergebnis && (
          <>
            <dt>{t("chat.beleg.feld.ergebnis")}</dt>
            <dd>
              {t(`ergebnis.${ergebnis.status}`)}
              {ergebnis.code && (
                <>
                  <br />
                  <span className={styles.leise}>{errorText(ergebnis.code)}</span>
                </>
              )}
            </dd>
          </>
        )}
        <dt>{t("chat.beleg.feld.zeit")}</dt>
        <dd className={styles.zahl}>{zeitpunkt(beleg.zeit, zeitzone)}</dd>
        <dt>{t("chat.beleg.feld.kennung")}</dt>
        <dd>
          <span className={styles.mono}>{kennung}</span>
          <br />
          <span className={`${styles.mono} ${styles.leise}`}>{beleg.id}</span>
        </dd>
      </dl>
      <Link href={belegAdresse(beleg.id)} prefetch={false} className={styles.zurueck}>
        {t("chat.belege.seite")}
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export function BelegeFlaeche({ belege, zeitzone, botName, offen, onOeffnen }: BelegeFlaecheProps) {
  const geoeffnet = offen === undefined ? undefined : belege.find((b) => b.id === offen);
  if (geoeffnet) {
    return (
      <div className={styles.flaeche}>
        <button type="button" className={styles.zurueck} onClick={() => onOeffnen(undefined)}>
          <span aria-hidden="true">←</span>
          {t("chat.belege.zurueck")}
        </button>
        <Detail beleg={geoeffnet} belege={belege} zeitzone={zeitzone} botName={botName} />
      </div>
    );
  }
  if (belege.length === 0) {
    return <p className={styles.leise}>{t("chat.belege.leer")}</p>;
  }
  return (
    <div className={styles.flaeche}>
      <p className={styles.leise}>{t("chat.belege.einleitung")}</p>
      <ul className={styles.belegListe}>
        {belege.map((b) => {
          const wer = werText(b, botName);
          return (
            <li key={b.id}>
              <button type="button" className={styles.belegZeile} onClick={() => onOeffnen(b.id)}>
                <span className={styles.haken} data-gut={belegIcon(b) === "check" || undefined}>
                  <Icon name={belegIcon(b)} groesse={13} />
                </span>
                <span className={styles.belegText}>
                  {aktionText(b)}
                  <small>
                    {[wer, b.art ? t(`chat.beleg.art.${b.art}`) : undefined]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <span className={styles.belegRechts}>
                  {b.seq !== undefined && (
                    <span className={styles.mono}>{belegKennung(b.seq)}</span>
                  )}
                  <span className={styles.zahl}>{uhrzeit(b.zeit, zeitzone)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
