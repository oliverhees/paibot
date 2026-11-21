/**
 * PaiBot – erkannte Zeilen: an jeder erkannten Übergabe der Zettel und das Ergebnis des Tors mit Beleg.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useId, useState } from "react";
import { BelegZeichen } from "./BelegZeichen";
import { Sym } from "./symbole";
import { reinerText, sauberName } from "./text";
import type { Abnahme, ErkannteZeile, ZettelDaten } from "./typen";
import styles from "./Zeilen.module.css";

const ABNAHMEN: readonly Abnahme[] = ["leitung", "ich", "ohne"];

/** Der Auftragszettel als reiner Text. Grenzen, die ein Bot nannte, sind nur ein Vorschlag ohne Wirkung. */
export function AuftragsZettel({ zettel }: { zettel: ZettelDaten }) {
  const abnahmeText = {
    leitung: t("faden.zettel.abnahme_leitung"),
    ich: t("faden.zettel.abnahme_ich"),
    ohne: t("faden.zettel.abnahme_ohne"),
  }[zettel.abnahme];
  return (
    <div className={styles.zettel} data-baustein="zettel">
      <div className={styles.zettelKopf}>
        <Sym name="doku" groesse={15} />
        <b>{t("faden.zettel.titel")}</b>
        <span className={styles.soft}>
          {t("faden.zettel.von", { name: sauberName(zettel.von) })}
        </span>
        {zettel.belege && <BelegZeichen info={zettel.belege} />}
      </div>
      <dl className={styles.felder}>
        <dt>{t("faden.zettel.ziel")}</dt>
        <dd>{reinerText(zettel.ziel, 300)}</dd>
        <dt>{t("faden.zettel.fertig_wenn")}</dt>
        <dd>
          <ul>
            {zettel.fertigWenn.map((f) => (
              <li key={f}>{reinerText(f, 200)}</li>
            ))}
          </ul>
        </dd>
        <dt>{t("faden.zettel.abnahme")}</dt>
        <dd>
          {abnahmeText}
          <span className={styles.wahl} aria-hidden="true">
            {ABNAHMEN.map((a) => (
              <span key={a} data-an={a === zettel.abnahme ? "true" : undefined}>
                {a === "leitung" ? "Leitung" : a === "ich" ? "ich" : "ohne"}
              </span>
            ))}
          </span>
        </dd>
        {zettel.grenzen && (
          <>
            <dt>{t("faden.zettel.grenzen")}</dt>
            <dd>{reinerText(zettel.grenzen, 200)}</dd>
          </>
        )}
        {zettel.grenzenVorschlag && (
          <>
            <dt>{t("faden.zettel.grenzen")}</dt>
            <dd>
              {reinerText(zettel.grenzenVorschlag, 200)}
              <span className={styles.vorschlag}>{t("faden.zettel.grenzen_vorschlag")}</span>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function titelZeile(z: ErkannteZeile): string {
  const name = sauberName(z.an);
  switch (z.art) {
    case "uebergabe":
      return t("faden.zeile.uebergabe", { name });
    case "bitte":
      return t("faden.zeile.bitte", { name });
    case "fertig":
      return t("faden.zeile.fertig");
    case "zurueck":
      return t("faden.zeile.zurueck", { name });
    case "frage":
      return t("faden.zeile.frage");
    case "unklar":
      return t("faden.zeile.unklar");
  }
}

/**
 * Eine Zeile, die der Server in einer Antwort erkannt hat: was erkannt wurde, was das Tor dazu
 * sagt (mit Beleg) und der erkannte Zettel zum Aufklappen. „Unklare Anweisung, nichts übergeben“
 * ist eine feste Zeile ohne Zettel.
 */
export function ErkannteZeileAnsicht({
  zeile,
  offen: anfang = false,
}: {
  zeile: ErkannteZeile;
  offen?: boolean;
}) {
  const [offen, setOffen] = useState(anfang);
  const id = useId();
  const hatZettel = zeile.zettel !== undefined || (zeile.zettelText ?? "") !== "";
  const unklar = zeile.art === "unklar";
  const stand = unklar
    ? null
    : zeile.ergebnis === "erlaubt"
      ? t("faden.zeile.erlaubt")
      : zeile.grund
        ? t("faden.zeile.abgelehnt", { grund: reinerText(zeile.grund, 80) })
        : t("faden.zeile.abgelehnt_ohne");
  return (
    <div className={styles.zeile} data-baustein="erkannte-zeile" data-art={zeile.art}>
      {/* biome-ignore lint/a11y/useSemanticElements: benannte Gruppe von Bedienelementen, fieldset passt hier nicht */}
      <div
        className={styles.chip}
        data-art={zeile.art}
        data-ergebnis={unklar ? undefined : zeile.ergebnis}
        role="group"
        aria-label={t("faden.zeile.region")}
      >
        <Sym name={unklar || zeile.ergebnis === "abgelehnt" ? "schild" : "doku"} groesse={14} />
        <span>{titelZeile(zeile)}</span>
        {stand && (
          <span className={styles.stand} data-ergebnis={zeile.ergebnis}>
            · {stand}
          </span>
        )}
        {hatZettel && !unklar && (
          <button
            type="button"
            className={styles.umschalter}
            aria-expanded={offen}
            aria-controls={id}
            onClick={() => setOffen(!offen)}
          >
            <Sym name="rechts" groesse={12} />
            {offen ? t("faden.zeile.zettel_verbergen") : t("faden.zeile.zettel_zeigen")}
          </button>
        )}
        {zeile.beleg && <BelegZeichen info={zeile.beleg} />}
      </div>
      {hatZettel && !unklar && (
        <div id={id} hidden={!offen}>
          {offen &&
            (zeile.zettel ? (
              <AuftragsZettel zettel={zeile.zettel} />
            ) : (
              <p className={styles.zettelText}>{reinerText(zeile.zettelText, 2000)}</p>
            ))}
        </div>
      )}
    </div>
  );
}

/** Ab so vielen erkannten Zeilen in einer Antwort werden sie zu einer Zeile zusammengefasst. */
export const ZEILEN_OHNE_ZUSAMMENFASSUNG = 2;

/**
 * Die erkannten Zeilen einer Antwort. Bis zu zwei stehen einzeln da; bei mehr zeigt eine
 * Zusammenfassung die Zahl und das Ergebnis des Tors, und „Alle zeigen“ klappt jede einzeln auf.
 */
export function ErkannteZeilen({ zeilen }: { zeilen: readonly ErkannteZeile[] }) {
  const [offen, setOffen] = useState(false);
  const id = useId();
  if (zeilen.length <= ZEILEN_OHNE_ZUSAMMENFASSUNG) {
    return (
      <>
        {zeilen.map((z, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Zeilen einer Antwort in fester Reihenfolge
          <ErkannteZeileAnsicht key={`${z.art}-${i}`} zeile={z} />
        ))}
      </>
    );
  }
  const abgelehnt = zeilen.filter((z) => z.ergebnis === "abgelehnt" && z.art !== "unklar").length;
  return (
    <div className={styles.zeile} data-baustein="erkannte-zeilen">
      {/* biome-ignore lint/a11y/useSemanticElements: benannte Gruppe von Bedienelementen, fieldset passt hier nicht */}
      <div
        className={styles.chip}
        data-ergebnis={abgelehnt > 0 ? "abgelehnt" : "erlaubt"}
        role="group"
        aria-label={t("faden.zeile.region")}
      >
        <Sym name="doku" groesse={14} />
        <span>{t("faden.zeile.mehrere", { anzahl: zeilen.length })}</span>
        <span className={styles.stand} data-ergebnis={abgelehnt > 0 ? "abgelehnt" : "erlaubt"}>
          ·{" "}
          {abgelehnt > 0
            ? t("faden.zeile.teils_abgelehnt", { anzahl: abgelehnt })
            : t("faden.zeile.alle_erlaubt")}
        </span>
        <button
          type="button"
          className={styles.umschalter}
          aria-expanded={offen}
          aria-controls={id}
          onClick={() => setOffen(!offen)}
        >
          <Sym name="rechts" groesse={12} />
          {offen ? t("faden.zeile.alle_verbergen") : t("faden.zeile.alle_zeigen")}
        </button>
      </div>
      <div id={id} className={styles.liste} hidden={!offen}>
        {offen &&
          zeilen.map((z, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Zeilen einer Antwort in fester Reihenfolge
            <ErkannteZeileAnsicht key={`${z.art}-${i}`} zeile={z} />
          ))}
      </div>
    </div>
  );
}
