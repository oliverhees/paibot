/**
 * PaiBot – Reiter „Zugang“, Abschnitt „Bekannte Geräte“: Liste mit grober Angabe, zuerst und
 * zuletzt gesehen, gültig bis, „dieses Gerät“; einzelnes Gerät entfernen mit Rückfrage.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, Dialog, ErrorState, Icon, LoadingState, StatusChip } from "@paibot/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import { grobesGeraet, zeitpunkt } from "../../../lib/einstellungen/anzeige";
import { geraeteSortiert } from "../../../lib/einstellungen/geraete";
import type { GeraetZeile } from "../../../lib/einstellungen/typen";
import styles from "./einstellungen.module.css";
import eigene from "./geraete.module.css";

type Liste =
  | { zustand: "laedt" }
  | { zustand: "fehler"; text: string; ausweg?: string }
  | { zustand: "fertig"; geraete: GeraetZeile[] };

function fehlerText(fehler: { text: string; ausweg?: string }): string {
  return fehler.ausweg ? `${fehler.text} ${fehler.ausweg}` : fehler.text;
}

export function Geraete({ zeitzone }: { zeitzone: string }) {
  const [liste, setListe] = useState<Liste>({ zustand: "laedt" });
  const [frage, setFrage] = useState<GeraetZeile | undefined>();
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [erfolg, setErfolg] = useState<string | undefined>();
  const titel = useRef<HTMLHeadingElement>(null);

  const laden = useCallback(async () => {
    const antwort = await apiFetch<{ geraete: GeraetZeile[] }>("GET", "/api/zugang/geraete");
    if (antwort.ok) {
      setListe({ zustand: "fertig", geraete: geraeteSortiert(antwort.daten.geraete) });
      return;
    }
    if (antwort.status === 401) {
      window.location.assign("/anmelden");
      return;
    }
    setListe({
      zustand: "fehler",
      text: antwort.fehler.text,
      ...(antwort.fehler.ausweg ? { ausweg: antwort.fehler.ausweg } : {}),
    });
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  async function entfernen(geraet: GeraetZeile) {
    setLaeuft(true);
    setFehler(undefined);
    setErfolg(undefined);
    const antwort = await apiFetch<{ entfernt: true; abgemeldet: boolean }>(
      "POST",
      `/api/zugang/geraete/${encodeURIComponent(geraet.id)}/entfernen`,
    );
    if ((antwort.ok && antwort.daten.abgemeldet) || (!antwort.ok && antwort.status === 401)) {
      window.location.assign("/anmelden");
      return;
    }
    setLaeuft(false);
    setFrage(undefined);
    if (antwort.ok) {
      setErfolg(t("einstellungen.geraet.entfernt", { geraet: grobesGeraet(geraet.name) }));
    } else if (antwort.fehler.code === "nicht_gefunden") {
      setFehler(t("einstellungen.geraet.weg"));
    } else {
      setFehler(fehlerText(antwort.fehler));
    }
    await laden();
    // Der Knopf der Zeile ist weg: Fokus auf die Überschrift, damit er nicht verloren geht.
    titel.current?.focus();
  }

  return (
    <section className={styles.kachel} aria-labelledby="geraete-titel">
      <h2 id="geraete-titel" ref={titel} tabIndex={-1} className={eigene.titel}>
        {t("einstellungen.geraete")}
      </h2>
      <p className={styles.leise}>{t("einstellungen.geraete.text")}</p>
      {erfolg && (
        <p className={`${styles.hinweis} ${styles.hinweisOk}`} role="status">
          <Icon name="check" />
          <span>{erfolg}</span>
        </p>
      )}
      {fehler && (
        <p className={styles.fehlerText} role="alert">
          {fehler}
        </p>
      )}
      {liste.zustand === "laedt" && <LoadingState />}
      {liste.zustand === "fehler" && (
        <ErrorState
          titel={t("einstellungen.geraete.fehler")}
          ursache={liste.text}
          ausweg={liste.ausweg ?? t("fehler.intern.ausweg")}
          aktion={<Button onClick={() => void laden()}>{t("allgemein.erneut")}</Button>}
        />
      )}
      {liste.zustand === "fertig" && liste.geraete.length === 0 && (
        <p className={styles.leise}>{t("einstellungen.geraete.leer")}</p>
      )}
      {liste.zustand === "fertig" && liste.geraete.length > 0 && (
        <ul className={styles.sitzungen}>
          {liste.geraete.map((g) => {
            const name = grobesGeraet(g.name);
            return (
              <li key={g.id} className={styles.sitzung}>
                <span className={styles.sitzungText}>
                  <span className={eigene.kopf}>
                    <span className={styles.sitzungGeraet}>{name}</span>
                    {g.aktuell && (
                      <StatusChip art="ok">{t("einstellungen.geraet.diese")}</StatusChip>
                    )}
                  </span>
                  <span className={styles.sitzungZeit}>
                    {t("einstellungen.geraet.zuerst", { zeit: zeitpunkt(g.angelegt, zeitzone) })}
                    {" · "}
                    {t("einstellungen.geraet.zuletzt", { zeit: zeitpunkt(g.zuletzt, zeitzone) })}
                  </span>
                  <span className={styles.sitzungZeit}>
                    {t("einstellungen.geraet.bis", { zeit: zeitpunkt(g.endet, zeitzone) })}
                  </span>
                </span>
                <Button
                  art="leise"
                  aria-label={t("einstellungen.geraet.entfernen_label", { geraet: name })}
                  onClick={() => {
                    setFehler(undefined);
                    setErfolg(undefined);
                    setFrage(g);
                  }}
                >
                  {t("einstellungen.geraet.entfernen")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        offen={frage !== undefined}
        onSchliessen={() => {
          if (!laeuft) setFrage(undefined);
        }}
        titel={t("einstellungen.geraet.entfernen_titel")}
        schliessenLabel={t("einstellungen.schliessen")}
        rueckfrage
        aktionen={
          <>
            <Button onClick={() => setFrage(undefined)} disabled={laeuft}>
              {t("allgemein.abbrechen")}
            </Button>
            <Button
              art="gefahr"
              laedt={laeuft}
              onClick={() => {
                if (frage) void entfernen(frage);
              }}
            >
              {laeuft ? t("einstellungen.geraet.laeuft") : t("einstellungen.geraet.entfernen")}
            </Button>
          </>
        }
      >
        {frage && (
          <>
            <p className={styles.absatz}>
              {t("einstellungen.geraet.rueckfrage", { geraet: grobesGeraet(frage.name) })}
            </p>
            {frage.aktuell && (
              <p className={`${styles.hinweis} ${styles.hinweisWarn}`}>
                <Icon name="info" />
                <span>{t("einstellungen.geraet.rueckfrage_dieses")}</span>
              </p>
            )}
          </>
        )}
      </Dialog>
    </section>
  );
}
