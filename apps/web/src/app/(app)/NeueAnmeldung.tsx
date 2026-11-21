/**
 * PaiBot – Leiste „Neue Anmeldung von einem neuen Gerät“ oben in der App: erscheint auf jedem
 * anderen angemeldeten Gerät, bis du dort „Das war ich“ wählst. „Das war ich nicht“ zeigt die zwei
 * Wege, den Zugang zu sichern (Passwort ändern, alle Sitzungen beenden) in den Einstellungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, Icon } from "@paibot/ui";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api/client";
import { hinweisTexte, type NeueAnmeldungZeile } from "../../lib/einstellungen/geraete";
import styles from "./neue-anmeldung.module.css";

export interface NeueAnmeldungProps {
  neue: readonly NeueAnmeldungZeile[];
  zeitzone: string;
}

export function NeueAnmeldung({ neue, zeitzone }: NeueAnmeldungProps) {
  const [zustand, setZustand] = useState<"offen" | "nicht_ich" | "bestaetigt">("offen");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const sichern = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (zustand === "nicht_ich") sichern.current?.focus();
  }, [zustand]);

  if (neue.length === 0) return null;
  if (zustand === "bestaetigt") {
    return (
      <p className={styles.danke} role="status">
        <Icon name="check" />
        <span>{t("hinweis.neu.bestaetigt")}</span>
      </p>
    );
  }

  async function dasWarIch() {
    setLaeuft(true);
    setFehler(undefined);
    const antwort = await apiFetch<{ bestaetigt: number }>("POST", "/api/zugang/geraete/hinweis");
    setLaeuft(false);
    if (antwort.ok) {
      setZustand("bestaetigt");
      return;
    }
    if (antwort.status === 401) {
      window.location.assign("/anmelden");
      return;
    }
    setFehler(
      antwort.fehler.ausweg
        ? `${antwort.fehler.text} ${antwort.fehler.ausweg}`
        : antwort.fehler.text,
    );
  }

  const texte = hinweisTexte(neue, zeitzone);
  return (
    <section className={styles.leiste} aria-label={t("hinweis.neu.region")}>
      <div className={styles.kopf}>
        <Icon name="info" groesse={18} />
        <div className={styles.text}>
          <p className={styles.titel}>{texte.titel}</p>
          <ul className={styles.zeilen}>
            {texte.zeilen.map((zeile, i) => (
              <li key={neue[i]?.id ?? zeile}>{zeile}</li>
            ))}
          </ul>
          <p className={styles.frage}>{t("hinweis.neu.text")}</p>
        </div>
      </div>
      {fehler && (
        <p className={styles.fehler} role="alert">
          {fehler}
        </p>
      )}
      <div className={styles.knoepfe}>
        <Button art="primaer" laedt={laeuft} onClick={() => void dasWarIch()}>
          {laeuft ? t("hinweis.neu.laeuft") : t("hinweis.neu.ich")}
        </Button>
        <Button
          art="gefahr"
          aria-expanded={zustand === "nicht_ich"}
          aria-controls="hinweis-sichern"
          onClick={() => setZustand(zustand === "nicht_ich" ? "offen" : "nicht_ich")}
        >
          {t("hinweis.neu.nicht_ich")}
        </Button>
      </div>
      {zustand === "nicht_ich" && (
        <div id="hinweis-sichern" className={styles.sichern}>
          <p className={styles.titel} ref={sichern} tabIndex={-1}>
            {t("hinweis.neu.sichern_titel")}
          </p>
          <ol className={styles.wege}>
            <li>
              <span>{t("hinweis.neu.sichern_passwort")}</span>
              <a className={styles.weg} href="/einstellungen#passwort-titel">
                {t("hinweis.neu.zum_passwort")}
              </a>
            </li>
            <li>
              <span>{t("hinweis.neu.sichern_alle")}</span>
              <a className={styles.weg} href="/einstellungen#sitzungen-titel">
                {t("hinweis.neu.zu_alle")}
              </a>
            </li>
          </ol>
        </div>
      )}
    </section>
  );
}
