/**
 * PaiBot – Kasten für den Anker der Beleg-Kette: Text zum Kopieren, Knopf zum Sichern als Datei,
 * kurze Erklärung; darunter Platz für eigene Felder (z. B. Prüfen mit dem aufbewahrten Anker).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { type ReactNode, useId, useState } from "react";
import { Button } from "../basis/Button";
import styles from "./AnkerKasten.module.css";

export interface AnkerKastenTexte {
  kopieren: string;
  kopiert: string;
  /** Wenn das Kopieren nicht geht (z. B. ohne Freigabe der Zwischenablage). */
  kopierenFehler: string;
  sichern: string;
  /** Anstelle des Ankers, wenn es noch keinen gibt. */
  leer: string;
  /** Name des Textfelds für Screenreader. */
  ankerLabel: string;
}

export interface AnkerKastenProps {
  titel: string;
  erklaerung: ReactNode;
  /** Der Anker als eine Zeile Text; fehlt, solange die Kette leer ist. */
  anker?: string;
  texte: AnkerKastenTexte;
  /** Sichern als Datei (die Seite entscheidet, wie). */
  onSichern?: () => void;
  children?: ReactNode;
}

/** Anker anzeigen, kopieren und sichern. Speichert selbst nichts. */
export function AnkerKasten({
  titel,
  erklaerung,
  anker,
  texte,
  onSichern,
  children,
}: AnkerKastenProps) {
  const id = useId();
  const [meldung, setMeldung] = useState<string | undefined>();

  async function kopieren() {
    if (anker === undefined) return;
    try {
      await navigator.clipboard.writeText(anker);
      setMeldung(texte.kopiert);
    } catch {
      setMeldung(texte.kopierenFehler);
    }
  }

  return (
    <section className={styles.kasten} aria-labelledby={`${id}-titel`}>
      <h2 id={`${id}-titel`} className={styles.titel}>
        {titel}
      </h2>
      <div className={styles.erklaerung}>{erklaerung}</div>
      {anker === undefined ? (
        <p className={styles.leer}>{texte.leer}</p>
      ) : (
        <>
          <textarea
            className={styles.anker}
            readOnly
            rows={3}
            value={anker}
            aria-label={texte.ankerLabel}
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className={styles.knoepfe}>
            <Button art="zweit" icon="kopieren" onClick={() => void kopieren()}>
              {texte.kopieren}
            </Button>
            {onSichern && (
              <Button art="leise" onClick={onSichern}>
                {texte.sichern}
              </Button>
            )}
            <span className={styles.meldung} role="status" aria-live="polite">
              {meldung}
            </span>
          </div>
        </>
      )}
      {children}
    </section>
  );
}
