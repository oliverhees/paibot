/**
 * PaiBot – Seite „Regeln“ (nur lesen): die geltenden Regeln des Tors mit Kennung, Fassung und Satz
 * in Nutzer-Sprache, dazu die festen Grenzen und Vorbedingungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { Icon, RegelListe, ScrollBereich, TorWeg } from "@paibot/ui";
import type { Metadata } from "next";
import { regelDaten } from "../../../lib/belege/lesen";
import {
  grenzenEintraege,
  regelEintraege,
  vorbedingungenEintraege,
} from "../../../lib/belege/regeln";
import { datenbank } from "../../../lib/datenbank";
import { besitzerSeite } from "../../../lib/zugang/seite";
import styles from "../belege/belege.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `${t("regeln.seite")} · PaiBot` };

export default async function RegelnSeite() {
  await besitzerSeite();
  const { stand, aktive } = await regelDaten(datenbank());
  const darstellen = (e: ReturnType<typeof regelEintraege>[number]) => ({
    nr: e.nr,
    satz: (
      <>
        {e.titel}: <b>{e.wirkung}</b>.
      </>
    ),
    erklaerung: e.erklaerung,
    stufen: e.stufen,
  });
  return (
    <ScrollBereich className={styles.seite} label={t("regeln.seite")}>
      <div className={`${styles.spalte} ${styles.schmal}`}>
        <header className={styles.kopf}>
          <h1>{t("regeln.seite")}</h1>
        </header>
        <p className={styles.vorspann}>{t("regeln.vorspann")}</p>
        <TorWeg
          label={t("regeln.weg.label")}
          stationen={[
            { titel: t("regeln.weg.aktion"), text: t("regeln.weg.aktion.text") },
            { titel: t("regeln.weg.tor"), text: t("regeln.weg.tor.text") },
            { titel: t("regeln.weg.beleg"), text: t("regeln.weg.beleg.text") },
          ]}
        />
        <section className={styles.haupt} aria-labelledby="regeln-titel">
          <div className={styles.abschnittKopf}>
            <h2 id="regeln-titel">{t("regeln.regeln.titel")}</h2>
            <span className={`${styles.leise} ${styles.klein}`}>
              {t("regeln.regeln.stand", { stand })}
            </span>
          </div>
          <RegelListe
            label={t("regeln.regeln.titel")}
            eintraege={regelEintraege(aktive).map(darstellen)}
          />
        </section>
        <section className={styles.haupt} aria-labelledby="grenzen-titel">
          <div className={styles.abschnittKopf}>
            <h2 id="grenzen-titel">{t("regeln.grenzen.titel")}</h2>
            <span className={`${styles.leise} ${styles.klein}`}>{t("regeln.grenzen.zusatz")}</span>
          </div>
          <RegelListe
            label={t("regeln.grenzen.titel")}
            eintraege={grenzenEintraege().map(darstellen)}
          />
        </section>
        <section className={styles.haupt} aria-labelledby="vorbedingungen-titel">
          <div className={styles.abschnittKopf}>
            <h2 id="vorbedingungen-titel">{t("regeln.vorbedingungen.titel")}</h2>
            <span className={`${styles.leise} ${styles.klein}`}>
              {t("regeln.vorbedingungen.zusatz")}
            </span>
          </div>
          <RegelListe
            label={t("regeln.vorbedingungen.titel")}
            eintraege={vorbedingungenEintraege().map(darstellen)}
          />
        </section>
        <div className={styles.hinweis}>
          <Icon name="info" />
          <p>{t("regeln.fest")}</p>
        </div>
      </div>
    </ScrollBereich>
  );
}
