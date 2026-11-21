/**
 * PaiBot – Prüfseite für die Browser-Tests des lebendigen Avatars.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Wird nur von avatar.test.mjs über einen Vite-Server geladen; gehört nicht zum Paket.
// Standard: die Vorschau. `?ansicht=entfernen` zeigt einen einzelnen Avatar, den ein Knopf
// entfernt und wieder einsetzt (`&folgt=1` schaltet das Folgen des Zeigers ein).

import "../src/tokens.css";
import { AVATAR_SHAPES } from "@paibot/shared/objekte";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AVATAR_LEBENDIG_ZUSTAENDE,
  AvatarLebendig,
  type AvatarLebendigSteuerung,
  AvatarLebendigVorschau,
  type AvatarLebendigZustand,
} from "../src/index";

declare global {
  interface Window {
    __avatare?: Record<string, AvatarLebendigSteuerung | null>;
  }
}

/** Alle Formen mit Steuerung; ohne Übergänge und Animationen, damit Ausdrücke sofort stehen. */
function Ausdruecke({ zustand }: { zustand: AvatarLebendigZustand }) {
  window.__avatare = {};
  return (
    <main style={{ padding: 24, display: "flex", gap: 16, flexWrap: "wrap" }}>
      <style>{"*{transition:none!important;animation:none!important}"}</style>
      {AVATAR_SHAPES.map((form) => (
        <span key={form} data-zelle={form}>
          <AvatarLebendig
            farbe="limette"
            form={form}
            groesse={64}
            zustand={zustand}
            ref={(r) => {
              if (window.__avatare) window.__avatare[form] = r;
            }}
          />
        </span>
      ))}
    </main>
  );
}

function Entfernen({ folgt }: { folgt: boolean }) {
  const [da, setDa] = useState(true);
  return (
    <main style={{ padding: 24 }}>
      <button type="button" id="weg" onClick={() => setDa((d) => !d)}>
        {da ? "Entfernen" : "Einsetzen"}
      </button>
      {da && <AvatarLebendig farbe="limette" groesse={96} folgtZeiger={folgt} />}
    </main>
  );
}

const wurzel = document.getElementById("wurzel");
if (wurzel) {
  const q = new URLSearchParams(location.search);
  const zustand = q.get("zustand") as AvatarLebendigZustand | null;
  createRoot(wurzel).render(
    q.get("ansicht") === "ausdruecke" ? (
      <Ausdruecke
        zustand={zustand && AVATAR_LEBENDIG_ZUSTAENDE.includes(zustand) ? zustand : "ruhig"}
      />
    ) : q.get("ansicht") === "entfernen" ? (
      <Entfernen folgt={q.get("folgt") === "1"} />
    ) : (
      <main style={{ padding: 24, maxWidth: 1100 }}>
        <AvatarLebendigVorschau />
      </main>
    ),
  );
}
