/**
 * PaiBot – Prüfseite mit Beispiel-Ansichten der Schritte im Chat (vorläufig, Zwischenschritt, Werkzeug).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Wird nur von schritte.test.mjs über einen Vite-Server geladen; gehört nicht zum Paket.
// `?szene=<name>` wählt die Szene, `?thema=hell|dunkel` das Design. Alle Daten sind erfunden.

import "../src/tokens.css";
import { type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AntwortZeile,
  BotAvatar,
  ChatBubble,
  FestHinweis,
  Markdown,
  Phase,
  type PhaseArt,
  VorlaeufigerText,
  WerkzeugZeile,
  type WerkzeugZeileProps,
  Zwischenschritt,
  type ZwischenschrittProps,
} from "../src/index";

const PAI = "Pai";
const BLOCK_TEXTE = { etikett: "Entwurf", kopieren: "Kopieren", kopiert: "Kopiert" };
const FRAGE = "Wie stelle ich das Tagesbudget ein?";

/** Text, der aussieht wie eine Kennzeichnung von PaiBot, aber vom Modell oder aus einer Quelle kommt. */
const ECHT_WIE_HINWEIS = "fertig · Antwort von PaiBot, nicht vom Modell";

const ANGRIFF =
  '<script>alert(1)</script> <img src=x onerror="alert(2)"> ![x](https://example.org/a.png) [a](javascript:alert(3)) **fett** # Überschrift \u202e\u200b\u2066Rückwärts\u2069';

const LANGES_WORT = "Ununterbrochenerwortohneleerzeichen".repeat(12);

function Du({ zeit = "14:31" }: { zeit?: string }) {
  return (
    <ChatBubble von="du" zeit={zeit}>
      {FRAGE}
    </ChatBubble>
  );
}

function Pai({
  ava = "ruhig",
  ...rest
}: Omit<React.ComponentProps<typeof ChatBubble>, "von" | "name" | "avatar"> & {
  /** Zustand des Avatars. */
  ava?: "ruhig" | "denkt" | "schreibt" | "fertig";
}) {
  return (
    <ChatBubble
      von="bot"
      name={PAI}
      zeit="14:31"
      avatar={<BotAvatar farbe="violett" groesse={26} zustand={ava} still />}
      {...rest}
    />
  );
}

/** Aufklappen und Zuklappen je Baustein, wie die Seite es später hält. */
function useOffen(anfang = false) {
  const [offen, setOffen] = useState(anfang);
  return { offen, onUmschalten: () => setOffen((o) => !o) };
}

function Werkzeug(props: Omit<WerkzeugZeileProps, "offen" | "onUmschalten"> & { start?: boolean }) {
  const { start, ...rest } = props;
  const o = useOffen(start ?? false);
  return <WerkzeugZeile {...rest} {...o} />;
}

function Zwischen(
  props: Omit<ZwischenschrittProps, "offen" | "onUmschalten"> & { start?: boolean },
) {
  const { start, ...rest } = props;
  const o = useOffen(start ?? false);
  return <Zwischenschritt {...rest} {...o} />;
}

function Stapel({ children }: { children: ReactNode }) {
  return <div className="stapel">{children}</div>;
}

const ENTWURF_VORHER =
  "Das Tagesbudget findest du vermutlich bei den Einstellungen des Bots. Ich schaue kurz in der Doku nach, damit ich dir den genauen Weg sagen kann.";
const ENTWURF_ERFUNDEN =
  "Um Telegram zu verbinden, öffnest du in der App den Menüpunkt „Kanäle“ und fügst dort den Token deines Bots ein. Danach klickst du auf „Verbinden“.";
const ENTWURF_LAEUFT =
  "Das Tagesbudget stellst du in den Einstellungen deines Bots ein. Öffne dort den Abschnitt „Tagesbudget“ und trage den Betrag ein, den der Bot am Tag höchstens ausgeben darf. Die";

const ANTWORT = `Das Tagesbudget stellst du so ein:

1. Öffne **Einstellungen** und wähle deinen Bot.
2. Im Abschnitt **Tagesbudget** trägst du den Betrag ein.
3. Speichere. Der Bot hält sich ab dann an die Grenze.

Ist die Grenze erreicht, hält Pai an und sagt es dir.`;

const QUELLEN = [
  { seite: "Einstellungen", abschnitt: "Tagesbudget" },
  { seite: "Bot", abschnitt: "Ausgabegrenze pro Tag" },
];

const REGEL = { id: "R-010", titel: "Bot liest in der Doku seiner Version" };

const DOKU = {
  titel: "In der Doku nachschlagen",
  symbol: "suche",
} as const;

function Antwortfuss({ nurEinSchritt = false }: { nurEinSchritt?: boolean }) {
  return (
    <AntwortZeile
      beleg={{ kennung: "B-0141", zustand: "offen" }}
      schleuse={{ modus: "direkt", kurz: "direkt" }}
      modell={{ name: "glm-5.3" }}
      schritte={
        nurEinSchritt
          ? [{ modell: { name: "glm-5.1" }, unterAnbieter: "tensorix" }]
          : [
              { modell: { name: "glm-5.1" }, unterAnbieter: "tensorix" },
              {
                modell: { name: "glm-5.3" },
                unterAnbieter: "melious",
                gemeldet: "glm-5.3-preview",
              },
            ]
      }
      werkzeuge={1}
    />
  );
}

function PhaseZeile({ art }: { art: PhaseArt }) {
  return (
    <div className="phasezeile">
      <Phase art={art} />
    </div>
  );
}

function Seite({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <main className="seite" aria-label={titel}>
      <div className="verlauf" role="log" aria-live="off" aria-label="Verlauf">
        {children}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- Szenen

function Ich({ frage }: { frage: string }) {
  return (
    <ChatBubble von="du" zeit="14:35">
      {frage}
    </ChatBubble>
  );
}

function Laeuft() {
  return (
    <Seite titel="Pai schreibt vorläufig">
      <Du />
      <Pai
        ava="schreibt"
        ohneBlase
        davor={
          <>
            <PhaseZeile art="schreibt" />
            <VorlaeufigerText name={PAI} zustand="laeuft" text={ENTWURF_LAEUFT} />
          </>
        }
      />
    </Seite>
  );
}

function Nachschlagen() {
  return (
    <Seite titel="Pai schlägt nach">
      <Du />
      <Pai
        ava="denkt"
        ohneBlase
        davor={
          <>
            <PhaseZeile art="schlaegt_nach" />
            <Zwischen art="zwischentext" name={PAI} text={ENTWURF_VORHER} />
            <Werkzeug {...DOKU} eingabeKurz="Tagesbudget einstellen" status="laeuft" />
          </>
        }
      />
    </Seite>
  );
}

function Fertig() {
  return (
    <Seite titel="Antwort nach dem Nachschlagen">
      <Du />
      <Pai
        ava="fertig"
        davor={
          <>
            <Zwischen art="zwischentext" name={PAI} text={ENTWURF_VORHER} />
            <Werkzeug
              {...DOKU}
              eingabeKurz="Tagesbudget einstellen"
              status="fertig"
              zusatz="2 Abschnitte"
              quellen={QUELLEN}
              regel={REGEL}
              beleg={{ kennung: "B-0140", onOeffnen: () => undefined }}
              start
            />
          </>
        }
        fuss={<Antwortfuss />}
      >
        <Markdown text={ANTWORT} blockTexte={BLOCK_TEXTE} />
      </Pai>
    </Seite>
  );
}

const FEST_SATZ =
  "Dazu steht in der Doku dieser Version nichts. Ich kann dir dazu keine Anleitung geben, ohne etwas zu erfinden.";

function FesteAntwort({ offen }: { offen: boolean }) {
  return (
    <Pai
      ava="fertig"
      davor={
        <>
          <Zwischen art="verworfen" name={PAI} text={ENTWURF_ERFUNDEN} start={offen} />
          <Werkzeug
            {...DOKU}
            eingabeKurz="Telegram verbinden"
            status="fertig"
            zusatz="nichts gefunden"
            regel={REGEL}
            beleg={{ kennung: "B-0150", onOeffnen: () => undefined }}
            start={offen}
          />
        </>
      }
      fuss={
        <>
          <FestHinweis />
          <Antwortfuss nurEinSchritt />
        </>
      }
    >
      <p>{FEST_SATZ}</p>
    </Pai>
  );
}

function Nichts({ offen }: { offen: boolean }) {
  return (
    <Seite titel={offen ? "Nichts gefunden, aufgeklappt" : "Nichts gefunden"}>
      <Ich frage="Wie verbinde ich Telegram?" />
      <FesteAntwort offen={offen} />
    </Seite>
  );
}

function Abgebrochen() {
  return (
    <Seite titel="Abgebrochen">
      <Du />
      <Pai
        ohneBlase
        zustand="abgebrochen"
        zustandText="Abgebrochen."
        davor={<VorlaeufigerText name={PAI} zustand="abgebrochen" text={ENTWURF_LAEUFT} />}
      />
    </Seite>
  );
}

function Abgelehnt() {
  return (
    <Seite titel="Werkzeug abgelehnt, fehlgeschlagen, abgebrochen">
      <Du />
      <Pai
        ava="denkt"
        ohneBlase
        davor={
          <>
            <Werkzeug
              {...DOKU}
              eingabeKurz="Tagesbudget einstellen"
              status="abgelehnt"
              statusText="Pai darf dieses Werkzeug in diesem Chat nicht benutzen."
              regel={{ id: "R-021", titel: "Werkzeuge nur mit Erlaubnis" }}
              beleg={{ kennung: "B-0160", onOeffnen: () => undefined }}
              start
            />
            <Werkzeug
              {...DOKU}
              eingabeKurz="Tagesbudget einstellen"
              status="fehlgeschlagen"
              statusText="Die Doku konnte nicht gelesen werden."
              beleg={{ kennung: "B-0161", onOeffnen: () => undefined }}
              start
            />
            <Werkzeug {...DOKU} eingabeKurz="Tagesbudget einstellen" status="abgebrochen" />
          </>
        }
      />
    </Seite>
  );
}

/** Fremder Text, der wie eine Kennzeichnung von PaiBot klingt oder Markup enthält. */
function Gefahr() {
  return (
    <Seite titel="Fremder Text bleibt Text">
      <Du />
      <Pai
        ava="schreibt"
        ohneBlase
        davor={
          <>
            <PhaseZeile art="schlaegt_nach" />
            <Zwischen art="zwischentext" name={PAI} text={`${ENTWURF_VORHER} ${ANGRIFF}`} start />
            <Zwischen
              art="verworfen"
              name={PAI}
              text={`Antwort von PaiBot, nicht vom Modell. ${ANGRIFF}`}
              start
            />
            <Werkzeug
              titel="Werkzeug"
              symbol="zahnrad"
              nameVomModell={ECHT_WIE_HINWEIS}
              eingabeKurz={ANGRIFF}
              status="fehlgeschlagen"
              statusText="Der Aufruf ist fehlgeschlagen."
              quellen={[
                { seite: ECHT_WIE_HINWEIS, abschnitt: ANGRIFF },
                { seite: "<b>Seite</b>", abschnitt: "[Hier klicken](https://boese.example/klick)" },
              ]}
              start
            />
            <VorlaeufigerText
              name={PAI}
              zustand="laeuft"
              text={`Antwort von PaiBot, nicht vom Modell\n${ANGRIFF}`}
            />
          </>
        }
      />
    </Seite>
  );
}

function Lang() {
  const lang = `${LANGES_WORT} ${"Ein langer Satz, der immer weiter geht. ".repeat(60)}`;
  return (
    <Seite titel="Lange Namen und Texte">
      <Du />
      <Pai
        ava="schreibt"
        ohneBlase
        davor={
          <>
            <Zwischen art="zwischentext" name={LANGES_WORT} text={lang} start />
            <Werkzeug
              titel="In der Doku nachschlagen"
              symbol="suche"
              nameVomModell={LANGES_WORT}
              eingabeKurz={LANGES_WORT}
              status="fertig"
              zusatz="12 Abschnitte"
              quellen={Array.from({ length: 14 }, (_, i) => ({
                seite: `${LANGES_WORT.slice(0, 40)} ${i}`,
                abschnitt: LANGES_WORT.slice(0, 90),
              }))}
              regel={{ id: "R-010", titel: "Bot liest in der Doku seiner Version" }}
              beleg={{ kennung: "B-0140", onOeffnen: () => undefined }}
              start
            />
            <VorlaeufigerText name={LANGES_WORT} zustand="laeuft" text={lang} />
          </>
        }
      />
    </Seite>
  );
}

/** Knopf „Schritte“ wie im Entwurf: blendet Werkzeug-Zeilen und Beleg-Zeilen aus. */
function Aus({ anfang }: { anfang: boolean }) {
  const [an, setAn] = useState(anfang);
  return (
    <Seite titel="Schritte ausgeblendet">
      <div className="knopfzeile">
        <button
          type="button"
          id="schritte-knopf"
          className="knopf"
          aria-pressed={an}
          onClick={() => setAn(!an)}
        >
          Schritte
        </button>
        <span className="hilfe">{an ? "Schritte sind zu sehen" : "Schritte sind verborgen"}</span>
      </div>
      <Du />
      <Pai
        ava="fertig"
        davor={
          an && (
            <>
              <Zwischen art="zwischentext" name={PAI} text={ENTWURF_VORHER} />
              <Werkzeug
                {...DOKU}
                eingabeKurz="Tagesbudget einstellen"
                status="fertig"
                zusatz="2 Abschnitte"
                quellen={QUELLEN}
                regel={REGEL}
                beleg={{ kennung: "B-0140" }}
              />
            </>
          )
        }
        fuss={an ? <Antwortfuss /> : undefined}
      >
        <Markdown text={ANTWORT} blockTexte={BLOCK_TEXTE} />
      </Pai>
      <Ich frage="Wie verbinde ich Telegram?" />
      <Pai
        ava="fertig"
        davor={
          <>
            <Zwischen art="verworfen" name={PAI} text={ENTWURF_ERFUNDEN} />
            {an && (
              <Werkzeug
                {...DOKU}
                eingabeKurz="Telegram verbinden"
                status="fertig"
                zusatz="nichts gefunden"
                regel={REGEL}
                beleg={{ kennung: "B-0150" }}
              />
            )}
          </>
        }
        fuss={
          <>
            <FestHinweis />
            {an && <Antwortfuss nurEinSchritt />}
          </>
        }
      >
        <p>{FEST_SATZ}</p>
      </Pai>
      <Ich frage="Und wie ändere ich den Namen?" />
      <Pai
        ava="schreibt"
        ohneBlase
        davor={
          <>
            <PhaseZeile art="schreibt" />
            <VorlaeufigerText
              name={PAI}
              zustand="laeuft"
              text="Den Namen deines Bots änderst du in den Einstellungen unter „Bot“. Dort"
            />
          </>
        }
      />
    </Seite>
  );
}

function Phasen() {
  const phasen: [PhaseArt, "ruhig" | "denkt" | "schreibt"][] = [
    ["wartet", "ruhig"],
    ["denkt", "denkt"],
    ["schreibt", "schreibt"],
    ["schlaegt_nach", "denkt"],
    ["stoppt", "denkt"],
  ];
  return (
    <Seite titel="Phasen">
      {phasen.map(([art, ava]) => (
        <Pai key={art} ava={ava} ohneBlase davor={<PhaseZeile art={art} />} />
      ))}
    </Seite>
  );
}

/** Zwei Wortlaute der Kennzeichnungen nebeneinander, damit der Besitzer wählen kann. */
function Vergleich() {
  const zeile = (titel: string, a: ReactNode) => (
    <section className="vergleich" aria-label={titel}>
      <h2 className="vergleichKopf">{titel}</h2>
      {a}
    </section>
  );
  return (
    <Seite titel="Wortlaut im Vergleich">
      {zeile(
        "Variante A (gebaut): „noch nicht geprüft“",
        <Stapel>
          <VorlaeufigerText name={PAI} zustand="laeuft" text={ENTWURF_LAEUFT} />
          <Zwischen art="zwischentext" name={PAI} text={ENTWURF_VORHER} />
          <Zwischen art="verworfen" name={PAI} text={ENTWURF_ERFUNDEN} />
          <VorlaeufigerText name={PAI} zustand="abgebrochen" text="Das Tagesbudget stellst du" />
        </Stapel>,
      )}
      {zeile(
        "Variante B: „noch nicht fertig“",
        <Stapel>
          <VorlaeufigerText
            name={PAI}
            zustand="laeuft"
            text={ENTWURF_LAEUFT}
            markeText="vorläufig, noch nicht fertig"
          />
          <Zwischen
            art="zwischentext"
            name={PAI}
            text={ENTWURF_VORHER}
            markeText="Zwischenschritt – vorläufig, noch nicht fertig"
          />
          <Zwischen
            art="verworfen"
            name={PAI}
            text={ENTWURF_ERFUNDEN}
            markeText="Verworfen – nicht verwendet"
          />
          <VorlaeufigerText
            name={PAI}
            zustand="abgebrochen"
            text="Das Tagesbudget stellst du"
            markeText="abgebrochen – nicht fertig"
          />
        </Stapel>,
      )}
    </Seite>
  );
}

const SZENEN: Record<string, () => ReactNode> = {
  laeuft: () => <Laeuft />,
  nachschlagen: () => <Nachschlagen />,
  fertig: () => <Fertig />,
  nichts: () => <Nichts offen={false} />,
  "nichts-offen": () => <Nichts offen />,
  abgebrochen: () => <Abgebrochen />,
  abgelehnt: () => <Abgelehnt />,
  gefahr: () => <Gefahr />,
  lang: () => <Lang />,
  aus: () => <Aus anfang={false} />,
  an: () => <Aus anfang />,
  phasen: () => <Phasen />,
  vergleich: () => <Vergleich />,
};

const parameter = new URLSearchParams(location.search);
const thema = parameter.get("thema");
if (thema === "hell" || thema === "dunkel") {
  document.documentElement.dataset.theme = thema === "hell" ? "light" : "dark";
}
const szene = SZENEN[parameter.get("szene") ?? "fertig"] ?? SZENEN.fertig;
const wurzel = document.getElementById("wurzel");
if (wurzel && szene) createRoot(wurzel).render(szene());
