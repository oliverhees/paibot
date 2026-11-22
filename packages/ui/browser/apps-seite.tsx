/**
 * PaiBot – Prüfseite mit Beispiel-Ansichten der App-Bausteine (verbinden, einstufen, Zugriff).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Wird nur von apps.test.mjs über einen Vite-Server geladen; gehört nicht zum Paket.
// `?ansicht=<name>` wählt die Ansicht, `?thema=hell|dunkel` das Design. Alle Daten sind erfunden.

import "../src/tokens.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BEISPIEL_APPS,
  BEISPIEL_BOTS,
  BEISPIEL_FEHLER,
  BEISPIEL_FREMDER_TEXT,
  BEISPIEL_WERKZEUGE,
} from "../src/app-bausteine/beispiele";
import {
  APP_FEHLER_ARTEN,
  type AppFehlerArt,
  AppZeile,
  type AppZeileProps,
  type AppZugriff,
  Button,
  EmptyState,
  NeuVerbindenForm,
  NotAusHinweis,
  type VerbindungDaten,
  VerbindungForm,
  type WerkzeugArt,
  WerkzeugListe,
  type WerkzeugListeEintrag,
  ZugriffUmschalter,
} from "../src/index";

function protokolliere(text: string) {
  const ziel = document.getElementById("protokoll");
  if (ziel) ziel.textContent = text;
}

/** Stand der Werkzeuge: eine bestätigte Einstufung gilt für die jetzige Fassung. */
function useWerkzeuge(anfang: WerkzeugListeEintrag[]) {
  const [liste, setListe] = useState(anfang);
  const einstufen = (id: string, art: WerkzeugArt, fassung?: string) => {
    protokolliere(`eingestuft: ${id} = ${art} @${fassung ?? "-"}`);
    setListe((alt) =>
      alt.map((w) => {
        if (w.id !== id) return w;
        const { aenderungen: _a, bisher: _b, ...rest } = w;
        return { ...rest, status: "bestaetigt", art };
      }),
    );
  };
  return { liste, einstufen };
}

function Seite({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <main className="seite">
      <h1 className="seitenTitel">{titel}</h1>
      {children}
      <output id="protokoll" />
    </main>
  );
}

function Zugriffe({ app, lesend }: { app: string; lesend: number }) {
  const [stand, setStand] = useState<Record<string, AppZugriff>>({
    pai: "lesen",
    kai: "lesen",
    mia: "keiner",
  });
  return (
    <div className="stapel">
      {BEISPIEL_BOTS.map((bot) => (
        <ZugriffUmschalter
          key={bot.id}
          bot={bot}
          app={app}
          wert={stand[bot.id] ?? "keiner"}
          lesendeWerkzeuge={lesend}
          onAendern={(wert) => {
            protokolliere(`zugriff: ${bot.id} = ${wert}`);
            setStand((alt) => ({ ...alt, [bot.id]: wert }));
          }}
        />
      ))}
    </div>
  );
}

function Leer() {
  const [offen, setOffen] = useState(false);
  return (
    <Seite titel="Apps">
      {offen ? (
        <VerbindungForm
          onVerbinden={(d: VerbindungDaten) =>
            protokolliere(`verbinden: ${d.adresse}|token ${d.token.length} Zeichen`)
          }
          onAbbrechen={() => setOffen(false)}
        />
      ) : (
        <EmptyState
          titel="Noch keine App verbunden"
          text={
            <p>
              Eine App ist ein MCP-Server mit öffentlicher https-Adresse. Nach dem Verbinden stufst
              du jedes Werkzeug selbst ein, und erst dann bekommt ein Bot Zugriff.
            </p>
          }
          aktion={
            <Button art="primaer" id="leer-verbinden" onClick={() => setOffen(true)}>
              Verbindung einfügen
            </Button>
          }
        />
      )}
    </Seite>
  );
}

function Formular() {
  const [fehler, setFehler] = useState<AppFehlerArt | undefined>();
  const [laeuft, setLaeuft] = useState(false);
  return (
    <Seite titel="Verbindung einfügen">
      <VerbindungForm
        laeuft={laeuft}
        fehlerArt={fehler}
        onVerbinden={(d) => {
          protokolliere(`verbinden: ${d.adresse}|token ${d.token.length} Zeichen`);
          setFehler("zugang_ungueltig");
        }}
      />
      <Button id="laeuft-an" onClick={() => setLaeuft(!laeuft)}>
        Laufend umschalten
      </Button>
      <VerbindungForm
        tokenGesetzt
        adresse="https://aufgaben.beispiel.example/mcp"
        onVerbinden={() => undefined}
      />
    </Seite>
  );
}

function Verbindet() {
  return (
    <Seite titel="Apps – verbindet">
      <div className="stapel">
        <AppZeile
          {...BEISPIEL_APPS.verbindet}
          onOeffnen={() => undefined}
          onErneutTesten={() => undefined}
          onTrennen={() => undefined}
        />
        <VerbindungForm
          laeuft
          adresse="https://kalender.beispiel.example/mcp"
          onVerbinden={() => undefined}
        />
      </div>
    </Seite>
  );
}

function Verbunden() {
  const { liste, einstufen } = useWerkzeuge(BEISPIEL_WERKZEUGE);
  const [auf, setAuf] = useState(true);
  return (
    <Seite titel="Apps – verbunden">
      <div className="stapel">
        <AppZeile
          {...(BEISPIEL_APPS.verbunden as AppZeileProps)}
          geoeffnet={auf}
          onOeffnen={() => setAuf(!auf)}
          onErneutTesten={() => protokolliere("erneut testen")}
          onTrennen={() => protokolliere("trennen")}
        >
          {auf && (
            <div className="stapel">
              <WerkzeugListe werkzeuge={liste} onEinstufen={einstufen} />
              <Zugriffe app={BEISPIEL_APPS.verbunden?.name ?? ""} lesend={2} />
            </div>
          )}
        </AppZeile>
        <AppZeile
          {...(BEISPIEL_APPS.ruhig as AppZeileProps)}
          onOeffnen={() => undefined}
          onErneutTesten={() => undefined}
          onTrennen={() => undefined}
        />
      </div>
    </Seite>
  );
}

function Gesperrt() {
  const { liste, einstufen } = useWerkzeuge([
    ...BEISPIEL_WERKZEUGE.filter((w) => w.status === "geaendert" || w.status === "neu"),
    BEISPIEL_FREMDER_TEXT,
  ]);
  return (
    <Seite titel="Werkzeuge – geändert und neu">
      <WerkzeugListe werkzeuge={liste} onEinstufen={einstufen} />
    </Seite>
  );
}

function Fassungswechsel() {
  const [fassung, setFassung] = useState("aaaaaaaaaaaaaaaa");
  const eintrag: WerkzeugListeEintrag = {
    id: "wechsel",
    name: "notiz_suchen",
    beschreibung: fassung === "aaaaaaaaaaaaaaaa" ? "Erste Fassung." : "Zweite Fassung.",
    status: "neu",
    fassung,
  };
  return (
    <Seite titel="Werkzeug – neue Fassung bei offenem Einstufen">
      <div className="stapel">
        <button type="button" id="wechsel" onClick={() => setFassung("bbbbbbbbbbbbbbbb")}>
          Fassung wechseln
        </button>
        <WerkzeugListe
          werkzeuge={[eintrag]}
          onEinstufen={(id, art, f) => protokolliere(`eingestuft: ${id} = ${art} @${f ?? "-"}`)}
        />
      </div>
    </Seite>
  );
}

function Fehler() {
  return (
    <Seite titel="Apps – Fehler">
      <div className="stapel">
        {APP_FEHLER_ARTEN.map((art) => (
          <AppZeile
            key={art}
            {...(BEISPIEL_FEHLER[art] as AppZeileProps)}
            onErneutTesten={() => protokolliere(`erneut: ${art}`)}
            onTrennen={() => undefined}
          />
        ))}
      </div>
    </Seite>
  );
}

function NotAus() {
  return (
    <Seite titel="Apps – Not-Aus">
      <div className="stapel">
        <NotAusHinweis />
        <AppZeile
          {...(BEISPIEL_APPS.notaus as AppZeileProps)}
          onOeffnen={() => undefined}
          onErneutTesten={() => undefined}
          onTrennen={() => undefined}
        >
          <Zugriffe app={BEISPIEL_APPS.notaus?.name ?? ""} lesend={2} />
        </AppZeile>
      </div>
    </Seite>
  );
}

function Lang() {
  const { liste, einstufen } = useWerkzeuge([
    {
      id: "l1",
      name: "ein_werkzeug_mit_einem_sehr_langen_namen_der_nirgends_ein_ende_findet_und_umbrechen_muss",
      titel:
        "Ein Titel, der ebenfalls viel zu lang ist, um in eine einzige Zeile auf einem schmalen Telefon zu passen",
      beschreibung: BEISPIEL_APPS.lang?.beschreibung,
      status: "geaendert",
      bisher: "liest",
      fassung: "0123456789abcdef",
      aenderungen: [
        {
          feld: "beschreibung",
          vorher: "Kurz.",
          nachher: "Eine sehr lange neue Beschreibung ohne Leerzeichen: ".concat("x".repeat(200)),
        },
      ],
    },
  ]);
  return (
    <Seite titel="Lange Namen">
      <div className="stapel">
        <AppZeile
          {...(BEISPIEL_APPS.lang as AppZeileProps)}
          onOeffnen={() => undefined}
          onErneutTesten={() => undefined}
          onTrennen={() => undefined}
        />
        <WerkzeugListe werkzeuge={liste} onEinstufen={einstufen} />
      </div>
    </Seite>
  );
}

function NeuVerbinden() {
  const [fehler, setFehler] = useState<AppFehlerArt | undefined>();
  return (
    <Seite titel="Getrennte App neu verbinden">
      <NeuVerbindenForm
        name="Aufgaben"
        adresse="https://aufgaben.beispiel.example/mcp"
        tokenNoetig
        fehlerArt={fehler}
        onVerbinden={(token) => {
          protokolliere(`neu verbinden: token ${token.length} Zeichen`);
          setFehler("zugang_ungueltig");
        }}
      />
    </Seite>
  );
}

const ANSICHTEN: Record<string, () => React.ReactNode> = {
  leer: () => <Leer />,
  formular: () => <Formular />,
  neuverbinden: () => <NeuVerbinden />,
  verbindet: () => <Verbindet />,
  verbunden: () => <Verbunden />,
  gesperrt: () => <Gesperrt />,
  fassungswechsel: () => <Fassungswechsel />,
  fehler: () => <Fehler />,
  notaus: () => <NotAus />,
  lang: () => <Lang />,
};

const parameter = new URLSearchParams(location.search);
const thema = parameter.get("thema");
if (thema === "hell" || thema === "dunkel") {
  document.documentElement.dataset.theme = thema === "hell" ? "light" : "dark";
}
const ansicht = ANSICHTEN[parameter.get("ansicht") ?? "verbunden"] ?? ANSICHTEN.verbunden;
const wurzel = document.getElementById("wurzel");
if (wurzel && ansicht) createRoot(wurzel).render(ansicht());
