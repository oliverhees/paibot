/**
 * PaiBot – Prüfseite für die Browser-Tests und Bilder des Startbereichs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Wird nur von startbereich.test.mjs und scripts/startbereich-bilder.mjs über einen Vite-Server
// geladen; gehört nicht zum Paket. Der Rahmen bildet den Chat nach: Seitenleiste, Verlauf mit der
// Spalte der Chat-Seite, darunter die echte Eingabe. Alle Angaben sind Beispiele.
//
// Abfrage-Parameter: fassung, thema (hell|dunkel), notaus=1, stunde=0..23, ohne=1 (nur der
// Avatar, sonst nichts), belege=<Zahl|->, offen=1 (Feld fokussieren).

import "../src/tokens.css";
import "../src/avatar.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AppShell,
  type AppShellNavigation,
  type AppShellTexte,
  Avatar,
  ChatEingabe,
  Startbereich,
  type StartDaten,
  type StartFassung,
  StartStilleSitz,
  tageszeitFuerStunde,
} from "../src/index";

const SHELL_TEXTE: AppShellTexte = {
  laeuftAuf: "Läuft auf:",
  modelle: "Modelle:",
  deinBot: "Dein Bot",
  navigation: "Navigation",
  unterhaltungen: "Unterhaltungen von Pai",
  menueOeffnen: "Menü öffnen",
  menueSchliessen: "Menü schließen",
  flaeche: "Arbeitsfläche",
  flaecheZeigen: "Arbeitsfläche zeigen",
  flaecheSchliessen: "Arbeitsfläche schließen",
};

const NAVIGATION: AppShellNavigation = {
  ort: "dein Server",
  modelle: "lokal",
  neu: { href: "#neu" },
  bot: {
    name: "Pai",
    rolle: "schreibt Entwürfe und Antworten",
    farbe: "limette",
    href: "#bot",
    unterhaltungen: [
      { id: "u1", titel: "Antwort an Max Mustermann", href: "#u1" },
      { id: "u2", titel: "Wochenplan sortieren", href: "#u2" },
      { id: "u3", titel: "Ideen für den Newsletter", href: "#u3" },
    ],
  },
  werkzeuge: [
    { id: "belege", text: "Belege", href: "#belege", icon: "beleg" },
    { id: "einstellungen", text: "Einstellungen", href: "#einstellungen", icon: "zahnrad" },
  ],
};

const STIL = `
.seite{flex:1;min-height:0;display:flex;flex-direction:column;position:relative;height:100%}
.verlauf{flex:1;min-height:0;padding:22px 24px 10px;overflow:auto;scrollbar-width:none}
.verlauf::-webkit-scrollbar{display:none}
.spalte{max-width:var(--layout-inhalt);margin:0 auto;display:flex;flex-direction:column;gap:20px;min-height:100%}
.spalte>section:first-child{margin:auto 0}
.unten{flex:none;display:flex;flex-direction:column}
@media (max-width:719px){.verlauf{padding:16px 16px 6px}}
`;

const suche = new URLSearchParams(location.search);
const FASSUNG = (suche.get("fassung") ?? "begruessung") as StartFassung;
const SPARSAM = suche.get("ohne") === "1";
const BELEGE = suche.get("belege");
const MODELL = suche.get("modell") ?? "Beispiel-Modell Allrounder";

declare global {
  interface Window {
    __ereignisse: string[];
  }
}
window.__ereignisse = [];

function Rahmen() {
  const [wert, setWert] = useState("");
  const [feld, setFeld] = useState<HTMLTextAreaElement | null>(null);
  const huelle = useRef<HTMLDivElement>(null);
  const notAus = suche.get("notaus") === "1";

  useEffect(() => {
    const el = huelle.current?.querySelector("textarea") ?? null;
    setFeld(el);
    if (suche.get("offen") === "1") el?.focus();
  }, []);

  const avatar = <Avatar farbe="limette" groesse={112} still />;
  const daten: StartDaten = SPARSAM
    ? { avatar, onAnfang: anfang }
    : {
        avatar,
        avatarKlein: <Avatar farbe="limette" groesse={18} still />,
        botName: "Pai",
        modell: MODELL,
        herkunft: "local",
        schleuseAn: false,
        notAus,
        ...(BELEGE === "-" ? {} : { belege: Number(BELEGE ?? 23) }),
        unterhaltungen: [
          { id: "u1", titel: "Antwort an Max Mustermann", zeit: "heute" },
          { id: "u2", titel: "Wochenplan sortieren", zeit: "gestern" },
          { id: "u3", titel: "Ideen für den Newsletter", zeit: "16.11." },
        ],
        tageszeit: tageszeitFuerStunde(Number(suche.get("stunde") ?? 19)),
        onAnfang: anfang,
        onUnterhaltung: (id) => window.__ereignisse.push(`unterhaltung:${id}`),
      };
  if (SPARSAM && notAus) daten.notAus = true;

  function anfang(text: string) {
    window.__ereignisse.push(`anfang:${text}`);
    setWert(text);
    const el = huelle.current?.querySelector("textarea");
    el?.focus();
  }

  return (
    <div className="seite">
      <style>{STIL}</style>
      <div className="verlauf" role="log" aria-label="Verlauf">
        <div className="spalte">
          <Startbereich fassung={FASSUNG} {...daten} />
        </div>
      </div>
      <div className="unten" ref={huelle}>
        {FASSUNG === "stille" && (
          <StartStilleSitz
            avatar={<Avatar farbe="limette" groesse={64} still />}
            notAus={notAus}
            onAnfang={anfang}
            eingabe={feld}
            leer={wert.trim().length === 0}
          />
        )}
        <ChatEingabe
          wert={wert}
          onWert={setWert}
          onSenden={() => {}}
          schleuseAn={false}
          onSchleuse={() => {}}
          deaktiviert={notAus}
          platzhalter={
            notAus
              ? "Alle Bots sind angehalten. Setze oben fort, um weiterzuschreiben."
              : "Schreib Pai eine Nachricht"
          }
        />
      </div>
    </div>
  );
}

const hell = suche.get("thema") === "hell";
document.documentElement.dataset.theme = hell ? "light" : "dark";

const wurzel = document.getElementById("wurzel");
if (wurzel) {
  createRoot(wurzel).render(
    <AppShell navigation={NAVIGATION} texte={SHELL_TEXTE} kopf={<strong>Neue Unterhaltung</strong>}>
      <Rahmen />
    </AppShell>,
  );
}
