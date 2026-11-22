/**
 * PaiBot – Karte „Zweiter Schlüssel“ für EUrouter: ein Verwaltungsschlüssel nur zum Lesen der
 * Routing-Regeln des Kontos. Der Schlüssel wird nie angezeigt; eintragen, ersetzen, entfernen.
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
import { Button, Icon, Karte, StatusChip, TestErgebnis, TextField } from "@paibot/ui";
import { useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import styles from "./modelle.module.css";
import type { RegelEintragAnsicht } from "./RegelnKarte";

export interface VerwaltungsKarteProps {
  anbieter: Provider;
  onAnbieter: (anbieter: Provider) => void;
  onRegeln: (regeln: RegelEintragAnsicht[]) => void;
}

type Ergebnis = { art: "ok" | "fehler"; titel: string; text: string } | undefined;

export function VerwaltungsKarte({ anbieter, onAnbieter, onRegeln }: VerwaltungsKarteProps) {
  const [offen, setOffen] = useState(false);
  const [wert, setWert] = useState("");
  const [feldFehler, setFeldFehler] = useState<string | undefined>();
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<Ergebnis>();
  const gesetzt = anbieter.managementKeySet === true;
  const pfad = `/api/anbieter/${encodeURIComponent(anbieter.id)}/verwaltungsschluessel`;

  async function speichern() {
    setErgebnis(undefined);
    if (wert.trim() === "") {
      setFeldFehler(t("verwaltung.feld.leer"));
      return;
    }
    setFeldFehler(undefined);
    setLaeuft(true);
    const antwort = await apiFetch<{ anbieter: Provider; regeln: RegelEintragAnsicht[] }>(
      "PUT",
      pfad,
      { managementKey: wert },
    );
    setLaeuft(false);
    if (!antwort.ok) {
      if (antwort.fehler.felder?.some((f) => f.feld === "managementKey")) {
        setFeldFehler(antwort.fehler.text);
      }
      setErgebnis({
        art: "fehler",
        titel: t("verwaltung.fehler.titel"),
        text: [antwort.fehler.text, antwort.fehler.ausweg].filter(Boolean).join(" "),
      });
      return;
    }
    setWert("");
    setOffen(false);
    onAnbieter(antwort.daten.anbieter);
    onRegeln(antwort.daten.regeln);
    setErgebnis({
      art: "ok",
      titel: t("verwaltung.status.gesetzt"),
      text: t("verwaltung.gespeichert"),
    });
  }

  async function entfernen() {
    setErgebnis(undefined);
    setLaeuft(true);
    const antwort = await apiFetch<{ anbieter: Provider; regeln: RegelEintragAnsicht[] }>(
      "DELETE",
      pfad,
    );
    setLaeuft(false);
    if (!antwort.ok) {
      setErgebnis({
        art: "fehler",
        titel: t("verwaltung.fehler.titel"),
        text: [antwort.fehler.text, antwort.fehler.ausweg].filter(Boolean).join(" "),
      });
      return;
    }
    onAnbieter(antwort.daten.anbieter);
    onRegeln(antwort.daten.regeln);
    setErgebnis({ art: "ok", titel: t("verwaltung.status.fehlt"), text: t("verwaltung.entfernt") });
  }

  return (
    <Karte
      titel={t("verwaltung.titel")}
      rechts={
        <StatusChip art={gesetzt ? "ok" : "neutral"}>
          {gesetzt ? t("verwaltung.status.gesetzt") : t("verwaltung.status.fehlt")}
        </StatusChip>
      }
    >
      <p className={styles.leise}>{t("verwaltung.text", { anbieter: anbieter.name })}</p>
      {offen && (
        <div className={styles.form}>
          <TextField
            label={t("verwaltung.feld")}
            type="password"
            name="managementKey"
            autoComplete="off"
            spellCheck={false}
            className={styles.mono}
            value={wert}
            onChange={(e) => {
              setWert(e.target.value);
              setFeldFehler(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void speichern();
              }
            }}
            laedt={laeuft}
            fehler={feldFehler}
            hilfe={t("verwaltung.feld.hilfe", { anbieter: anbieter.name })}
          />
        </div>
      )}
      <div className={styles.knoepfe}>
        {offen ? (
          <>
            <Button art="primaer" onClick={() => void speichern()} laedt={laeuft}>
              {laeuft ? t("verwaltung.speichert") : t("verwaltung.speichern")}
            </Button>
            <Button
              art="leise"
              onClick={() => {
                setOffen(false);
                setWert("");
                setFeldFehler(undefined);
              }}
            >
              {t("allgemein.abbrechen")}
            </Button>
          </>
        ) : (
          <>
            <Button
              art="zweit"
              onClick={() => {
                setErgebnis(undefined);
                setOffen(true);
              }}
            >
              {gesetzt ? t("verwaltung.ersetzen") : t("verwaltung.eintragen")}
            </Button>
            {gesetzt && (
              <Button art="leise" icon="papierkorb" onClick={() => void entfernen()} laedt={laeuft}>
                {t("verwaltung.entfernen")}
              </Button>
            )}
          </>
        )}
      </div>
      <div role="status" aria-live="polite" className={styles.live}>
        {gesetzt && !offen && (
          <span className={styles.hinterlegt}>
            <Icon name="check" />
            {t("modelle.schluessel.hinterlegt")}
          </span>
        )}
        {ergebnis && (
          <TestErgebnis art={ergebnis.art} titel={ergebnis.titel}>
            {ergebnis.text}
          </TestErgebnis>
        )}
      </div>
    </Karte>
  );
}
