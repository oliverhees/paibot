/**
 * PaiBot – Formular „Verbindung einfügen“: Adresse und Token einer App.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { type FormEvent, useState } from "react";
import { Button } from "../basis/Button";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import { TextField } from "../felder/TextField";
import { AppFehler, type AppFehlerArt } from "./AppFehler";
import { type AdressePruefung, normalisierteAdresse, pruefeAdresse } from "./adresse";
import styles from "./Verbindung.module.css";

export interface VerbindungDaten {
  adresse: string;
  /** Leer: kein neuer Token. Ein schon hinterlegter Token bleibt dann unverändert. */
  token: string;
}

export interface VerbindungFormProps {
  onVerbinden: (daten: VerbindungDaten) => void;
  onAbbrechen?: () => void;
  /** Verbindung wird gerade aufgebaut. */
  laeuft?: boolean;
  /** Antwort des Servers auf den letzten Versuch. */
  fehlerArt?: AppFehlerArt;
  /** Zu dieser Adresse ist schon ein Token hinterlegt. Er wird nie angezeigt, nur ersetzt. */
  tokenGesetzt?: boolean;
  /** Vorbelegte Adresse (beim Bearbeiten). */
  adresse?: string;
  /** Überschriften-Ebene (Standard 3). */
  ebene?: 2 | 3 | 4;
  className?: string;
}

const ADRESSE_FEHLER: Partial<Record<AdressePruefung, () => string>> = {
  leer: () => t("apps.form.adresse.leer"),
  kein_https: () => t("apps.form.adresse.kein_https"),
  befehl: () =>
    `${t("apps.fehler.befehl_nicht_erlaubt.titel")}. ${t("apps.fehler.befehl_nicht_erlaubt.ausweg")}`,
  zugang_in_adresse: () => t("apps.form.adresse.zugang"),
  port: () => t("apps.form.adresse.port"),
  zusatz: () => t("apps.form.adresse.zusatz"),
};

/**
 * Adresse und Token einer App. Der Token wird nach dem Absenden aus dem Feld gelöscht und nie
 * wieder angezeigt; ist schon einer hinterlegt, steht dort nur „Token hinterlegt“.
 */
export function VerbindungForm({
  onVerbinden,
  onAbbrechen,
  laeuft = false,
  fehlerArt,
  tokenGesetzt = false,
  adresse: anfang = "",
  ebene = 3,
  className,
}: VerbindungFormProps) {
  const Ueberschrift = `h${ebene}` as "h2" | "h3" | "h4";
  const [adresse, setAdresse] = useState(anfang);
  const [token, setToken] = useState("");
  const [ersetzen, setErsetzen] = useState(false);
  const [pruefung, setPruefung] = useState<AdressePruefung>("ok");
  const tokenFeldZeigen = !tokenGesetzt || ersetzen;
  // So verbindet sich PaiBot (Name in Punycode, ohne Zusätze); nur, solange die Eingabe taugt.
  const vorschau = pruefeAdresse(adresse) === "ok" ? normalisierteAdresse(adresse) : undefined;

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (laeuft) return;
    const ergebnis = pruefeAdresse(adresse);
    setPruefung(ergebnis);
    if (ergebnis !== "ok") return;
    onVerbinden({ adresse: adresse.trim(), token: tokenFeldZeigen ? token : "" });
    // Der Token bleibt nicht im Feld stehen; auch nicht, wenn der Versuch scheitert.
    setToken("");
    setErsetzen(false);
  };

  return (
    <form
      className={klassen(styles.form, className)}
      onSubmit={absenden}
      noValidate
      aria-busy={laeuft || undefined}
    >
      <Ueberschrift className={styles.titel}>{t("apps.form.titel")}</Ueberschrift>
      <TextField
        label={t("apps.form.adresse")}
        hilfe={t("apps.form.adresse.hilfe")}
        fehler={ADRESSE_FEHLER[pruefung]?.()}
        type="url"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={adresse}
        disabled={laeuft}
        onChange={(e) => {
          setAdresse(e.target.value);
          setPruefung("ok");
        }}
      />
      {vorschau !== undefined && (
        <p className={styles.leise} data-vorschau="">
          {t("apps.form.adresse.vorschau")} <code>{vorschau}</code>
        </p>
      )}
      {tokenFeldZeigen ? (
        <TextField
          label={t("apps.form.token")}
          hilfe={t("apps.form.token.hilfe")}
          type="password"
          name="zugang"
          autoComplete="new-password"
          autoCapitalize="off"
          spellCheck={false}
          value={token}
          disabled={laeuft}
          onChange={(e) => setToken(e.target.value)}
        />
      ) : (
        <div className={styles.gesetzt}>
          <div className={styles.gesetztText}>
            <span className={styles.gesetztTitel}>
              <Icon name="check" groesse={14} />
              {t("apps.form.token.gesetzt")}
            </span>
            <span className={styles.leise}>{t("apps.form.token.gesetzt.hilfe")}</span>
          </div>
          <Button art="leise" onClick={() => setErsetzen(true)} disabled={laeuft}>
            {t("apps.form.token.ersetzen")}
          </Button>
        </div>
      )}
      {fehlerArt && <AppFehler art={fehlerArt} />}
      <div className={styles.knoepfe}>
        <Button type="submit" art="primaer" laedt={laeuft}>
          {laeuft ? t("apps.form.verbindet") : t("apps.form.verbinden")}
        </Button>
        {onAbbrechen && (
          <Button art="leise" onClick={onAbbrechen} disabled={laeuft}>
            {t("apps.form.abbrechen")}
          </Button>
        )}
      </div>
    </form>
  );
}
