/**
 * PaiBot – Bot-Avatar mit fester Form je Farbe und lebendigem Gesicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import type { AvatarShape, BotColor } from "@paibot/shared/objekte";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { klassen } from "../basis/klassen";
import styles from "./Avatar.module.css";
import {
  blickZumZeiger,
  type LaunenArt,
  planeBlick,
  planeBlinzeln,
  planeLaune,
  type Zufall,
} from "./bewegung";
import { FORMEN, formFuer, gesichtFuer, mundOffenY } from "./formen";

export type AvatarZustand = "bereit" | "arbeitet" | "wartet" | "schlaeft";

export interface AvatarProps {
  farbe: BotColor;
  /** Kantenlänge in Pixeln (Standard 32). */
  groesse?: number;
  /** „arbeitet“ zeigt einen kreisenden Bogen und einen redenden Mund. */
  zustand?: AvatarZustand;
  /** Ohne Blinzeln, Blick und Laune (z. B. in Listen). */
  still?: boolean;
  /** Zugänglicher Name; ohne ihn gilt der Avatar als Schmuck. */
  titel?: string;
  /** Zufallsquelle für die Bewegung (für Tests). */
  zufall?: Zufall;
}

const AUGEN: Record<AvatarShape, ReactNode> = {
  blatt: (
    <>
      <circle cx="15.6" cy="18.6" r="2.4" />
      <circle cx="24.4" cy="18.6" r="2.4" />
    </>
  ),
  bogen: (
    <>
      <ellipse cx="15.4" cy="19.4" rx="2" ry="3.2" />
      <ellipse cx="24.6" cy="19.4" rx="2" ry="3.2" />
    </>
  ),
  kiesel: (
    <g fill="none" stroke="var(--gz)" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12.6 19.6q2.5-3.4 5 0" />
      <path d="M22.4 19.6q2.5-3.4 5 0" />
    </g>
  ),
  raute: (
    <>
      <rect x="13.4" y="15.6" width="4.4" height="4.4" rx="1.3" />
      <rect x="22.2" y="15.6" width="4.4" height="4.4" rx="1.3" />
    </>
  ),
  dee: (
    <>
      <circle cx="15.6" cy="18.4" r="1.9" />
      <circle cx="25" cy="18" r="3.1" />
    </>
  ),
  wabe: (
    <>
      <rect x="12.4" y="16.8" width="5.6" height="2.8" rx="1.4" />
      <rect x="22" y="16.8" width="5.6" height="2.8" rx="1.4" />
    </>
  ),
  bluete: (
    <>
      <circle cx="14.6" cy="18.8" r="2" />
      <circle cx="25.4" cy="18.8" r="2" />
    </>
  ),
};

const MUND: Record<AvatarShape, ReactNode> = {
  blatt: <path d="M16.6 24.6q3.4 2.8 6.8 0" />,
  bogen: <path d="M17.8 26.8q2.2 1 4.4 0" />,
  kiesel: <path d="M14.8 23.8h10.4a5.2 5.2 0 0 1-10.4 0Z" fill="var(--gz)" stroke="none" />,
  raute: <path d="M17.4 25.4h5.2" />,
  dee: <path d="M16.6 25.2q3.4 2.6 7-.8" />,
  wabe: <path d="M17.4 23.8l2.6 2.4 2.6-2.4" />,
  bluete: <path d="M18 23.6q2 1.8 4 0" />,
};

function bewegungErlaubt(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Bot-Avatar: feste Form je Farbe, Gesicht mit Augen und Mund, auf Wunsch lebendig. */
export function Avatar({
  farbe,
  groesse = 32,
  zustand = "bereit",
  still = false,
  titel,
  zufall = Math.random,
}: AvatarProps) {
  const id = useId();
  const form = formFuer(farbe);
  const umriss = FORMEN[form];
  const rand = "rand" in umriss ? umriss.rand : undefined;
  const huelle = useRef<HTMLSpanElement>(null);
  const [zu, setZu] = useState(false);
  const [blick, setBlick] = useState({ x: 0, y: 0 });
  const [laune, setLaune] = useState<LaunenArt | null>(null);
  const lebendig = !still && zustand !== "schlaeft";

  useEffect(() => {
    if (!lebendig || !bewegungErlaubt()) return;
    const uhren = new Set<ReturnType<typeof setTimeout>>();
    const spaeter = (fn: () => void, ms: number) => {
      const u = setTimeout(() => {
        uhren.delete(u);
        fn();
      }, ms);
      uhren.add(u);
    };
    let zeigerNah = false;

    const blinzeln = () => {
      const plan = planeBlinzeln(zufall);
      setZu(true);
      spaeter(() => setZu(false), plan.dauer);
      if (plan.zweites) {
        const { nach, dauer } = plan.zweites;
        spaeter(() => setZu(true), nach);
        spaeter(() => setZu(false), nach + dauer);
      }
      spaeter(blinzeln, plan.naechstesNach);
    };
    const schauen = () => {
      const plan = planeBlick(zufall);
      if (!zeigerNah) setBlick({ x: plan.x, y: plan.y });
      spaeter(schauen, plan.naechsterNach);
    };
    const launen = () => {
      const plan = planeLaune(zufall);
      setLaune(plan.art);
      spaeter(() => setLaune(null), plan.dauer);
      spaeter(launen, plan.naechsteNach);
    };
    const zeiger = (ereignis: PointerEvent) => {
      const el = huelle.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ziel = blickZumZeiger(
        { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        { x: ereignis.clientX, y: ereignis.clientY },
        r.width,
      );
      zeigerNah = ziel !== null;
      if (ziel) setBlick(ziel);
    };

    spaeter(blinzeln, planeBlinzeln(zufall).naechstesNach);
    spaeter(schauen, planeBlick(zufall).naechsterNach);
    spaeter(launen, planeLaune(zufall).naechsteNach);
    window.addEventListener("pointermove", zeiger, { passive: true });
    return () => {
      for (const u of uhren) clearTimeout(u);
      window.removeEventListener("pointermove", zeiger);
    };
  }, [lebendig, zufall]);

  const redet = zustand === "arbeitet" || laune === "reden";
  const staunt = laune === "staunen";
  // Wartet der Bot auf dich, schaut er nach oben zur Seite.
  const augen = zustand === "wartet" ? { x: 1.6, y: -1.4 } : blick;
  const randAttr = rand ? { strokeWidth: rand, strokeLinejoin: "round" as const } : {};

  return (
    <span
      ref={huelle}
      className={styles.avatar}
      data-zustand={zustand}
      style={{ width: groesse, height: groesse }}
    >
      <svg
        className={klassen(
          styles.kopf,
          (zu || zustand === "schlaeft") && styles.zu,
          staunt && styles.staunt,
          redet && styles.redet,
          laune === "huepfen" && styles.huepft,
          laune === "wackeln" && styles.wackelt,
        )}
        viewBox="0 0 40 40"
        width={groesse}
        height={groesse}
        style={{
          ["--koerper" as string]: `var(--bot-${farbe})`,
          ["--gz" as string]: gesichtFuer(farbe),
        }}
        role={titel ? "img" : undefined}
        aria-label={titel}
        aria-hidden={titel ? undefined : true}
      >
        {titel && <title>{titel}</title>}
        <defs>
          <radialGradient id={`${id}l`} cx="78%" cy="14%" r="75%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}s`} x1="85%" y1="10%" x2="15%" y2="95%">
            <stop offset="0.45" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.26" />
          </linearGradient>
        </defs>
        <g className={styles.koerper}>
          <path
            d={umriss.d}
            fill="var(--koerper)"
            {...(rand ? { stroke: "var(--koerper)", ...randAttr } : {})}
          />
          <path
            d={umriss.d}
            fill={`url(#${id}s)`}
            {...(rand ? { stroke: `url(#${id}s)`, ...randAttr } : {})}
          />
          <path
            d={umriss.d}
            fill={`url(#${id}l)`}
            {...(rand ? { stroke: `url(#${id}l)`, ...randAttr } : {})}
          />
          <g
            className={styles.augen}
            style={{ transform: `translate(${augen.x}px, ${augen.y}px)` }}
          >
            <g className={klassen("lid", styles.lid)} fill="var(--gz)">
              {AUGEN[form]}
            </g>
          </g>
          <g>
            <g
              className={klassen("m-ruhe", styles.mundRuhe)}
              fill="none"
              stroke="var(--gz)"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {MUND[form]}
            </g>
            <ellipse
              className={styles.mundOffen}
              cx="20"
              cy={mundOffenY(form)}
              rx="2.1"
              ry="2.6"
              fill="var(--gz)"
            />
          </g>
          {form === "bluete" && (
            <g fill="var(--gz)" opacity="0.3">
              <circle cx="11.6" cy="22.8" r="1.7" />
              <circle cx="28.4" cy="22.8" r="1.7" />
            </g>
          )}
        </g>
      </svg>
    </span>
  );
}
