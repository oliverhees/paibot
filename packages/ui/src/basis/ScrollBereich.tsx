/**
 * PaiBot – Bereich, der ohne sichtbaren Balken scrollt und weich ausblendet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import {
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { klassen } from "./klassen";
import styles from "./ScrollBereich.module.css";
import { type ScrollRand, scrollRand, scrollt } from "./scrollRand";

export interface ScrollBereichProps {
  children: ReactNode;
  /** Richtung des Scrollens (Standard senkrecht). */
  achse?: "y" | "x";
  /**
   * Name für Screenreader. Scrollt der Inhalt, wird der Bereich per Tab erreichbar,
   * damit er sich mit den Pfeiltasten bewegen lässt; dann braucht er einen Namen.
   */
  label?: string;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
  id?: string;
  role?: string;
  ref?: Ref<HTMLElement>;
  "aria-live"?: "polite" | "off";
}

/**
 * Bereich, der ohne sichtbaren Balken scrollt. Wo Inhalt weiterläuft, blendet ein weicher
 * Rand aus. Rad, Wischen und Tastatur funktionieren wie gewohnt.
 */
export function ScrollBereich({
  children,
  achse = "y",
  label,
  className,
  style,
  as: Element = "div",
  id,
  role,
  ref,
  "aria-live": ariaLive,
}: ScrollBereichProps) {
  const el = useRef<HTMLElement>(null);
  const [rand, setRand] = useState<ScrollRand>("keiner");
  const [fokussierbar, setFokussierbar] = useState(false);
  useImperativeHandle(ref, () => el.current as HTMLElement, []);

  const messen = useCallback(() => {
    const node = el.current;
    if (!node) return;
    const masse =
      achse === "y"
        ? { position: node.scrollTop, inhalt: node.scrollHeight, sichtbar: node.clientHeight }
        : { position: node.scrollLeft, inhalt: node.scrollWidth, sichtbar: node.clientWidth };
    setRand(scrollRand(masse));
    setFokussierbar(scrollt(masse));
  }, [achse]);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    messen();
    node.addEventListener("scroll", messen, { passive: true });
    const beobachter =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => messen()) : null;
    beobachter?.observe(node);
    for (const kind of Array.from(node.children)) beobachter?.observe(kind);
    const aenderungen =
      typeof MutationObserver === "function" ? new MutationObserver(() => messen()) : null;
    aenderungen?.observe(node, { childList: true, subtree: true, characterData: true });
    return () => {
      node.removeEventListener("scroll", messen);
      beobachter?.disconnect();
      aenderungen?.disconnect();
    };
  }, [messen]);

  return (
    <Element
      ref={el}
      id={id}
      role={role ?? (fokussierbar && label ? "region" : undefined)}
      aria-label={label}
      aria-live={ariaLive}
      tabIndex={fokussierbar ? 0 : undefined}
      className={klassen(styles.bereich, achse === "x" ? styles.x : styles.y, className)}
      data-rand={rand}
      style={style}
    >
      {children}
    </Element>
  );
}
