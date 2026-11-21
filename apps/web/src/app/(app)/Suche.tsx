/**
 * PaiBot – Suche in der Seitenleiste: Feld, Treffer in Titeln und Nachrichten mit markiertem
 * Suchwort, weitere Seiten, Tastatur (Pfeile, Esc). Ausschnitte kommen als Text, nie als HTML.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { ApiErrorDetail } from "@paibot/shared/api";
import { t } from "@paibot/shared/texte";
import { Button, Ladekreis, SuchFeld } from "@paibot/ui";
import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api/client";
import { tagText, uhrzeit } from "../../lib/chat/anzeige";
import { CHAT_PFADE, stellenAdresse, unterhaltungsAdresse } from "../../lib/chat/pfade";
import type { SuchAusschnitt, SuchErgebnis } from "../../lib/chat/such-typen";
import { type SuchStand, suchStand, WARTEN_MS } from "../../lib/chat/such-zustand";
import styles from "./suche.module.css";

function Ausschnitt({ a }: { a: SuchAusschnitt }) {
  return (
    <>
      {a.gekuerztVorne && "… "}
      {a.vor}
      {a.treffer !== "" && <mark className={styles.mark}>{a.treffer}</mark>}
      {a.nach}
      {a.gekuerztHinten && " …"}
    </>
  );
}

/** Zustand der Suche für den Rahmen: Feld und (bei Suchwort) die Treffer. */
export function useSuche({ botName, zeitzone }: { botName: string; zeitzone: string }) {
  const [wert, setWert] = useState("");
  const [stand, setStand] = useState<SuchStand>({ art: "leer" });
  const [mehrLaedt, setMehrLaedt] = useState(false);
  const [versuch, setVersuch] = useState(0);
  const feldRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const runde = useRef(0);
  const jetzt = useRef(new Date());

  useEffect(() => {
    const vorab = suchStand(wert);
    // Jeder Versuch (auch „Noch einmal versuchen“) ist eine neue Runde.
    runde.current += 1 + versuch * 0;
    const meine = runde.current;
    if (vorab.art !== "suchen") {
      setStand(vorab);
      return;
    }
    setStand((alt) => (alt.art === "treffer" ? { ...alt, laedt: true } : { art: "laedt" }));
    const zeitgeber = setTimeout(async () => {
      const r = await apiFetch<SuchErgebnis>("GET", CHAT_PFADE.suche(vorab.suchwort));
      if (meine !== runde.current) return;
      jetzt.current = new Date();
      setStand(
        r.ok
          ? { art: "treffer", ergebnis: r.daten, laedt: false }
          : { art: "fehler", fehler: r.fehler },
      );
    }, WARTEN_MS);
    return () => clearTimeout(zeitgeber);
  }, [wert, versuch]);

  async function mehr() {
    if (stand.art !== "treffer" || stand.ergebnis.weiter === undefined) return;
    const meine = runde.current;
    setMehrLaedt(true);
    const r = await apiFetch<SuchErgebnis>(
      "GET",
      CHAT_PFADE.suche(stand.ergebnis.suchwort, stand.ergebnis.weiter),
    );
    setMehrLaedt(false);
    if (meine !== runde.current) return;
    if (!r.ok) {
      setStand({ art: "fehler", fehler: r.fehler });
      return;
    }
    const { weiter: _, ...vorher } = stand.ergebnis;
    setStand({
      art: "treffer",
      laedt: false,
      ergebnis: {
        ...vorher,
        nachrichten: [...vorher.nachrichten, ...r.daten.nachrichten],
        ...(r.daten.weiter === undefined ? {} : { weiter: r.daten.weiter }),
      },
    });
  }

  function trefferFokus(stelle: "erster" | number) {
    const links = [...(listeRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    if (links.length === 0) return;
    const ziel = stelle === "erster" ? 0 : stelle;
    if (ziel < 0) {
      feldRef.current?.focus();
      return;
    }
    links[Math.min(ziel, links.length - 1)]?.focus();
  }

  function listenTaste(e: KeyboardEvent<HTMLUListElement>) {
    const links = [...(listeRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    const jetzt = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      trefferFokus(jetzt + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      trefferFokus(jetzt - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      feldRef.current?.focus();
    }
  }

  const feld = (
    <SuchFeld
      label={t("suche.label")}
      placeholder={t("suche.platzhalter")}
      wert={wert}
      onWert={setWert}
      leerenLabel={t("suche.leeren")}
      laedt={stand.art === "laedt" || (stand.art === "treffer" && stand.laedt)}
      onRunter={() => trefferFokus("erster")}
      feldRef={feldRef}
      aria-describedby="pb-suche-hinweis"
      maxLength={100}
      enterKeyHint="search"
    />
  );

  function zeitText(iso: string): string {
    return `${tagText(iso, zeitzone, jetzt.current)}, ${uhrzeit(iso, zeitzone)}`;
  }

  function ergebnisse(navSchliessen: () => void): ReactNode {
    const hinweis = (
      <p id="pb-suche-hinweis" className={styles.nurLesbar}>
        {t("suche.hinweis")}
      </p>
    );
    if (stand.art === "zu_kurz") {
      return (
        <div className={styles.flaeche}>
          {hinweis}
          <p className={styles.leise} role="status">
            {t("suche.zu_kurz")}
          </p>
        </div>
      );
    }
    if (stand.art === "laedt") {
      return (
        <div className={styles.flaeche}>
          {hinweis}
          <p className={styles.leise} role="status">
            <Ladekreis /> {t("suche.laedt")}
          </p>
        </div>
      );
    }
    if (stand.art === "fehler") {
      return (
        <div className={styles.flaeche} role="alert">
          {hinweis}
          <p className={styles.fehler}>{t("suche.fehler")}</p>
          <p className={styles.leise}>{fehlerZeile(stand.fehler)}</p>
          <Button art="zweit" onClick={() => setVersuch((v) => v + 1)}>
            {t("allgemein.erneut")}
          </Button>
        </div>
      );
    }
    if (stand.art !== "treffer") return null;
    const { ergebnis } = stand;
    const anzahl = ergebnis.titel.length + ergebnis.nachrichten.length;
    if (anzahl === 0) {
      return (
        <div className={styles.flaeche}>
          {hinweis}
          <p className={styles.titelZeile} role="status">
            {t("suche.keine", { suchwort: ergebnis.suchwort })}
          </p>
          <p className={styles.leise}>{t("suche.keine.ausweg")}</p>
        </div>
      );
    }
    let nr = 0;
    return (
      <section className={styles.flaeche} aria-label={t("suche.ergebnisse")}>
        {hinweis}
        <p className={styles.anzahl} role="status">
          {ergebnis.weiter === undefined
            ? t("suche.anzahl", { anzahl })
            : t("suche.anzahl_mehr", { anzahl })}
        </p>
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Pfeiltasten zwischen den Links der Liste */}
        <ul ref={listeRef} className={styles.liste} onKeyDown={listenTaste}>
          {ergebnis.titel.length > 0 && (
            <li className={styles.gruppe} aria-hidden="true">
              {t("suche.titel")}
            </li>
          )}
          {ergebnis.titel.map((h) => {
            nr += 1;
            return (
              <li key={`t-${h.unterhaltungId}`}>
                <Link
                  href={unterhaltungsAdresse(h.unterhaltungId)}
                  prefetch={false}
                  className={styles.treffer}
                  data-nr={nr}
                  onClick={navSchliessen}
                >
                  <span className={styles.trefferTitel}>
                    <Ausschnitt a={h.titel} />
                  </span>
                  <span className={styles.meta}>{zeitText(h.zeit)}</span>
                </Link>
              </li>
            );
          })}
          {ergebnis.nachrichten.length > 0 && (
            <li className={styles.gruppe} aria-hidden="true">
              {t("suche.nachrichten")}
            </li>
          )}
          {ergebnis.nachrichten.map((h) => {
            nr += 1;
            const von =
              h.rolle === "du" ? t("suche.von.du") : t("suche.von.bot", { name: botName });
            return (
              <li key={`n-${h.nachrichtId}`}>
                <Link
                  href={stellenAdresse(h.unterhaltungId, h.nachrichtId)}
                  prefetch={false}
                  className={styles.treffer}
                  data-nr={nr}
                  onClick={navSchliessen}
                >
                  <span className={styles.trefferTitel}>{h.titel}</span>
                  <span className={styles.text}>
                    <Ausschnitt a={h.ausschnitt} />
                  </span>
                  <span className={styles.meta}>
                    {von} · {zeitText(h.zeit)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {ergebnis.weiter !== undefined && (
          <Button art="zweit" laedt={mehrLaedt} onClick={() => void mehr()}>
            {t("suche.mehr")}
          </Button>
        )}
      </section>
    );
  }

  return {
    feld,
    ...(stand.art === "leer" ? {} : { ergebnisse }),
  };
}

function fehlerZeile(f: ApiErrorDetail): string {
  return f.ausweg ? `${f.text} ${f.ausweg}` : f.text;
}
