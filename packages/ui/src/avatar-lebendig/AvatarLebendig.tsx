/**
 * PaiBot – lebendiger Avatar: Gesicht aus beweglichen Teilen, Zustände, Ausdrücke, Text-Takt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { AvatarShape, BotColor } from "@paibot/shared/objekte";
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Zufall } from "../avatar/bewegung";
import { FORMEN, formFuer, gesichtFuer as gesichtsfarbe } from "../avatar/formen";
import { klassen } from "../basis/klassen";
import styles from "./AvatarLebendig.module.css";
import {
  type AugenArt,
  type AugenPose,
  type AvatarAusdruck,
  type AvatarLebendigZustand,
  BRAUEN_ABSTAND,
  FORM_GESICHT,
  gesichtFuer,
  KLEIN_BIS,
  type MundArt,
  STANDARD_EINGABE_BLICK,
} from "./daten";
import { Leben, type LebenBuehne, type LebenUmgebung } from "./leben";

/** Was der Aufrufer dem Avatar von außen sagen kann. */
export interface AvatarLebendigSteuerung {
  /** Einmaliger Ausdruck; ohne „weniger Bewegung“ und im Vordergrund. */
  ausdruck(name: AvatarAusdruck): void;
  /** Ein Text-Stück der Länge `laenge` ist angekommen (nur im Zustand „schreibt“ bewegt es den Mund). */
  textStueck(laenge: number): void;
  /** Blick neu ausrichten, z. B. weil die Schreibstelle gewandert ist. */
  blickNeu(): void;
}

export interface AvatarLebendigProps {
  farbe: BotColor;
  /** Form; ohne Angabe die feste Form der Farbe. */
  form?: AvatarShape;
  /** Kantenlänge in Pixeln (Standard 32). Bis 28 Pixel ist die Mimik vereinfacht. */
  groesse?: number;
  zustand?: AvatarLebendigZustand;
  /** Folgt dem Mauszeiger (nur in „ruhig“ und „fertig“, nur mit Maus). Standard aus. */
  folgtZeiger?: boolean;
  /** Liefert die Schreibstelle im Fenster, zu der der Avatar im Zustand „hört zu“ schaut. */
  blickBezug?: () => { x: number; y: number } | null;
  /** Ohne jede Bewegung, auch ohne Blinzeln (z. B. in Listen). */
  still?: boolean;
  /** Kurzer Text für Bildschirmleser; ohne ihn ist der Avatar Schmuck neben einem sichtbaren Wort. */
  titel?: string;
  /** Zufallsquelle für das Leben (für Tests). */
  zufall?: Zufall;
  ref?: Ref<AvatarLebendigSteuerung>;
}

const MUENDER: readonly MundArt[] = [
  "laecheln",
  "o",
  "sprech",
  "gerade",
  "grinsen",
  "zickzack",
  "pause",
];

/** Mundformen um den Nullpunkt gezeichnet; die Form legt Mitte und Maßstab fest. */
function mundForm(art: MundArt, mundS: number): ReactNode {
  switch (art) {
    case "laecheln":
      return <path className={styles.st} d="M-3.4 -1.4q3.4 2.9 6.8 0" />;
    case "o":
      return (
        <g className={styles.mi} style={{ transform: `scale(${mundS})` }}>
          <ellipse className={styles.gz} cx="0" cy="0.6" rx="1.85" ry="2.15" />
        </g>
      );
    case "sprech":
      return (
        <g className={klassen(styles.mi, styles.sprech)}>
          <ellipse className={styles.gz} cx="0" cy="0.2" rx="2.8" ry="2.4" />
        </g>
      );
    case "gerade":
      return <path className={styles.st} d="M-2.4 0.2h4.8" />;
    case "grinsen":
      return <path className={styles.gz} d="M-5.2 -2.6h10.4a5.2 5.2 0 0 1-10.4 0Z" />;
    case "zickzack":
      return (
        <>
          <path
            className={klassen(styles.st, styles.fein)}
            d="M-5.55 1.2l1.85-1.7 1.85 1.7 1.85-1.7 1.85 1.7 1.85-1.7 1.85 1.7"
          />
          <path
            className={klassen(styles.st, styles.grob)}
            d="M-5.4 1.4l2.7-2.5 2.7 2.5 2.7-2.5 2.7 2.5"
          />
        </>
      );
    case "pause":
      return <path className={styles.graus} d="M-3 0.6h6" />;
  }
}

function augenStil(p: Required<AugenPose>): CSSProperties {
  return { transform: `translate(0px, ${p.y}px)` };
}

function Auge({
  mx,
  my,
  k,
  pose,
  art,
  glanz,
}: {
  mx: number;
  my: number;
  k: number;
  pose: Required<AugenPose>;
  art: AugenArt;
  glanz: boolean;
}) {
  return (
    <g transform={`translate(${mx} ${my}) scale(${k})`}>
      <g className={styles.auge} style={augenStil(pose)}>
        <g
          className={styles.af}
          style={{
            transform: `scale(${pose.sx}, ${pose.sy})`,
            opacity: art === "punkt" ? 1 : 0,
          }}
        >
          <g className={styles.lid}>
            <circle className={styles.gz} cx="0" cy="0" r="2.4" />
            <circle
              className={styles.glanz}
              cx="0.95"
              cy="-1.05"
              r="0.85"
              style={{ opacity: glanz ? 1 : 0 }}
            />
          </g>
        </g>
        <path
          className={klassen(styles.eBogen, styles.st)}
          d="M-2.5 1.2q2.5-3.6 5 0"
          style={{ opacity: art === "bogen" ? 1 : 0 }}
        />
        <rect
          className={klassen(styles.ePause, styles.grauz)}
          x="-1.4"
          y="-3.3"
          width="2.8"
          height="6.8"
          rx="1.2"
          style={{ opacity: art === "pause" ? 1 : 0 }}
        />
      </g>
    </g>
  );
}

function Braue({
  mx,
  my,
  k,
  o,
  y,
  r,
}: {
  mx: number;
  my: number;
  k: number;
  o: number;
  y: number;
  r: number;
}) {
  return (
    <g transform={`translate(${mx} ${my}) scale(${k})`}>
      <path
        className={klassen(styles.braue, styles.st)}
        d="M-2.6 0q2.6-1.7 5.2 0"
        style={{ opacity: o, transform: `translate(0px, ${y}px) rotate(${r}deg)` }}
      />
    </g>
  );
}

function bewegungErlaubt(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Die echte Umgebung im Browser; für Tests lässt sich `LebenUmgebung` austauschen. */
export function browserUmgebung(zufall: Zufall): LebenUmgebung {
  return {
    zufall,
    setzeZeit: (fn, ms) => setTimeout(fn, ms),
    loescheZeit: (z) => clearTimeout(z as ReturnType<typeof setTimeout>),
    jetzt: () => performance.now(),
    bewegungErlaubt,
    sichtbar: () => typeof document === "undefined" || !document.hidden,
    hatZeiger: () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    zeigerLauschen: (melde) => {
      let letzte: { x: number; y: number } | null = null;
      let bild = 0;
      const bewegt = (e: PointerEvent) => {
        letzte = { x: e.clientX, y: e.clientY };
        if (bild) return;
        // Höchstens einmal je Bild; danach ruht es wieder.
        bild = requestAnimationFrame(() => {
          bild = 0;
          melde(letzte);
        });
      };
      const weg = () => melde(null);
      window.addEventListener("pointermove", bewegt, { passive: true });
      document.documentElement.addEventListener("pointerleave", weg);
      return () => {
        window.removeEventListener("pointermove", bewegt);
        document.documentElement.removeEventListener("pointerleave", weg);
        if (bild) cancelAnimationFrame(bild);
      };
    },
    umgebungLauschen: (melde) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      document.addEventListener("visibilitychange", melde);
      mq.addEventListener("change", melde);
      return () => {
        document.removeEventListener("visibilitychange", melde);
        mq.removeEventListener("change", melde);
      };
    },
  };
}

/** Lebendiger Bot-Avatar: dasselbe Gesicht auf allen Formen, Zustände und Ausdrücke von außen. */
export function AvatarLebendig({
  farbe,
  form: formWahl,
  groesse = 32,
  zustand = "ruhig",
  folgtZeiger = false,
  blickBezug,
  still = false,
  titel,
  zufall = Math.random,
  ref,
}: AvatarLebendigProps) {
  const id = useId();
  const form = formWahl ?? formFuer(farbe);
  const umriss = FORMEN[form];
  const rand = "rand" in umriss ? umriss.rand : undefined;
  const fg = FORM_GESICHT[form];
  const klein = groesse <= KLEIN_BIS;
  const [ausdruck, setAusdruck] = useState<AvatarAusdruck | null>(null);
  const huelle = useRef<HTMLSpanElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const leben = useRef<Leben | null>(null);
  const neuesteBezug = useRef(blickBezug);
  neuesteBezug.current = blickBezug;
  const neuesterZufall = useRef(zufall);
  neuesterZufall.current = zufall;

  const g = gesichtFuer(zustand, ausdruck);
  const standBlick = g.blick === "eingabe" ? STANDARD_EINGABE_BLICK : g.blick;

  // Der Takt läuft nur, solange der Baustein steht, und räumt beim Entfernen alles ab.
  useEffect(() => {
    const buehne: LebenBuehne = {
      mitte() {
        const el = svg.current;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 };
      },
      blinzeln(zu) {
        const el = huelle.current;
        if (el) {
          if (zu) el.dataset.blink = "1";
          else delete el.dataset.blink;
        }
      },
      blick(x, y) {
        svg.current?.style.setProperty("--bx", x.toFixed(2));
        svg.current?.style.setProperty("--by", y.toFixed(2));
      },
      atmen(an) {
        const el = huelle.current;
        if (el) {
          if (an) el.dataset.atem = "1";
          else delete el.dataset.atem;
        }
      },
      sprech(offen) {
        const el = svg.current;
        if (!el) return;
        if (offen === null) {
          el.style.removeProperty("--sprech-x");
          el.style.removeProperty("--sprech-y");
        } else {
          el.style.setProperty("--sprech-x", (0.92 + offen * 0.1).toFixed(2));
          el.style.setProperty("--sprech-y", offen.toFixed(2));
        }
      },
      regung(name) {
        const el = huelle.current;
        if (!el) return;
        delete el.dataset.regung;
        if (name) {
          // Neu starten, auch wenn dieselbe Regung gerade lief.
          void el.getBoundingClientRect();
          el.dataset.regung = name;
        }
      },
      ausdruck(name) {
        setAusdruck(name);
      },
    };
    const takt = new Leben(
      browserUmgebung(() => neuesterZufall.current()),
      buehne,
    );
    leben.current = takt;
    return () => {
      takt.stop();
      leben.current = null;
    };
  }, []);

  useEffect(() => {
    leben.current?.konfiguriere({
      zustand,
      folgtZeiger,
      still,
      blickBezug: () => neuesteBezug.current?.() ?? null,
    });
  }, [zustand, folgtZeiger, still]);

  useImperativeHandle(
    ref,
    () => ({
      ausdruck: (name) => leben.current?.ausdruck(name),
      textStueck: (laenge) => leben.current?.textStueck(laenge),
      blickNeu: () => leben.current?.blickNeu(),
    }),
    [],
  );

  const { augen, mund, wangen } = fg;
  const k = augen.r / 2.4;
  const randAttr = rand ? { strokeWidth: rand, strokeLinejoin: "round" as const } : {};
  const braueY = augen.y - BRAUEN_ABSTAND * k;

  return (
    <span
      ref={huelle}
      className={klassen(styles.huelle, klein && styles.klein)}
      data-zustand={zustand}
      data-ausdruck={ausdruck ?? undefined}
      data-arbeit={g.arbeit ? "1" : "0"}
      data-form={form}
      data-zu={g.zu ? "1" : undefined}
      data-still={still ? "1" : undefined}
      style={{ width: groesse, height: groesse }}
    >
      <svg
        ref={svg}
        className={styles.kopf}
        viewBox="0 0 40 40"
        width={groesse}
        height={groesse}
        style={
          {
            "--koerper": `var(--bot-${farbe})`,
            "--gz": gesichtsfarbe(farbe),
            "--bx": standBlick.x,
            "--by": standBlick.y,
          } as CSSProperties
        }
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
        <ellipse className={styles.boden} cx="20" cy="38.6" rx="11.5" ry="1.6" />
        <path
          className={styles.ring}
          d={umriss.d}
          transform="translate(20 20) scale(1.18) translate(-20 -20)"
          style={{ opacity: g.ring ? 1 : 0 }}
        />
        <g className={styles.pose} style={{ transform: g.pose }}>
          <g className={styles.regung}>
            <path
              className={styles.leib}
              d={umriss.d}
              {...(rand ? { stroke: "var(--koerper)", ...randAttr } : {})}
            />
            <path
              className={styles.leibGrau}
              d={umriss.d}
              style={{ opacity: g.grau ? 1 : 0 }}
              {...(rand ? { stroke: "var(--av-grau)", ...randAttr } : {})}
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
            <path className={styles.kontur} d={umriss.d} />
            {wangen && (
              <g className={styles.wangen}>
                <circle cx={wangen.lx} cy={wangen.y} r={wangen.r} />
                <circle cx={wangen.rx} cy={wangen.y} r={wangen.r} />
              </g>
            )}
            <g className={styles.gesicht}>
              <Braue mx={augen.lx} my={braueY} k={k} o={g.bl.o} y={g.bl.y} r={g.bl.r} />
              <Braue mx={augen.rx} my={braueY} k={k} o={g.br.o} y={g.br.y} r={g.br.r} />
              <g className={styles.augen}>
                <Auge mx={augen.lx} my={augen.y} k={k} pose={g.al} art={g.augL} glanz={g.glanz} />
                <Auge mx={augen.rx} my={augen.y} k={k} pose={g.ar} art={g.augR} glanz={g.glanz} />
              </g>
              <g transform={`translate(${mund.x} ${mund.y}) scale(${mund.s})`}>
                <g className={styles.munde} style={{ transform: g.mundT }}>
                  {MUENDER.map((art) => (
                    <g
                      key={art}
                      className={klassen(styles.m, g.mund === art && styles.an)}
                      data-mund={art}
                    >
                      {mundForm(art, g.mundS)}
                    </g>
                  ))}
                </g>
              </g>
            </g>
          </g>
        </g>
        <g
          className={klassen(styles.eck, styles.eckWarn)}
          style={{
            opacity: g.eck === "warn" ? 1 : 0,
            transform: `scale(${g.eck === "warn" ? 1 : 0.3})`,
          }}
        >
          <circle className={styles.eckKreis} cx="36.6" cy="2.9" r="6" />
          <path
            className={styles.eckStrich}
            d="M34.7 1.5q0.2-1.9 1.95-1.9t1.9 1.7q0 1.1-1.2 1.6-0.7 0.3-0.7 1.2"
          />
          <circle className={styles.eckZeichen} cx="36.6" cy="6.5" r="0.9" />
        </g>
        <g
          className={klassen(styles.eck, styles.eckFehler)}
          style={{
            opacity: g.eck === "fehler" ? 1 : 0,
            transform: `scale(${g.eck === "fehler" ? 1 : 0.3})`,
          }}
        >
          <circle className={styles.eckKreis} cx="36.6" cy="2.9" r="6" />
          <rect
            className={styles.eckZeichen}
            x="35.85"
            y="-0.9"
            width="1.5"
            height="4.6"
            rx="0.75"
          />
          <circle className={styles.eckZeichen} cx="36.6" cy="6.1" r="0.9" />
        </g>
      </svg>
    </span>
  );
}
