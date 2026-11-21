/**
 * PaiBot – Abgesetzter Textblock mit Knopf zum Kopieren.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { useEffect, useState } from "react";
import { Icon } from "../basis/Icon";
import styles from "./EntwurfBlock.module.css";

export interface EntwurfTexte {
  /** Etikett über dem Block, z. B. „Entwurf“. */
  etikett: string;
  /** Knopf, z. B. „Kopieren“. */
  kopieren: string;
  /** Rückmeldung nach dem Kopieren, z. B. „Kopiert“. */
  kopiert: string;
}

export interface EntwurfBlockProps {
  text: string;
  texte: EntwurfTexte;
  /** Programmiersprache bei Code; dann Schreibmaschinenschrift. */
  sprache?: string;
  /** Der Text liegt in der Zwischenablage (nur nach gelungenem Kopieren). */
  onKopiert?: () => void;
}

/** Abgesetzter Textblock (z. B. ein Mail-Entwurf) mit Knopf zum Kopieren. */
export function EntwurfBlock({ text, texte, sprache, onKopiert }: EntwurfBlockProps) {
  const [kopiert, setKopiert] = useState(false);
  useEffect(() => {
    if (!kopiert) return;
    const u = setTimeout(() => setKopiert(false), 1800);
    return () => clearTimeout(u);
  }, [kopiert]);
  return (
    <div className={styles.block} data-code={sprache ? "true" : undefined}>
      <div className={styles.kopf}>
        <span className={styles.etikett}>{sprache ?? texte.etikett}</span>
        <button
          type="button"
          className={styles.kopieren}
          onClick={() => {
            navigator.clipboard?.writeText(text).then(
              () => {
                setKopiert(true);
                onKopiert?.();
              },
              () => setKopiert(false),
            );
          }}
        >
          <Icon name={kopiert ? "check" : "kopieren"} groesse={14} />
          <span aria-live="polite">{kopiert ? texte.kopiert : texte.kopieren}</span>
        </button>
      </div>
      <pre className={styles.text}>{text}</pre>
    </div>
  );
}
