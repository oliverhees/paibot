/**
 * PaiBot – Zeile einer verbundenen App: Name und Adresse, Zustand, Kennzahlen, Aktionen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { type ReactNode, useId } from "react";
import { Button } from "../basis/Button";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import { Ladekreis } from "../basis/Ladekreis";
import { NurLesbar } from "../basis/NurLesbar";
import { type StatusArt, StatusChip } from "../zustaende/StatusChip";
import { AppFehler, type AppFehlerArt } from "./AppFehler";
import styles from "./AppZeile.module.css";
import { kurzAdresse } from "./adresse";
import { FremderText } from "./FremderText";
import { bereinigeFremdText } from "./fremdText";
import { NotAusHinweis } from "./NotAusHinweis";

export type AppZustand = "verbindet" | "verbunden" | "fehler" | "notaus";

export interface AppWerkzeugZahlen {
  gesamt: number;
  /** Als „liest“ bestätigt. */
  lesend: number;
  /** Noch nie eingestuft. */
  offen: number;
  /** Geändert und deshalb gesperrt. */
  geaendert: number;
}

export interface AppZeileProps {
  /** Name laut App: fremder Text. */
  name: string;
  /** Beschreibung laut App: fremder Text. */
  beschreibung?: string;
  /** Adresse, wie der Besitzer sie eingetragen hat; angezeigt ohne Zugangsdaten und Abfrage-Teil. */
  adresse: string;
  zustand: AppZustand;
  /** Pflicht bei `zustand="fehler"`: welche Art Fehler. */
  fehlerArt?: AppFehlerArt;
  /** Ein Token ist hinterlegt (er wird nie angezeigt). `undefined`: nichts sagen. */
  tokenGesetzt?: boolean;
  werkzeuge?: AppWerkzeugZahlen;
  /** Wie vielen Bots der Zugriff „darf lesen“ gegeben ist. */
  botsMitZugriff?: number;
  /** Überschriften-Ebene des Namens (Standard 3). */
  ebene?: 2 | 3 | 4;
  /** Sind die Werkzeuge gerade aufgeklappt? Setzt `aria-expanded` am Knopf. */
  geoeffnet?: boolean;
  onOeffnen?: () => void;
  onErneutTesten?: () => void;
  onTrennen?: () => void;
  /**
   * Adresse eines Bildes oder Symbols, die die App liefert. Wird nie geladen oder angezeigt;
   * die Zeile nutzt immer ihr eigenes Symbol.
   */
  symbolAdresse?: string;
  /** Aufgeklappter Inhalt, z. B. die Werkzeug-Liste und die Zugriffe. */
  children?: ReactNode;
  className?: string;
}

const CHIP: Record<AppZustand, { art: StatusArt; text: () => string }> = {
  verbindet: { art: "arbeitet", text: () => t("apps.status.verbindet") },
  verbunden: { art: "ok", text: () => t("apps.status.verbunden") },
  fehler: { art: "fehler", text: () => t("apps.status.fehler") },
  notaus: { art: "warn", text: () => t("apps.status.notaus") },
};

/**
 * Eine App in der Liste. Der Zustand kommt von außen; die Zeile behauptet nichts über die App,
 * was nicht in den Eigenschaften steht. Name und Beschreibung sind fremder Text und so markiert.
 */
export function AppZeile({
  name,
  beschreibung,
  adresse,
  zustand,
  fehlerArt,
  tokenGesetzt,
  werkzeuge,
  botsMitZugriff,
  ebene = 3,
  geoeffnet,
  onOeffnen,
  onErneutTesten,
  onTrennen,
  children,
  className,
}: AppZeileProps) {
  const nameId = useId();
  const Ueberschrift = `h${ebene}` as "h2" | "h3" | "h4";
  const sauberName = bereinigeFremdText(name, "name").text || t("apps.fremd.leer");
  const chip = CHIP[zustand];
  const ruht = zustand === "verbindet" || zustand === "notaus";

  const fakten: { text: string; achtung?: boolean }[] = [];
  if (werkzeuge && zustand !== "verbindet") {
    fakten.push({
      text:
        werkzeuge.gesamt === 1
          ? t("apps.zeile.werkzeuge.eins")
          : t("apps.zeile.werkzeuge", { anzahl: werkzeuge.gesamt }),
    });
    if (werkzeuge.lesend > 0) {
      fakten.push({ text: t("apps.zeile.lesend", { anzahl: werkzeuge.lesend }) });
    }
    if (werkzeuge.offen > 0) {
      fakten.push({ text: t("apps.zeile.offen", { anzahl: werkzeuge.offen }) });
    }
    if (werkzeuge.geaendert > 0) {
      fakten.push({
        text: t("apps.zeile.geaendert", { anzahl: werkzeuge.geaendert }),
        achtung: true,
      });
    }
  }
  if (botsMitZugriff !== undefined && zustand !== "verbindet") {
    fakten.push({
      text:
        botsMitZugriff === 0
          ? t("apps.zeile.zugriff.keiner")
          : botsMitZugriff === 1
            ? t("apps.zeile.zugriff.eins")
            : t("apps.zeile.zugriff", { anzahl: botsMitZugriff }),
    });
  }
  if (tokenGesetzt !== undefined) {
    fakten.push({ text: tokenGesetzt ? t("apps.zeile.token") : t("apps.zeile.ohne_token") });
  }

  return (
    <article
      className={klassen(styles.zeile, className)}
      data-zustand={zustand}
      aria-labelledby={nameId}
    >
      <div className={styles.kopf}>
        <span className={styles.symbol} aria-hidden="true">
          <Icon name="server" groesse={20} />
        </span>
        <div className={styles.titel}>
          <div className={styles.nameZeile}>
            <Ueberschrift id={nameId} className={styles.name}>
              <FremderText text={name} art="name" />
            </Ueberschrift>
            <span className={styles.laut}>{t("apps.fremd.laut")}</span>
          </div>
          <p className={styles.adresse}>
            <NurLesbar>{t("apps.zeile.adresse")}: </NurLesbar>
            {kurzAdresse(adresse)}
          </p>
        </div>
        <StatusChip art={chip.art} className={styles.chip}>
          {chip.text()}
        </StatusChip>
      </div>

      {beschreibung !== undefined && beschreibung !== "" && (
        <FremderText text={beschreibung} art="beschreibung" darstellung="kasten" />
      )}

      {zustand === "verbindet" && (
        <p className={styles.laedt} role="status">
          <Ladekreis groesse={16} />
          <span>{t("apps.zeile.verbindet")}</span>
        </p>
      )}
      {zustand === "fehler" && fehlerArt && (
        <AppFehler
          art={fehlerArt}
          aktion={
            // Nur wo ein neuer Versuch etwas ändern kann; bei falscher Adresse oder Token nicht.
            onErneutTesten &&
            fehlerArt === "nicht_erreichbar" && (
              <Button
                icon="neuLaden"
                onClick={onErneutTesten}
                aria-label={`${t("apps.fehler.versuchen")}: ${sauberName}`}
              >
                {t("apps.fehler.versuchen")}
              </Button>
            )
          }
        />
      )}
      {zustand === "notaus" && <NotAusHinweis text={t("apps.zeile.notaus")} />}

      {fakten.length > 0 && (
        <ul className={styles.fakten}>
          {fakten.map((f) => (
            <li key={f.text} className={f.achtung ? styles.achtung : undefined}>
              {f.text}
            </li>
          ))}
        </ul>
      )}

      {(onOeffnen || onErneutTesten || onTrennen) && (
        <div className={styles.aktionen}>
          {onOeffnen && (
            <Button
              art="zweit"
              onClick={onOeffnen}
              disabled={zustand === "verbindet"}
              aria-expanded={geoeffnet}
              aria-label={`${t("apps.zeile.oeffnen")}: ${sauberName}`}
            >
              {t("apps.zeile.oeffnen")}
            </Button>
          )}
          {onErneutTesten && zustand !== "fehler" && (
            <Button
              art="leise"
              icon="neuLaden"
              onClick={onErneutTesten}
              disabled={ruht}
              aria-label={`${t("apps.zeile.erneut")}: ${sauberName}`}
            >
              {t("apps.zeile.erneut")}
            </Button>
          )}
          {onTrennen && (
            <Button
              art="leise"
              onClick={onTrennen}
              aria-label={`${t("apps.zeile.trennen")}: ${sauberName}`}
            >
              {t("apps.zeile.trennen")}
            </Button>
          )}
        </div>
      )}
      {children && <div className={styles.detail}>{children}</div>}
    </article>
  );
}
