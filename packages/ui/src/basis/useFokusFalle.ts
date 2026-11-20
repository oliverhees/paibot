/**
 * PaiBot – Fokus-Falle mit Escape und Rückkehr des Fokus.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { type RefObject, useEffect, useRef } from "react";
import { fokussierbareIn, naechstesZiel } from "./fokus";

export interface FokusFalleOptionen {
  /** Tab bleibt im Bereich (für modale Dialoge, Blätter und das Menü am Handy). */
  falle?: boolean;
  /** Escape schließt. */
  onEscape?: () => void;
  /** Element, das beim Öffnen den Fokus bekommt; sonst das erste fokussierbare. */
  erstesZiel?: RefObject<HTMLElement | null>;
}

/**
 * Solange `aktiv`: Fokus wandert in den Bereich, Tab bleibt darin (wenn `falle`),
 * Escape ruft `onEscape`. Beim Schließen kehrt der Fokus dorthin zurück, wo er vorher war.
 */
export function useFokusFalle(
  bereich: RefObject<HTMLElement | null>,
  aktiv: boolean,
  { falle = true, onEscape, erstesZiel }: FokusFalleOptionen = {},
): void {
  const beiEscape = useRef(onEscape);
  beiEscape.current = onEscape;

  useEffect(() => {
    const node = bereich.current;
    if (!aktiv || !node) return;
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const start = erstesZiel?.current ?? fokussierbareIn(node)[0] ?? node;
    if (start === node && !node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
    start.focus({ preventScroll: true });

    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape" && beiEscape.current) {
        e.stopPropagation();
        beiEscape.current();
        return;
      }
      if (e.key !== "Tab" || !falle) return;
      const ziele = fokussierbareIn(node);
      const aktuell = ziele.indexOf(document.activeElement as HTMLElement);
      const ziel = naechstesZiel(ziele.length, aktuell, e.shiftKey);
      if (ziel !== null) {
        e.preventDefault();
        ziele[ziel]?.focus();
      } else if (ziele.length === 0) {
        e.preventDefault();
      }
    };
    node.addEventListener("keydown", taste);
    return () => {
      node.removeEventListener("keydown", taste);
      if (vorher?.isConnected) vorher.focus({ preventScroll: true });
    };
  }, [aktiv, bereich, falle, erstesZiel]);
}
