/**
 * PaiBot – Formular zum Neu-Verbinden einer getrennten App: gleiche Adresse, neuer Token.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

"use client";

import { t } from "@paibot/shared/texte";
import { type FormEvent, useState } from "react";
import { Button } from "../basis/Button";
import { klassen } from "../basis/klassen";
import { TextField } from "../felder/TextField";
import { AppFehler, type AppFehlerArt } from "./AppFehler";
import { FremderText } from "./FremderText";
import styles from "./Verbindung.module.css";

export interface NeuVerbindenFormProps {
  /** Name der App (fremder Text). */
  name: string;
  /** Gespeicherte Adresse; PaiBot verbindet sich nur mit ihr. */
  adresse: string;
  /** Die App meldete sich mit Token an: ein neuer Token ist nötig (der alte ist gelöscht). */
  tokenNoetig: boolean;
  /** Der Token (leer, wenn keiner nötig ist). Er wird danach aus dem Feld gelöscht. */
  onVerbinden: (token: string) => void;
  onAbbrechen?: () => void;
  laeuft?: boolean;
  fehlerArt?: AppFehlerArt;
  className?: string;
}

/**
 * Eine getrennte App wieder verbinden. Es gibt keine neue Adresse; nur der Token ist neu. Das
 * Feld ist ein Passwortfeld ohne Namen und merkt sich nichts; der Wert bleibt nach dem Absenden
 * nicht stehen, auch nicht nach einem Fehler.
 */
export function NeuVerbindenForm({
  name,
  adresse,
  tokenNoetig,
  onVerbinden,
  onAbbrechen,
  laeuft = false,
  fehlerArt,
  className,
}: NeuVerbindenFormProps) {
  const [token, setToken] = useState("");
  const [leer, setLeer] = useState(false);

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (laeuft) return;
    if (tokenNoetig && token.trim() === "") {
      setLeer(true);
      return;
    }
    onVerbinden(tokenNoetig ? token : "");
    // Der Token bleibt nicht im Feld stehen; auch nicht, wenn der Versuch scheitert.
    setToken("");
    setLeer(false);
  };

  return (
    <form
      className={klassen(styles.form, className)}
      onSubmit={absenden}
      method="post"
      autoComplete="off"
      noValidate
      aria-busy={laeuft || undefined}
      data-neu-verbinden=""
    >
      <h3 className={styles.titel}>
        {t("apps.neu.titel")} <FremderText text={name} art="name" />
      </h3>
      <p className={styles.leise}>
        {t("apps.neu.hilfe")} <code>{adresse}</code>
      </p>
      {tokenNoetig && (
        <TextField
          label={t("apps.neu.token")}
          hilfe={t("apps.neu.token.hilfe")}
          fehler={leer ? t("apps.neu.token.leer") : undefined}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={token}
          disabled={laeuft}
          onChange={(e) => {
            setToken(e.target.value);
            setLeer(false);
          }}
        />
      )}
      {fehlerArt && <AppFehler art={fehlerArt} />}
      <div className={styles.knoepfe}>
        <Button type="submit" art="primaer" laedt={laeuft}>
          {laeuft ? t("apps.form.verbindet") : t("apps.neu.verbinden")}
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
