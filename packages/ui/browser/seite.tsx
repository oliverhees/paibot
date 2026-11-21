/**
 * PaiBot – Prüfseite für die Tastatur-Tests der Bausteine im echten Browser.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Wird nur von tastatur.test.mjs über einen Vite-Server geladen; gehört nicht zum Paket.
// `?ansicht=shell` zeigt die AppShell bildschirmfüllend, sonst die einzelnen Bausteine.

import "../src/tokens.css";
import "../src/avatar.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AppShell,
  type AppShellNavigation,
  type AppShellTexte,
  Button,
  Dialog,
  Menue,
  Reiter,
  Select,
  Switch,
  TextField,
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
  modelle: "EU",
  neu: { href: "#neu" },
  bot: {
    name: "Pai",
    rolle: "schreibt Entwürfe und Antworten",
    farbe: "violett",
    href: "#bot",
    unterhaltungen: [
      { id: "u1", titel: "Antwort an Max Mustermann", href: "#u1", aktiv: true },
      { id: "u2", titel: "Wochenplan sortieren", href: "#u2" },
    ],
  },
  werkzeuge: [
    { id: "belege", text: "Belege", href: "#belege", icon: "beleg" },
    { id: "einstellungen", text: "Einstellungen", href: "#einstellungen", icon: "zahnrad" },
  ],
};

function protokolliere(text: string) {
  const ziel = document.getElementById("protokoll");
  if (ziel) ziel.textContent = text;
}

function Bausteine() {
  const [dialog, setDialog] = useState(false);
  const [blatt, setBlatt] = useState(false);
  const [reiter, setReiter] = useState("eins");
  const [an, setAn] = useState(false);
  return (
    <main style={{ padding: 24, display: "grid", gap: 16, maxWidth: 640 }}>
      <Button id="vorher">Vorher</Button>
      <Button id="dialog-auf" onClick={() => setDialog(true)}>
        Dialog öffnen
      </Button>
      <Button id="blatt-auf" onClick={() => setBlatt(true)}>
        Blatt öffnen
      </Button>
      <Menue
        label="Weitere Aktionen"
        eintraege={[
          { id: "a", text: "Umbenennen", onWaehlen: () => protokolliere("gewählt: a") },
          { id: "b", text: "Gesperrt", deaktiviert: true, onWaehlen: () => protokolliere("b") },
          { id: "c", text: "Löschen", gefahr: true, onWaehlen: () => protokolliere("gewählt: c") },
        ]}
      />
      <Reiter
        label="Bereiche"
        aktiv={reiter}
        onWechsel={setReiter}
        reiter={[
          { id: "eins", text: "Eins", inhalt: <p>Inhalt eins</p> },
          { id: "zwei", text: "Zwei", inhalt: <p>Inhalt zwei</p> },
          { id: "drei", text: "Drei", inhalt: <p>Inhalt drei</p> },
        ]}
      />
      <Switch id="schalter" an={an} onAendern={setAn}>
        Datenschleuse
      </Switch>
      <Select
        id="auswahl"
        label="Modell"
        defaultValue="a"
        optionen={[
          { wert: "a", text: "Modell A" },
          { wert: "b", text: "Modell B" },
          { wert: "c", text: "Modell C" },
        ]}
      />
      <TextField id="feld" label="Titel" defaultValue="Beispiel" />
      <Button id="nachher">Nachher</Button>
      <output id="protokoll" />
      <Dialog
        offen={dialog}
        onSchliessen={() => setDialog(false)}
        titel="Umbenennen"
        schliessenLabel="Schließen"
        aktionen={
          <>
            <Button id="dialog-abbrechen" onClick={() => setDialog(false)}>
              Abbrechen
            </Button>
            <Button id="dialog-ok" art="primaer" onClick={() => setDialog(false)}>
              Speichern
            </Button>
          </>
        }
      >
        <TextField id="dialog-titel" label="Neuer Titel" data-erster-fokus="" />
      </Dialog>
      <Dialog
        art="blatt"
        offen={blatt}
        onSchliessen={() => setBlatt(false)}
        titel="Belege"
        schliessenLabel="Schließen"
        aktionen={
          <Button id="blatt-ok" onClick={() => setBlatt(false)}>
            Fertig
          </Button>
        }
      >
        <p>Inhalt des Blatts</p>
      </Dialog>
    </main>
  );
}

function Shell() {
  return (
    <AppShell
      navigation={NAVIGATION}
      texte={SHELL_TEXTE}
      kopf={<strong>Antwort an Max Mustermann</strong>}
      flaeche={{ inhalt: <p>Beleg B-0142</p>, zahl: 1 }}
      unten={
        <Menue
          label="Du"
          richtung="oben"
          ausrichtung="start"
          eintraege={[
            {
              id: "zugang",
              text: "Zugang",
              hinweis: "Passwort",
              onWaehlen: () => protokolliere("du: zugang"),
            },
            {
              id: "doku",
              text: "Dokumentation",
              gruppe: "Hilfe",
              trennerDavor: true,
              extern: { href: "https://paibot.de/doku", neuerTab: "(öffnet in einem neuen Tab)" },
            },
            {
              id: "abmelden",
              text: "Abmelden",
              gefahr: true,
              trennerDavor: true,
              onWaehlen: () => protokolliere("du: abmelden"),
            },
          ]}
          ausloeser={(props) => (
            <button type="button" data-du="" {...props}>
              Du
            </button>
          )}
        />
      }
    >
      <p style={{ padding: 16 }}>Verlauf</p>
      <Button id="im-inhalt">Im Inhalt</Button>
      <output id="protokoll" />
    </AppShell>
  );
}

const wurzel = document.getElementById("wurzel");
if (wurzel) {
  const shell = new URLSearchParams(location.search).get("ansicht") === "shell";
  createRoot(wurzel).render(shell ? <Shell /> : <Bausteine />);
}
