/**
 * PaiBot – Formular für einen eigenen oder lokalen Anbieter: Name, Adresse, Ort des Dienstes und
 * Schlüssel (ersetzen oder bei „lokal“ entfernen). Speichern testet vorher die Verbindung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { LIMITS } from "@paibot/shared/konstanten";
import type { Provider } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { Button, Icon, Select, Switch, TextField } from "@paibot/ui";
import { useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import {
  EIGENE_REGIONEN,
  type EigenFehler,
  type EigenWerte,
  eigenFehlerAus,
  eigenKoerper,
  eigenPruefen,
  neueWerte,
  schluesselEntfernbar,
  unverschluesselt,
  werteVon,
} from "../../../lib/modelle/eigen";
import styles from "./modelle.module.css";

export interface EigenerAnbieterFormProps {
  /** Gespeicherter Anbieter beim Ändern; ohne ihn legt das Formular einen neuen an. */
  anbieter?: Provider;
  onGespeichert: (anbieter: Provider) => void;
  onAbbrechen: () => void;
}

export function EigenerAnbieterForm({
  anbieter,
  onGespeichert,
  onAbbrechen,
}: EigenerAnbieterFormProps) {
  const [werte, setWerte] = useState<EigenWerte>(() =>
    anbieter ? werteVon(anbieter) : neueWerte(),
  );
  const [fehler, setFehler] = useState<EigenFehler>({});
  const [meldung, setMeldung] = useState<{ text: string; ausweg?: string } | undefined>();
  const [speichert, setSpeichert] = useState(false);
  const titelId = useId();
  const ersterFeld = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ersterFeld.current?.querySelector("input")?.focus();
  }, []);

  function aendern(teil: Partial<EigenWerte>) {
    setWerte((w) => ({ ...w, ...teil }));
    setMeldung(undefined);
    setFehler((f) => {
      const neu = { ...f };
      for (const k of Object.keys(teil)) {
        if (k === "name" || k === "baseUrl" || k === "apiKey") delete neu[k];
        if (k === "schluesselEntfernen" || k === "region") delete neu.apiKey;
      }
      return neu;
    });
  }

  async function speichern() {
    setMeldung(undefined);
    const vorab = eigenPruefen(werte);
    setFehler(vorab);
    if (Object.keys(vorab).length > 0) return;
    setSpeichert(true);
    const koerper = eigenKoerper(werte, anbieter);
    const antwort =
      anbieter === undefined
        ? await apiFetch<{ anbieter: Provider }>("POST", "/api/anbieter", koerper)
        : await apiFetch<{ anbieter: Provider }>(
            "PUT",
            `/api/anbieter/${encodeURIComponent(anbieter.id)}`,
            koerper,
          );
    setSpeichert(false);
    if (!antwort.ok) {
      const { felder, rest } = eigenFehlerAus(antwort.fehler);
      setFehler(felder);
      if (rest) {
        setMeldung({
          text: antwort.fehler.text,
          ...(antwort.fehler.ausweg ? { ausweg: antwort.fehler.ausweg } : {}),
        });
      }
      return;
    }
    setWerte((w) => ({ ...w, apiKey: "" }));
    onGespeichert(antwort.daten.anbieter);
  }

  const entfernbar = schluesselEntfernbar(anbieter, werte.region);
  const lokal = werte.region === "local";

  return (
    <section className={styles.eigenForm} aria-labelledby={titelId}>
      <h3 id={titelId} className={styles.eigenTitel}>
        {anbieter
          ? t("modelle.eigen.form.aendern", { anbieter: anbieter.name })
          : t("modelle.eigen.form.neu")}
      </h3>
      <div ref={ersterFeld}>
        <TextField
          label={t("modelle.eigen.name")}
          name="name"
          autoComplete="off"
          maxLength={LIMITS.providerNameChars}
          value={werte.name}
          onChange={(e) => aendern({ name: e.target.value })}
          fehler={fehler.name}
          hilfe={t("modelle.eigen.name.hilfe")}
        />
      </div>
      <TextField
        label={t("modelle.eigen.adresse")}
        name="baseUrl"
        type="url"
        maxLength={LIMITS.baseUrlChars}
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        className={styles.mono}
        value={werte.baseUrl}
        onChange={(e) => aendern({ baseUrl: e.target.value })}
        fehler={fehler.baseUrl}
        hilfe={t("modelle.eigen.adresse.hilfe")}
      />
      <Select
        label={t("modelle.eigen.ort")}
        name="region"
        value={werte.region}
        optionen={EIGENE_REGIONEN.map((r) => ({ wert: r, text: t(`modelle.eigen.ort.${r}`) }))}
        onChange={(e) => aendern({ region: e.target.value as EigenWerte["region"] })}
        hilfe={lokal ? t("modelle.eigen.ort.hilfe.local") : t("modelle.eigen.ort.hilfe")}
      />
      {unverschluesselt(werte.baseUrl, werte.region) && (
        <div className={styles.meldung} data-art="warn">
          <Icon name="info" />
          <p>{t("modelle.eigen.warnung.unverschluesselt")}</p>
        </div>
      )}
      {!(entfernbar && werte.schluesselEntfernen) && (
        <TextField
          label={lokal ? t("modelle.eigen.schluessel.optional") : t("modelle.eigen.schluessel")}
          type="password"
          name="apiKey"
          autoComplete="off"
          spellCheck={false}
          className={styles.mono}
          value={werte.apiKey}
          onChange={(e) => aendern({ apiKey: e.target.value })}
          fehler={fehler.apiKey}
          hilfe={
            anbieter
              ? t("modelle.eigen.schluessel.hilfe.aendern")
              : t("modelle.eigen.schluessel.hilfe.neu")
          }
        />
      )}
      {entfernbar && (
        <div className={styles.schalterZeile}>
          <Switch
            an={werte.schluesselEntfernen}
            onAendern={(an) => aendern({ schluesselEntfernen: an, apiKey: "" })}
          >
            {t("modelle.eigen.schluessel.entfernen")}
          </Switch>
          <p className={styles.leise}>{t("modelle.eigen.schluessel.entfernen.hilfe")}</p>
          {fehler.apiKey && werte.schluesselEntfernen && (
            <p className={styles.feldFehler}>{fehler.apiKey}</p>
          )}
        </div>
      )}
      <p className={styles.leise}>{t("modelle.eigen.speichern.hilfe")}</p>
      <div className={styles.knoepfe}>
        <Button art="primaer" onClick={() => void speichern()} laedt={speichert}>
          {speichert ? t("modelle.eigen.speichert") : t("modelle.eigen.speichern")}
        </Button>
        <Button art="leise" onClick={onAbbrechen} disabled={speichert}>
          {t("allgemein.abbrechen")}
        </Button>
      </div>
      <div role="status" aria-live="polite" className={styles.live}>
        {meldung && (
          <div className={styles.meldung} data-art="fehler">
            <Icon name="info" />
            <p>
              {meldung.text}
              {meldung.ausweg && <span className={styles.ausweg}> {meldung.ausweg}</span>}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
