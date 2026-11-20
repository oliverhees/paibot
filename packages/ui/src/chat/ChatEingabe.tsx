/**
 * PaiBot – Eingabe des Chats mit Schalter Datenschleuse, Senden und Stopp.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { t } from "@paibot/shared/texte";
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "../basis/IconButton";
import { Switch } from "../felder/Switch";
import styles from "./ChatEingabe.module.css";
import { eingabeAktion, sendbar } from "./eingabe";

export interface ChatEingabeProps {
  /** Text im Feld (gesteuert); ohne ihn verwaltet das Feld seinen Text selbst. */
  wert?: string;
  onWert?: (text: string) => void;
  onSenden: (text: string) => void;
  /** Läuft eine Antwort, wird aus „Senden“ der Knopf „Stopp“. */
  laeuft?: boolean;
  onStopp?: () => void;
  /** Schalter Datenschleuse für diese Unterhaltung. */
  schleuseAn: boolean;
  onSchleuse: (an: boolean) => void;
  /** Schalter nicht bedienbar (z. B. Datenschleuse nicht installiert). */
  schleuseDeaktiviert?: boolean;
  /** Platzhalter; Standard „Schreib eine Nachricht“. */
  platzhalter?: string;
  deaktiviert?: boolean;
  /** Zeile unter dem Feld, z. B. ein Hinweis zu Belegen. */
  notiz?: ReactNode;
}

/** Eingabe des Chats: Enter sendet, Umschalt+Enter neue Zeile, Schalter Datenschleuse, Stopp. */
export function ChatEingabe({
  wert,
  onWert,
  onSenden,
  laeuft = false,
  onStopp,
  schleuseAn,
  onSchleuse,
  schleuseDeaktiviert,
  platzhalter = t("chat.eingabe.platzhalter"),
  deaktiviert = false,
  notiz,
}: ChatEingabeProps) {
  const [eigen, setEigen] = useState("");
  const text = wert ?? eigen;
  const feld = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const setzen = (neu: string) => {
    if (wert === undefined) setEigen(neu);
    onWert?.(neu);
  };

  useLayoutEffect(() => {
    const el = feld.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  });

  const senden = () => {
    if (laeuft || deaktiviert || !sendbar(text)) return;
    onSenden(text.trim());
    setzen("");
  };

  return (
    <div className={styles.bereich}>
      <form
        className={styles.eingabe}
        data-deaktiviert={deaktiviert || undefined}
        onSubmit={(e) => {
          e.preventDefault();
          senden();
        }}
      >
        <label htmlFor={id} className={styles.versteckt}>
          {t("chat.eingabe.label")}
        </label>
        <textarea
          ref={feld}
          id={id}
          className={styles.text}
          rows={1}
          value={text}
          placeholder={platzhalter}
          disabled={deaktiviert}
          onChange={(e) => setzen(e.target.value)}
          onKeyDown={(e) => {
            if (eingabeAktion({ ...e, isComposing: e.nativeEvent.isComposing }) === "senden") {
              e.preventDefault();
              senden();
            }
          }}
        />
        <div className={styles.leiste}>
          <Switch
            an={schleuseAn}
            onAendern={onSchleuse}
            disabled={schleuseDeaktiviert || deaktiviert}
            label={t("schleuse.schalter")}
          >
            {t("seite.datenschleuse")}{" "}
            <span className={styles.zustand}>
              {schleuseAn ? t("schleuse.an") : t("schleuse.aus")}
            </span>
          </Switch>
        </div>
        <div className={styles.senden}>
          {laeuft ? (
            <IconButton
              icon="stopp"
              label={t("chat.stopp")}
              art="rund"
              groesse={34}
              onClick={onStopp}
            />
          ) : (
            <IconButton
              icon="hoch"
              label={t("chat.senden")}
              art="rund-akzent"
              groesse={34}
              type="submit"
              disabled={deaktiviert || !sendbar(text)}
            />
          )}
        </div>
      </form>
      {notiz && <p className={styles.notiz}>{notiz}</p>}
    </div>
  );
}
