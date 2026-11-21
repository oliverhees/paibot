/**
 * PaiBot – Karte „Anbieter hinzufügen“ auf der Seite „Modell und Anbieter“: Auswahl (EUrouter,
 * Mistral AI, eigener oder lokaler Anbieter), bei einer Vorlage der Schlüssel mit deutlichem
 * Ergebnis des Verbindungstests, sonst das Formular für einen eigenen Anbieter.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { Provider } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { Button, Karte, TestErgebnis, TextField } from "@paibot/ui";
import { useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import type { AnbieterVorlage } from "../../../lib/modelle/anbieter";
import type { AnbieterWahl } from "../../../lib/modelle/konto-links";
import { AnbieterAuswahl } from "../../AnbieterAuswahl";
import { EigenerAnbieterForm } from "./EigenerAnbieterForm";
import styles from "./modelle.module.css";

export interface AnbieterHinzufuegenProps {
  vorlagen: { eurouter: AnbieterVorlage; mistral: AnbieterVorlage };
  /** Schon gespeicherte Anbieter: eine Vorlage gibt es höchstens einmal. */
  vorhanden: readonly Provider[];
  onGespeichert: (neu: Provider) => void;
}

export function AnbieterHinzufuegen({
  vorlagen,
  vorhanden,
  onGespeichert,
}: AnbieterHinzufuegenProps) {
  const [offen, setOffen] = useState(false);
  const [wahl, setWahl] = useState<AnbieterWahl | undefined>();
  const [schluessel, setSchluessel] = useState("");
  const [feldFehler, setFeldFehler] = useState<string | undefined>();
  const [speichert, setSpeichert] = useState(false);
  const [ergebnis, setErgebnis] = useState<
    { art: "ok" | "fehler"; titel: string; text: string } | undefined
  >();

  const schonDa = (w: AnbieterWahl) =>
    w !== "eigener" && vorhanden.some((a) => a.templateKey === w);
  const wege = (["eurouter", "mistral", "eigener"] as const).filter((w) => !schonDa(w));
  const vorlage = wahl === undefined || wahl === "eigener" ? undefined : vorlagen[wahl];

  function schliessen() {
    setOffen(false);
    setWahl(undefined);
    setSchluessel("");
    setFeldFehler(undefined);
  }

  async function speichern() {
    if (vorlage === undefined) return;
    setErgebnis(undefined);
    if (schluessel.trim() === "") {
      setFeldFehler(t("modelle.schluessel.leer"));
      return;
    }
    setFeldFehler(undefined);
    setSpeichert(true);
    const antwort = await apiFetch<{ anbieter: Provider }>("POST", "/api/anbieter", {
      templateKey: vorlage.templateKey,
      name: vorlage.name,
      baseUrl: vorlage.baseUrl,
      region: vorlage.region,
      apiKey: schluessel,
    });
    setSpeichert(false);
    if (!antwort.ok) {
      if (antwort.fehler.felder?.some((f) => f.feld === "apiKey")) {
        setFeldFehler(antwort.fehler.text);
      }
      setErgebnis({
        art: "fehler",
        titel: t("anbieterwahl.test.fehler"),
        text: [antwort.fehler.text, antwort.fehler.ausweg].filter(Boolean).join(" "),
      });
      return;
    }
    setErgebnis({
      art: "ok",
      titel: t("anbieterwahl.test.ok"),
      text:
        vorlage.templateKey === "eurouter"
          ? t("anbieterwahl.gespeichert.regeln", { anbieter: vorlage.name })
          : t("modelle.schluessel.gespeichert", { anbieter: vorlage.name }),
    });
    schliessen();
    onGespeichert(antwort.daten.anbieter);
  }

  return (
    <Karte titel={t("anbieterwahl.karte.titel")}>
      <p className={styles.leise}>{t("anbieterwahl.karte.text")}</p>
      {!offen ? (
        <div className={styles.knoepfe}>
          <Button
            art="zweit"
            icon="plus"
            onClick={() => {
              setErgebnis(undefined);
              setOffen(true);
            }}
          >
            {t("anbieterwahl.karte.hinzufuegen")}
          </Button>
        </div>
      ) : (
        <>
          <AnbieterAuswahl
            wert={wahl}
            wege={wege}
            onWahl={(w) => {
              setWahl(w);
              setSchluessel("");
              setFeldFehler(undefined);
              setErgebnis(undefined);
            }}
          />
          {wahl === "eigener" && (
            <EigenerAnbieterForm
              onGespeichert={(neu) => {
                schliessen();
                onGespeichert(neu);
              }}
              onAbbrechen={schliessen}
            />
          )}
          {vorlage !== undefined && (
            <>
              <div className={styles.form}>
                <TextField
                  label={t("modelle.schluessel.neu", { anbieter: vorlage.name })}
                  type="password"
                  name="neuerSchluessel"
                  autoComplete="off"
                  spellCheck={false}
                  className={styles.mono}
                  value={schluessel}
                  onChange={(e) => {
                    setSchluessel(e.target.value);
                    setFeldFehler(undefined);
                    setErgebnis(undefined);
                  }}
                  laedt={speichert}
                  fehler={feldFehler}
                  hilfe={t("modelle.schluessel.hilfe", { anbieter: vorlage.name })}
                />
              </div>
              <div className={styles.knoepfe}>
                <Button art="primaer" onClick={() => void speichern()} laedt={speichert}>
                  {t("anbieterwahl.karte.speichern")}
                </Button>
                <Button art="leise" onClick={schliessen}>
                  {t("allgemein.abbrechen")}
                </Button>
              </div>
            </>
          )}
          {wahl === undefined && (
            <div className={styles.knoepfe}>
              <Button art="leise" onClick={schliessen}>
                {t("allgemein.abbrechen")}
              </Button>
            </div>
          )}
        </>
      )}
      <div aria-live="polite" className={styles.live}>
        {speichert && <span className={styles.leise}>{t("modelle.verbindung.laeuft")}</span>}
        {ergebnis && (
          <TestErgebnis art={ergebnis.art} titel={ergebnis.titel}>
            {ergebnis.text}
          </TestErgebnis>
        )}
      </div>
    </Karte>
  );
}
