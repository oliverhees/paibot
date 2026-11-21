/**
 * PaiBot – Reiter „Grenzen“: Tagesgrenze mit dem Verbrauch von heute, Verlaufsgrenze und Zeitzone.
 * Jede Änderung geht über das Tor; nach dem Speichern steht der Beleg da.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, Icon, Select, TextField } from "@paibot/ui";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import {
  belegAdresse,
  formularAus,
  type GrenzenFormular,
  grenzeErreicht,
  grenzenPruefen,
  verbrauchSatz,
} from "../../../lib/einstellungen/anzeige";
import type {
  EinstellungenAnzeige,
  EinstellungenGespeichert,
} from "../../../lib/einstellungen/typen";
import styles from "./einstellungen.module.css";

export interface GrenzenProps {
  anfang: EinstellungenAnzeige;
  /** Zeitzonen zur Auswahl (vom Server, damit Server und Browser dieselbe Liste zeigen). */
  zeitzonen: readonly string[];
}

type Meldung =
  | { art: "gespeichert"; beleg: EinstellungenGespeichert["beleg"] }
  | { art: "unveraendert" }
  | { art: "fehler"; text: string };

const FELD_ZU_FORMULAR: Record<string, "tagesbudget" | "verlaufsgrenze" | "zeitzone"> = {
  dailyTokenBudget: "tagesbudget",
  historyTokenLimit: "verlaufsgrenze",
  timezone: "zeitzone",
};

export function Grenzen({ anfang, zeitzonen }: GrenzenProps) {
  const [gespeichert, setGespeichert] = useState(anfang);
  const [formular, setFormular] = useState<GrenzenFormular>(() => formularAus(anfang));
  const [felder, setFelder] = useState<Partial<Record<keyof GrenzenFormular, string>>>({});
  const [meldung, setMeldung] = useState<Meldung | undefined>();
  const [sendet, setSendet] = useState(false);
  const optionen = useMemo(() => {
    const liste = zeitzonen.includes(gespeichert.zeitzone)
      ? zeitzonen
      : [gespeichert.zeitzone, ...zeitzonen];
    return liste.map((zone) => ({ wert: zone, text: zone.replaceAll("_", " ") }));
  }, [zeitzonen, gespeichert.zeitzone]);

  function setze(feld: keyof GrenzenFormular, wert: string) {
    setFormular((alt) => ({ ...alt, [feld]: wert }));
    setFelder((alt) => ({ ...alt, [feld]: undefined }));
    setMeldung(undefined);
  }

  async function speichern(event: FormEvent) {
    event.preventDefault();
    setMeldung(undefined);
    const pruefung = grenzenPruefen(formular, gespeichert);
    if (!pruefung.ok) {
      setFelder(pruefung.felder);
      const erstes = pruefung.felder.tagesbudget ? "grenze-tagesbudget" : "grenze-verlauf";
      document.getElementById(erstes)?.focus();
      return;
    }
    setFelder({});
    if (pruefung.leer) {
      setMeldung({ art: "unveraendert" });
      return;
    }
    setSendet(true);
    const antwort = await apiFetch<EinstellungenGespeichert>(
      "PATCH",
      "/api/einstellungen",
      pruefung.aenderung,
    );
    setSendet(false);
    if (antwort.ok) {
      setGespeichert(antwort.daten.einstellungen);
      setFormular(formularAus(antwort.daten.einstellungen));
      setMeldung({ art: "gespeichert", beleg: antwort.daten.beleg });
      return;
    }
    if (antwort.status === 401) {
      window.location.assign("/anmelden");
      return;
    }
    const text = antwort.fehler.ausweg
      ? `${antwort.fehler.text} ${antwort.fehler.ausweg}`
      : antwort.fehler.text;
    const feld = antwort.fehler.felder?.[0]?.feld;
    const ziel = feld ? FELD_ZU_FORMULAR[feld] : undefined;
    if (ziel) setFelder({ [ziel]: text });
    else setMeldung({ art: "fehler", text });
  }

  const erreicht = grenzeErreicht(gespeichert);
  return (
    <form className={styles.stapel} onSubmit={(e) => void speichern(e)} noValidate>
      <p className={styles.vorspann}>{t("einstellungen.grenzen.vorspann")}</p>

      <section className={styles.kachel} aria-labelledby="grenze-tag-titel">
        <h2 id="grenze-tag-titel">{t("einstellungen.tagesbudget")}</h2>
        <div className={styles.verbrauch}>
          <p className={styles.absatz}>
            <strong>{t("einstellungen.heute.titel")}:</strong> {verbrauchSatz(gespeichert)}
          </p>
          {gespeichert.tagesbudget !== null && (
            <progress
              className={styles.fortschritt}
              max={gespeichert.tagesbudget}
              value={Math.min(gespeichert.heute.token, gespeichert.tagesbudget)}
              data-erreicht={erreicht || undefined}
              aria-label={t("einstellungen.heute.titel")}
            />
          )}
          {erreicht && (
            <p className={`${styles.hinweis} ${styles.hinweisWarn}`} role="note">
              <Icon name="warnung" />
              <span>{t("einstellungen.heute.erreicht")}</span>
            </p>
          )}
        </div>
        <TextField
          id="grenze-tagesbudget"
          label={t("einstellungen.tagesbudget")}
          labelVersteckt
          inputMode="numeric"
          name="dailyTokenBudget"
          autoComplete="off"
          value={formular.tagesbudget}
          onChange={(e) => setze("tagesbudget", e.target.value)}
          hilfe={t("einstellungen.tagesbudget.hilfe")}
          fehler={felder.tagesbudget}
        />
      </section>

      <section className={styles.kachel} aria-labelledby="grenze-verlauf-titel">
        <h2 id="grenze-verlauf-titel">{t("einstellungen.verlaufsgrenze")}</h2>
        <TextField
          id="grenze-verlauf"
          label={t("einstellungen.verlaufsgrenze")}
          labelVersteckt
          inputMode="numeric"
          name="historyTokenLimit"
          autoComplete="off"
          value={formular.verlaufsgrenze}
          onChange={(e) => setze("verlaufsgrenze", e.target.value)}
          hilfe={t("einstellungen.verlaufsgrenze.hilfe")}
          fehler={felder.verlaufsgrenze}
        />
      </section>

      <section className={styles.kachel} aria-labelledby="grenze-zeitzone-titel">
        <h2 id="grenze-zeitzone-titel">{t("einstellungen.zeitzone")}</h2>
        <Select
          label={t("einstellungen.zeitzone")}
          labelVersteckt
          name="timezone"
          value={formular.zeitzone}
          onChange={(e) => setze("zeitzone", e.target.value)}
          optionen={optionen}
          hilfe={t("einstellungen.zeitzone.hilfe")}
          fehler={felder.zeitzone}
        />
      </section>

      <div className={styles.knoepfe}>
        <Button art="primaer" type="submit" laedt={sendet}>
          {sendet ? t("einstellungen.grenzen.laeuft") : t("allgemein.speichern")}
        </Button>
        <div aria-live="polite" className={styles.meldung}>
          {meldung?.art === "gespeichert" && (
            <>
              <span>{t("einstellungen.grenzen.gespeichert")}</span>
              <Link href={belegAdresse(meldung.beleg.id)} prefetch={false}>
                {t("einstellungen.grenzen.beleg", { nummer: meldung.beleg.nummer })}
              </Link>
            </>
          )}
          {meldung?.art === "unveraendert" && (
            <span>{t("einstellungen.grenzen.unveraendert")}</span>
          )}
        </div>
      </div>
      {meldung?.art === "fehler" && (
        <p className={styles.fehlerText} role="alert">
          {meldung.text}
        </p>
      )}
    </form>
  );
}
