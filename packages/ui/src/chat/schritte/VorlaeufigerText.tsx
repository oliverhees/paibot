/**
 * PaiBot – Vorläufiger Text außerhalb der Antwort-Blase: reiner Text, deutlich gekennzeichnet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { t } from "@paibot/shared/texte";
import { Icon } from "../../basis/Icon";
import styles from "./Schritte.module.css";
import { schrittText } from "./text";

export interface VorlaeufigerTextProps {
  /** Text des Modells bis jetzt. Wird als reiner Text gezeigt, nie als Markdown oder HTML. */
  text: string;
  /** läuft: Pai schreibt noch · abgebrochen: der Lauf endete, der Text bleibt stehen. */
  zustand: "laeuft" | "abgebrochen";
  /** Name des Bots. */
  name: string;
  /**
   * Eigener Wortlaut der Kennzeichnung (nur für Vergleiche von Entwürfen). Er kommt vom
   * Aufrufer, nie aus dem Text des Modells.
   */
  markeText?: string;
}

/**
 * Der Text, den Pai gerade schreibt, bevor feststeht, ob er eine Antwort wird. Er steht nie in der
 * Blase, sieht sichtbar anders aus als sie und trägt immer seine Kennzeichnung. Er wird nicht
 * vorgelesen, wenn er wächst (kein Live-Bereich).
 */
export function VorlaeufigerText({ text, zustand, name, markeText }: VorlaeufigerTextProps) {
  const laeuft = zustand === "laeuft";
  const botName = schrittText(name, "name");
  const marke = markeText ?? t(laeuft ? "schritte.vorlaeufig.marke" : "schritte.abgebrochen.marke");
  return (
    <section
      className={styles.vorlaeufig}
      data-baustein="vorlaeufiger-text"
      data-zustand={zustand}
      aria-label={t(laeuft ? "schritte.vorlaeufig.label" : "schritte.abgebrochen.label")}
    >
      <p className={styles.vorlaeufigKopf}>
        <span className={styles.etikett}>
          {t(laeuft ? "schritte.vorlaeufig.etikett" : "schritte.abgebrochen.etikett", {
            name: botName,
          })}
        </span>
        <span
          className={styles.marke}
          data-marke={laeuft ? "vorlaeufig" : "abgebrochen"}
          role="note"
        >
          <Icon name={laeuft ? "stift" : "stopp"} groesse={12} />
          <span>{marke}</span>
        </span>
      </p>
      <p className={styles.vorlaeufigText} dir="auto" data-fremd="vorlaeufig">
        {schrittText(text, "vorlaeufig")}
      </p>
    </section>
  );
}
