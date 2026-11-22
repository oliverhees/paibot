/**
 * PaiBot – Liste der Werkzeuge einer App mit Übersicht und dem ehrlichen Hinweis zu „liest“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import { EmptyState } from "../zustaende/Zustaende";
import styles from "./Werkzeug.module.css";
import { WerkzeugKarte, type WerkzeugKarteProps } from "./WerkzeugKarte";
import { type WerkzeugArt, type WerkzeugStatus, werkzeugSumme } from "./werkzeug";

export interface WerkzeugListeEintrag extends Omit<WerkzeugKarteProps, "onEinstufen" | "ebene"> {
  /** Stabile Kennung des Werkzeugs (nicht der Name der App). */
  id: string;
}

export interface WerkzeugListeProps {
  werkzeuge: readonly WerkzeugListeEintrag[];
  /** Der Besitzer hat die Einstufung eines Werkzeugs bestätigt. */
  onEinstufen?: (id: string, art: WerkzeugArt, fassung: string | undefined) => void;
  /** Kennung des Werkzeugs, das gerade gespeichert wird. */
  speichertId?: string;
  /** Überschriften-Ebene von „Werkzeuge“ (Standard 3); die Karten liegen eine Ebene tiefer. */
  ebene?: 2 | 3 | 4;
  className?: string;
}

/** Was Aufmerksamkeit braucht, steht oben: geändert, dann neu, dann der Rest in Reihenfolge der App. */
const VORRANG: Record<WerkzeugStatus, number> = {
  geaendert: 0,
  neu: 1,
  bestaetigt: 2,
  entfernt: 3,
};

export function WerkzeugListe({
  werkzeuge,
  onEinstufen,
  speichertId,
  ebene = 3,
  className,
}: WerkzeugListeProps) {
  const Ueberschrift = `h${ebene}` as "h2" | "h3" | "h4";
  const kartenEbene = Math.min(ebene + 1, 5) as 3 | 4 | 5;
  const summe = werkzeugSumme(werkzeuge);
  const geordnet = werkzeuge
    .map((w, index) => ({ w, index }))
    .sort((a, b) => VORRANG[a.w.status] - VORRANG[b.w.status] || a.index - b.index)
    .map(({ w }) => w);

  return (
    <section className={klassen(styles.liste, className)} aria-label={t("apps.werkzeuge.titel")}>
      <div className={styles.listeKopf}>
        <Ueberschrift className={styles.listeTitel}>{t("apps.werkzeuge.titel")}</Ueberschrift>
        {summe.gesamt > 0 && (
          <p className={styles.summe}>
            {t("apps.werkzeuge.zusammen", {
              lesen: summe.lesen,
              schreiben: summe.schreiben,
              gesperrt: summe.gesperrt,
              offen: summe.offen,
              geaendert: summe.geaendert,
            })}
          </p>
        )}
        <p className={styles.grenze} data-grenze="">
          <Icon name="info" groesse={14} />
          <span>{t("apps.werkzeuge.grenze")}</span>
        </p>
      </div>
      {geordnet.length === 0 ? (
        <EmptyState
          titel={t("apps.werkzeuge.leer.titel")}
          text={<p>{t("apps.werkzeuge.leer.text")}</p>}
        />
      ) : (
        <ul className={styles.eintraege}>
          {geordnet.map(({ id, ...karte }) => (
            // Mit einer neuen Fassung wird die Karte neu aufgebaut: Ein offenes Einstufen schließt sich,
            // und bestätigt wird nie eine Fassung, die der Besitzer beim Öffnen nicht gesehen hat.
            <li key={`${id}:${karte.fassung ?? ""}`}>
              <WerkzeugKarte
                {...karte}
                ebene={kartenEbene}
                speichert={speichertId === id}
                onEinstufen={onEinstufen && ((art, fassung) => onEinstufen(id, art, fassung))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
