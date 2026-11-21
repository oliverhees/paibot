/**
 * PaiBot – Spalte einer Seite in der mittleren Fläche der AppShell: scrollt ohne sichtbaren
 * Balken, Inhalt mittig mit lesbarer Breite, Überschrift und Einleitung oben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { ReactNode } from "react";
import { ScrollBereich } from "../basis/ScrollBereich";
import styles from "./SeitenSpalte.module.css";

export interface SeitenSpalteProps {
  /** Überschrift der Seite (h1). */
  titel: string;
  /** Einleitung unter der Überschrift. */
  einleitung?: ReactNode;
  children: ReactNode;
}

/** Scrollende Spalte mit Überschrift für Seiten wie „Modell und Anbieter“. */
export function SeitenSpalte({ titel, einleitung, children }: SeitenSpalteProps) {
  return (
    <ScrollBereich className={styles.spalte} label={titel}>
      <div className={styles.inhalt}>
        <header className={styles.kopf}>
          <h1 className={styles.titel}>{titel}</h1>
          {einleitung && <p className={styles.einleitung}>{einleitung}</p>}
        </header>
        {children}
      </div>
    </ScrollBereich>
  );
}
