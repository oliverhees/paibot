/**
 * PaiBot – Prüfseite für die Browser-Tests und Bilder der Fäden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Wird nur von faden.test.mjs über einen Vite-Server geladen; gehört nicht zum Paket. Alle
// Angaben sind Beispiele. Abfrage-Parameter: szene (leer, arbeitet, wartet, fertig, angehalten,
// grenze, gross), thema (hell|dunkel), gefahr=1 (Bot-Text mit Skript, Bild und Richtungszeichen
// in den Beiträgen und Fragen).

import "../src/tokens.css";
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  beispielSzene,
  FadenAnsicht,
  type FadenSzene,
  GEFAEHRLICHER_TEXT,
  SZENEN,
  type SzenenId,
} from "../src/index";

declare global {
  interface Window {
    __ereignisse: string[];
  }
}
window.__ereignisse = [];

const suche = new URLSearchParams(location.search);
const gueltig = new Set<string>(SZENEN.map((s) => s.id));
const ID = (gueltig.has(suche.get("szene") ?? "") ? suche.get("szene") : "arbeitet") as SzenenId;
const GEFAHR = suche.get("gefahr") === "1";

function mitGefahr(s: FadenSzene): FadenSzene {
  return {
    ...s,
    gespraech: s.gespraech.map((e) =>
      e.art === "beitrag" && e.von !== "du" ? { ...e, text: GEFAEHRLICHER_TEXT, untrusted: true } : e,
    ),
    ...(s.kopf?.fragen
      ? {
          kopf: {
            ...s.kopf,
            fragen: s.kopf.fragen.map((f) => ({ ...f, text: GEFAEHRLICHER_TEXT, untrusted: true })),
          },
        }
      : {}),
  };
}

function Seite() {
  const szene = useMemo(() => (GEFAHR ? mitGefahr(beispielSzene(ID)) : beispielSzene(ID)), []);
  return (
    <div style={{ height: "100dvh" }}>
      <FadenAnsicht
        szene={szene}
        onSenden={(t) => window.__ereignisse.push(`senden:${t}`)}
        onStabNehmen={() => window.__ereignisse.push("stab")}
        onAnhalten={() => window.__ereignisse.push("anhalten")}
        onFortsetzen={() => window.__ereignisse.push("fortsetzen")}
        onZuschlag={() => window.__ereignisse.push("zuschlag")}
        onGrenzenWahl={(id) => window.__ereignisse.push(`wahl:${id}`)}
        onVorschlag={(w) => window.__ereignisse.push(`vorschlag:${w.text}`)}
      />
    </div>
  );
}

document.documentElement.dataset.theme = suche.get("thema") === "hell" ? "light" : "dark";
const wurzel = document.getElementById("wurzel");
if (wurzel) createRoot(wurzel).render(<Seite />);
