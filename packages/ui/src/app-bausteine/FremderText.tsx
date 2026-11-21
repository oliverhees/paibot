/**
 * PaiBot – Fremder Text aus einer App: bereinigt, gekürzt, nur als Text angezeigt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useId, useState } from "react";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import styles from "./Fremd.module.css";
import { bereinigeFremdText, type FremdArt } from "./fremdText";

export interface FremderTextProps {
  /** Der Text, wie ihn die App geliefert hat. Wird hier noch einmal bereinigt und gekürzt. */
  text: string | undefined;
  art: FremdArt;
  /**
   * zeile: in einer Zeile mitten im Text · kasten: gekennzeichneter Kasten, bei Länge aufklappbar ·
   * block: wie der Kasten ohne eigene Kennzeichnung (wenn der Rahmen schon sagt, woher der Text kommt).
   */
  darstellung?: "zeile" | "kasten" | "block";
  className?: string;
}

/** Ab so vielen Zeichen bietet der Kasten „Ganz zeigen“ an (drei Zeilen reichen sonst nicht). */
const KASTEN_KURZ = 170;

/**
 * Text, den eine App über sich oder ihre Werkzeuge sagt. React setzt ihn als Textknoten ein:
 * Tags, Skripte und Markdown-Links erscheinen als Zeichen, nie als Element und nie als Link.
 * Der Kasten sagt ausdrücklich, dass der Text nicht von PaiBot kommt.
 */
export function FremderText({ text, art, darstellung = "zeile", className }: FremderTextProps) {
  const { text: sauber, gekuerzt } = bereinigeFremdText(text, art);
  const hinweisId = useId();
  const [ganz, setGanz] = useState(false);

  if (darstellung === "zeile") {
    return sauber === "" ? (
      <span className={klassen(styles.zeile, styles.leer, className)}>{t("apps.fremd.leer")}</span>
    ) : (
      <bdi className={klassen(styles.zeile, className)} data-fremd={art}>
        {sauber}
      </bdi>
    );
  }

  const lang = sauber.length > KASTEN_KURZ || sauber.split("\n").length > 3;
  return (
    <section
      className={klassen(styles.kasten, darstellung === "block" && styles.block, className)}
      data-fremd={art}
      aria-label={t("apps.fremd.label")}
      aria-describedby={darstellung === "kasten" ? hinweisId : undefined}
    >
      {darstellung === "kasten" && (
        <p className={styles.kopf} id={hinweisId}>
          <span className={styles.marke}>
            <Icon name="info" groesse={14} />
            {t("apps.fremd.label")}
          </span>
          <span>{t("apps.fremd.hinweis")}</span>
        </p>
      )}
      {sauber === "" ? (
        <p className={klassen(styles.text, styles.leer)}>{t("apps.fremd.leer")}</p>
      ) : (
        <p className={klassen(styles.text, lang && !ganz && styles.zu)} dir="auto">
          {sauber}
        </p>
      )}
      {gekuerzt && <span className={styles.gekuerzt}>({t("apps.fremd.gekuerzt")})</span>}
      {lang && (
        <button
          type="button"
          className={styles.mehr}
          aria-expanded={ganz}
          onClick={() => setGanz(!ganz)}
        >
          {ganz ? t("apps.fremd.weniger") : t("apps.fremd.mehr")}
        </button>
      )}
    </section>
  );
}
