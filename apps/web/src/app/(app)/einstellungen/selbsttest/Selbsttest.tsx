/**
 * PaiBot – Reiter „Selbsttest“: holt die Prüfungen des Servers, ergänzt die des Browsers
 * (Verbindung, ankommende Kopfzeilen) und zeigt je Punkt Ergebnis, Satz und Ausweg; darunter, was
 * man selbst prüfen muss.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, ErrorState, Icon, LoadingState, type StatusArt, StatusChip } from "@paibot/ui";
import { useCallback, useEffect, useState } from "react";
import { zeitText } from "../../../../lib/schleuse/ansicht";
import {
  geordnet,
  type PruefErgebnis,
  type Pruefung,
  pruefeKopfzeilen,
  pruefeVerbindung,
  zusammenfassung,
} from "../../../../lib/selbsttest/pruefungen";
import type { SelbsttestDaten } from "../../../../lib/selbsttest/selbsttest";
import styles from "../einstellungen.module.css";
import eigene from "./selbsttest.module.css";

const ART: Record<PruefErgebnis, StatusArt> = { ok: "ok", hinweis: "warn", fehler: "fehler" };

/** Was PaiBot von innen nicht wissen kann. */
export const SELBST_PRUEFEN = [
  "selbsttest.selbst.proxy",
  "selbsttest.selbst.sicherung",
  "selbsttest.selbst.updates",
  "selbsttest.selbst.images",
] as const;

type Stand =
  | { zustand: "laedt" }
  | { zustand: "fehler"; text: string; ausweg?: string }
  | { zustand: "fertig"; geprueft: string; pruefungen: Pruefung[] };

/** Prüfungen, die nur der Browser sehen kann, aus seiner Adresse und der Antwort des Servers. */
function browserPruefungen(kopf: Headers): Pruefung[] {
  const https = window.location.protocol === "https:";
  return [
    pruefeVerbindung({ protokoll: window.location.protocol, host: window.location.host }),
    pruefeKopfzeilen({ https, kopf: (name) => kopf.get(name) }),
  ];
}

export function PruefListe({ pruefungen }: { pruefungen: readonly Pruefung[] }) {
  return (
    <ul className={eigene.liste} aria-label={t("selbsttest.liste")}>
      {pruefungen.map((p) => (
        <li key={p.id} className={eigene.punkt} data-ergebnis={p.ergebnis}>
          <div className={eigene.punktKopf}>
            <h3>{p.titel}</h3>
            <StatusChip art={ART[p.ergebnis]}>{t(`selbsttest.ergebnis.${p.ergebnis}`)}</StatusChip>
          </div>
          <p>{p.text}</p>
          {p.ausweg && (
            <p className={eigene.ausweg}>
              <strong>{t("selbsttest.ausweg")}:</strong> {p.ausweg}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SelbstPruefen() {
  return (
    <section className={styles.kachel} aria-labelledby="selbst-pruefen">
      <h2 id="selbst-pruefen">{t("selbsttest.selbst.titel")}</h2>
      <p className={styles.leise}>{t("selbsttest.selbst.vorspann")}</p>
      <ul className={eigene.selbst}>
        {SELBST_PRUEFEN.map((schluessel) => (
          <li key={schluessel}>
            <Icon name="info" />
            <span>{t(schluessel)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Selbsttest({ zeitzone }: { zeitzone: string }) {
  const [stand, setStand] = useState<Stand>({ zustand: "laedt" });

  const laden = useCallback(async () => {
    setStand({ zustand: "laedt" });
    let antwort: Response;
    let koerper: {
      ok?: boolean;
      daten?: SelbsttestDaten;
      fehler?: { text: string; ausweg?: string };
    };
    try {
      antwort = await fetch("/api/selbsttest", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      koerper = await antwort.json();
    } catch {
      setStand({ zustand: "fehler", text: t("fehler.intern"), ausweg: t("fehler.intern.ausweg") });
      return;
    }
    if (antwort.status === 401) {
      window.location.assign("/anmelden");
      return;
    }
    if (!antwort.ok || koerper.ok !== true || koerper.daten === undefined) {
      setStand({
        zustand: "fehler",
        text: koerper.fehler?.text ?? t("fehler.intern"),
        ...(koerper.fehler?.ausweg ? { ausweg: koerper.fehler.ausweg } : {}),
      });
      return;
    }
    setStand({
      zustand: "fertig",
      geprueft: koerper.daten.geprueft,
      pruefungen: geordnet([...koerper.daten.pruefungen, ...browserPruefungen(antwort.headers)]),
    });
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  const summe = stand.zustand === "fertig" ? zusammenfassung(stand.pruefungen) : undefined;
  return (
    <div className={styles.stapel}>
      <div className={styles.abschnitt}>
        <h2 className={eigene.titel}>{t("selbsttest.titel")}</h2>
        <p className={styles.vorspann}>{t("selbsttest.vorspann")}</p>
      </div>
      {stand.zustand === "laedt" && <LoadingState text={t("selbsttest.laedt")} />}
      {stand.zustand === "fehler" && (
        <ErrorState
          titel={t("selbsttest.fehler.laden")}
          ursache={stand.text}
          ausweg={stand.ausweg ?? t("selbsttest.unbekannt.ausweg")}
          aktion={
            <Button art="zweit" onClick={() => void laden()}>
              {t("selbsttest.erneut")}
            </Button>
          }
        />
      )}
      {stand.zustand === "fertig" && summe && (
        <>
          <div className={eigene.summe} role="status">
            <p>
              <strong>{t("selbsttest.summe", summe)}</strong>
              <span className={styles.leise}>
                {" · "}
                {t("selbsttest.geprueft", { zeit: zeitText(stand.geprueft, zeitzone) })}
              </span>
            </p>
            <Button art="zweit" onClick={() => void laden()}>
              {t("selbsttest.erneut")}
            </Button>
          </div>
          <PruefListe pruefungen={stand.pruefungen} />
        </>
      )}
      <SelbstPruefen />
    </div>
  );
}
