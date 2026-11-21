/**
 * PaiBot – Fassung „startbrett“ des Startbereichs: Karten in verschiedenen Größen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { type ReactNode, useId } from "react";
import { anfaengeStartbrett } from "./anfaenge";
import styles from "./Startbereich.module.css";
import {
  AvatarFeld,
  GruppenSymbol,
  grussText,
  HerkunftMarke,
  NotAusAnsicht,
  PfeilSymbol,
} from "./teile";
import type { StartDaten } from "./typen";

/** So viele letzte Unterhaltungen zeigt die Karte „Zuletzt“. */
export const MAX_ZULETZT = 3;

/** Avatar und Gruß klein oben, Karten für die Anfänge, „So arbeitet …“ und „Zuletzt“. */
export function StartStartbrett(daten: StartDaten) {
  const id = useId();
  const kopf = `${id}-titel`;
  const standId = `${id}-stand`;
  if (daten.notAus === true) {
    return (
      <NotAusAnsicht
        avatar={daten.avatarNotAus ?? daten.avatar}
        botName={daten.botName}
        mitZusatz
        titelId={kopf}
      />
    );
  }
  const name = daten.botName;
  const zeilen: { schluessel: string; label: string; wert: ReactNode }[] = [];
  if (daten.modell !== undefined) {
    zeilen.push({
      schluessel: "modell",
      label: t("startbereich.b.stand.modell"),
      wert: <span className={styles.name}>{daten.modell}</span>,
    });
  }
  if (daten.herkunft !== undefined) {
    zeilen.push({
      schluessel: "herkunft",
      label: t("startbereich.b.stand.herkunft"),
      wert: <HerkunftMarke herkunft={daten.herkunft} />,
    });
  }
  if (daten.schleuseAn !== undefined) {
    zeilen.push({
      schluessel: "schleuse",
      label: t("startbereich.b.stand.schleuse"),
      wert: daten.schleuseAn ? t("startbereich.stand.an") : t("startbereich.stand.aus"),
    });
  }
  if (daten.notAus !== undefined) {
    zeilen.push({
      schluessel: "notaus",
      label: t("startbereich.b.stand.notaus"),
      wert: (
        <>
          <span className={styles.punkt} aria-hidden="true" />
          {t("startbereich.b.stand.notaus_aus")}
        </>
      ),
    });
  }
  if (daten.belege !== undefined) {
    const zahl = daten.belege;
    zeilen.push({
      schluessel: "belege",
      label: t("startbereich.b.stand.belege"),
      wert: (
        <>
          <span className={styles.mono}>{zahl}</span> {t("startbereich.b.stand.belege_wert")}
        </>
      ),
    });
  }
  const unterhaltungen = (daten.unterhaltungen ?? []).slice(0, MAX_ZULETZT);
  const hatStand = zeilen.length > 0;
  const hatZuletzt = unterhaltungen.length > 0;
  const variante = hatStand ? (hatZuletzt ? "beide" : "stand") : hatZuletzt ? "zuletzt" : "keine";

  const kurz: ReactNode[] = [];
  if (daten.modell !== undefined) kurz.push(<span className={styles.name}>{daten.modell}</span>);
  if (daten.schleuseAn !== undefined) {
    kurz.push(
      daten.schleuseAn
        ? t("startbereich.b.kurz.schleuse_an")
        : t("startbereich.b.kurz.schleuse_aus"),
    );
  }
  if (daten.belege !== undefined) {
    kurz.push(
      <>
        <span className={styles.mono}>{daten.belege}</span> {t("startbereich.b.kurz.belege")}
      </>,
    );
  }

  return (
    <section className={styles.brett} aria-labelledby={kopf} data-fassung="startbrett">
      <div className={styles.brettKopf}>
        <AvatarFeld groesse="klein">{daten.avatar}</AvatarFeld>
        <div>
          <h1 id={kopf} className={styles.brettTitel}>
            {t("startbereich.b.titel", { gruss: grussText(daten.tageszeit) })}
          </h1>
          <p className={styles.brettSatz}>{t("startbereich.b.satz")}</p>
        </div>
      </div>
      {kurz.length > 0 && (
        <section
          className={styles.kurzstand}
          aria-label={
            name === undefined
              ? t("startbereich.b.stand.titel_ohne_name")
              : t("startbereich.b.stand.titel", { name })
          }
        >
          {kurz.map((teil, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge, nie umsortiert
            <span key={i} className={styles.kurzTeil}>
              {i > 0 && <span className={styles.trenn} aria-hidden="true" />}
              {teil}
            </span>
          ))}
        </section>
      )}
      <div className={styles.raster} data-variante={variante}>
        {anfaengeStartbrett().map((karte) => (
          <div className={styles.karte} data-karte={karte.gruppe} key={karte.gruppe}>
            <h2 className={styles.karteTitel}>
              <span className={styles.markeIc}>
                <GruppenSymbol name={karte.gruppe} />
              </span>
              {karte.titel}
            </h2>
            <ul className={styles.kartenListe}>
              {karte.anfaenge.map((anfang, i) => (
                <li key={anfang.id} className={styles.eintrag}>
                  <button
                    type="button"
                    className={styles.frageKarte}
                    data-erste={i === 0 ? "" : undefined}
                    onClick={() => daten.onAnfang(anfang.text)}
                  >
                    <span>{anfang.label}</span>
                    {karte.gruppe === "schreiben" && i === 0 && <PfeilSymbol />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {hatStand && (
          <section className={styles.karte} data-karte="stand" aria-labelledby={standId}>
            <h2 id={standId} className={styles.karteTitel}>
              <span className={styles.markeIc}>
                {daten.avatarKlein ?? <GruppenSymbol name="stand" />}
              </span>
              {name === undefined
                ? t("startbereich.b.stand.titel_ohne_name")
                : t("startbereich.b.stand.titel", { name })}
            </h2>
            <dl className={styles.werte}>
              {zeilen.map((zeile) => (
                <div key={zeile.schluessel}>
                  <dt>{zeile.label}</dt>
                  <dd>{zeile.wert}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {hatZuletzt && (
          <nav className={styles.karte} data-karte="zuletzt" aria-labelledby={`${id}-zuletzt`}>
            <h2 id={`${id}-zuletzt`} className={styles.karteTitel}>
              <span className={styles.markeIc}>
                <GruppenSymbol name="zuletzt" />
              </span>
              {t("startbereich.b.zuletzt")}
            </h2>
            <ul className={styles.zeilen}>
              {unterhaltungen.map((u) => (
                <li key={u.id} className={styles.eintrag}>
                  <button
                    type="button"
                    className={styles.zeile}
                    onClick={() => daten.onUnterhaltung?.(u.id)}
                  >
                    <span>{u.titel}</span>
                    <small>{u.zeit}</small>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </section>
  );
}
