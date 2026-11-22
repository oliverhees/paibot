/**
 * PaiBot – Nachricht im Verlauf, von dir oder vom Bot.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ReactNode } from "react";
import { klassen } from "../basis/klassen";
import styles from "./ChatBubble.module.css";

export interface ChatBubbleProps {
  von: "du" | "bot";
  children?: ReactNode;
  /** Uhrzeit, z. B. „14:32“. */
  zeit?: string;
  /** Name des Bots über der Antwort. */
  name?: string;
  /** Avatar neben der Antwort des Bots. */
  avatar?: ReactNode;
  /** Zeile unter der Antwort (Beleg, Datenschleuse, Modell) oder Hinweise. */
  fuss?: ReactNode;
  /** Schritte über der Antwort (Werkzeug-Zeilen, Zwischenschritte, vorläufiger Text). */
  davor?: ReactNode;
  /** Ohne Blase: solange es noch keine Antwort gibt, steht nur `davor` im Block des Bots. */
  ohneBlase?: boolean;
  /** streamt: Schreibmarke am Ende; abgebrochen/fehler: ruhigere bzw. markierte Blase. */
  zustand?: "fertig" | "streamt" | "abgebrochen" | "fehler";
  /** Hinweis zum Zustand, z. B. „Abgebrochen“ (immer mit Wort). */
  zustandText?: string;
}

/** Eine Nachricht im Verlauf: rechts deine, links die des Bots mit Avatar und Fußzeile. */
export function ChatBubble({
  von,
  children,
  zeit,
  name,
  avatar,
  fuss,
  davor,
  ohneBlase = false,
  zustand = "fertig",
  zustandText,
}: ChatBubbleProps) {
  if (von === "du") {
    return (
      <div className={styles.du}>
        <div className={styles.blase}>{children}</div>
        {zeit && <span className={styles.zeit}>{zeit}</span>}
      </div>
    );
  }
  return (
    <div
      className={styles.bot}
      data-zustand={zustand}
      aria-busy={zustand === "streamt" || undefined}
    >
      <div className={styles.avatar}>{avatar}</div>
      <div className={styles.spalte}>
        {(name || zeit) && (
          <div className={styles.wer}>
            {name && <strong>{name}</strong>}
            {zeit && <span className={styles.zeit}>{zeit}</span>}
          </div>
        )}
        {davor}
        {!ohneBlase && (
          <div className={klassen(styles.blase, styles.blaseBot)}>
            {children}
            {zustand === "streamt" && <span className={styles.marke} aria-hidden="true" />}
          </div>
        )}
        {zustandText && <p className={styles.zustand}>{zustandText}</p>}
        {fuss}
      </div>
    </div>
  );
}
