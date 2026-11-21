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
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../basis/Icon";
import { IconButton } from "../basis/IconButton";
import { Switch } from "../felder/Switch";
import styles from "./ChatEingabe.module.css";
import { eingabeAktion, type FokusOrt, fokusZurueck, sendbar } from "./eingabe";

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
  const form = useRef<HTMLFormElement>(null);
  /** Nach Senden oder „Stopp“ soll der Cursor zurück ins Feld, sobald es wieder bedienbar ist. */
  const zurueck = useRef(false);
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

  // Fokus zurück ins Feld: nach dem Senden (auch wenn das Feld kurz gesperrt war), wenn die
  // Antwort fertig ist und nach „Stopp“ – aber nie, wenn der Fokus inzwischen woanders steht.
  useEffect(() => {
    const el = feld.current;
    if (!el || typeof document === "undefined") return;
    const aktiv = document.activeElement;
    const ort: FokusOrt =
      aktiv === el
        ? "feld"
        : aktiv && form.current?.contains(aktiv)
          ? "eingabe"
          : !aktiv || aktiv === document.body
            ? "nirgends"
            : "anderswo";
    if (fokusZurueck(ort, zurueck.current, deaktiviert)) el.focus();
    if (!deaktiviert && !laeuft && ort !== "anderswo") zurueck.current = false;
    if (ort === "anderswo") zurueck.current = false;
  }, [deaktiviert, laeuft]);

  const senden = () => {
    if (laeuft || deaktiviert || !sendbar(text)) return;
    zurueck.current = true;
    onSenden(text.trim());
    setzen("");
    feld.current?.focus();
  };

  return (
    <div className={styles.bereich}>
      <form
        ref={form}
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
          {/* Plätze für spätere Funktionen: gesperrt, ohne Verhalten, mit Hinweis „kommt später“. */}
          {(
            [
              ["anhang", t("chat.eingabe.anhang")],
              ["mikrofon", t("chat.eingabe.sprache")],
            ] as const
          ).map(([icon, hinweis]) => (
            <span key={icon} className={styles.spaeter} title={hinweis}>
              <button type="button" className={styles.spaeterKnopf} disabled aria-label={hinweis}>
                <Icon name={icon} groesse={16} />
              </button>
            </span>
          ))}
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
              onClick={() => {
                zurueck.current = true;
                onStopp?.();
              }}
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
