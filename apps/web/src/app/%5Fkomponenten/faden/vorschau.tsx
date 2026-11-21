/**
 * PaiBot – Vorschau der Fäden: Szene und Thema umschaltbar, nur erfundene Beispiel-Daten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import {
  Button,
  beispielSzene,
  FadenAnsicht,
  type FadenSzene,
  SZENEN,
  type SzenenId,
} from "@paibot/ui";
import { useEffect, useMemo, useState } from "react";
import styles from "./vorschau.module.css";

const GUELTIG = new Set<string>(SZENEN.map((s) => s.id));

/**
 * Alle Szenen eines Fadens nebeneinander ausprobieren. Es gibt keine Abrufe und keinen Server:
 * Gesendeter Text erscheint nur in dieser Seite, die Knöpfe „Stab nehmen“, „Faden anhalten“ und
 * „+10.000 Token“ rufen hier nichts auf.
 */
export function FadenVorschau() {
  const [szeneId, setSzeneId] = useState<SzenenId>("arbeitet");
  const [dunkel, setDunkel] = useState<"dark" | "light">("dark");
  const [gesendet, setGesendet] = useState<string[]>([]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("szene");
    if (s && GUELTIG.has(s)) setSzeneId(s as SzenenId);
    if (q.get("thema") === "hell") setDunkel("light");
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dunkel);
  }, [dunkel]);

  const szene: FadenSzene = useMemo(() => {
    const s = beispielSzene(szeneId);
    if (gesendet.length === 0) return s;
    return {
      ...s,
      gespraech: [
        ...s.gespraech,
        ...gesendet.map((text, i) => ({
          art: "beitrag" as const,
          id: `eigen-${i}`,
          von: "du",
          zeit: "jetzt",
          text,
          filter: "ergebnis" as const,
          route: s.leitung,
        })),
      ],
    };
  }, [szeneId, gesendet]);

  return (
    <div className={styles.seite}>
      <header className={styles.leiste}>
        <strong>Fäden</strong>
        <select
          className={styles.auswahl}
          value={szeneId}
          onChange={(e) => {
            setSzeneId(e.target.value as SzenenId);
            setGesendet([]);
          }}
          aria-label="Szene"
        >
          {SZENEN.map((s) => (
            <option key={s.id} value={s.id}>
              {s.text}
            </option>
          ))}
        </select>
        <Button
          art="zweit"
          aria-pressed={dunkel === "light"}
          onClick={() => setDunkel(dunkel === "dark" ? "light" : "dark")}
        >
          {dunkel === "dark" ? "Hell" : "Dunkel"}
        </Button>
      </header>
      <div className={styles.bild}>
        <FadenAnsicht
          key={szeneId}
          szene={szene}
          onSenden={(text) => setGesendet((alt) => [...alt, text])}
        />
      </div>
    </div>
  );
}
