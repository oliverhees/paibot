/**
 * PaiBot – Beispielseite mit allen Komponenten und ihren Zuständen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { BOT_COLORS } from "@paibot/shared/objekte";
import { t, tList } from "@paibot/shared/texte";
import {
  AntwortZeile,
  Avatar,
  Button,
  ChatBubble,
  ChatEingabe,
  Dialog,
  EmptyState,
  ErrorState,
  Footer,
  IconButton,
  LoadingState,
  Logo,
  Markdown,
  Menue,
  PruefErgebnis,
  Reiter,
  ScrollBereich,
  Select,
  StatusChip,
  Switch,
  TextArea,
  TextField,
  Wortmarke,
} from "@paibot/ui";
import { type ReactNode, useState } from "react";
import styles from "./beispiele.module.css";
import { BLOCK_TEXTE, MARKDOWN_PROBE } from "./daten";
import { BelegeListe, ShellDemo } from "./demo";

const FARB_TOKENS = [
  "bg",
  "surface",
  "surface-raised",
  "surface-sunken",
  "ink",
  "ink-soft",
  "line",
  "line-mid",
  "line-strong",
  "accent",
  "accent-text",
  "accent-soft",
  "eu",
  "eu-soft",
  "ok",
  "ok-soft",
  "warn",
  "warn-soft",
  "danger",
  "danger-soft",
  "focus",
];

const ZUSTAENDE = ["normal", "hover", "fokus", "aktiv"] as const;

function Karte({
  titel,
  children,
  breit,
}: {
  titel: string;
  children: ReactNode;
  breit?: boolean;
}) {
  return (
    <section className={breit ? `${styles.karte} ${styles.breit}` : styles.karte}>
      <h2 className={styles.kartenTitel}>{titel}</h2>
      {children}
    </section>
  );
}

function Reihe({ children }: { children: ReactNode }) {
  return <div className={styles.reihe}>{children}</div>;
}

function zustand(z: (typeof ZUSTAENDE)[number]) {
  return z === "normal" ? {} : { "data-zustand": z };
}

/** Beispielseite: alle Komponenten mit ihren Zuständen, nur erfundene Daten. */
export function Beispiele() {
  const [thema, setThema] = useState<"system" | "dark" | "light">("system");
  const [schalter, setSchalter] = useState(true);
  const [eingabeSchleuse, setEingabeSchleuse] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [dialog, setDialog] = useState<null | "dialog" | "blatt">(null);
  const [reiter, setReiter] = useState("belege");
  const [gesendet, setGesendet] = useState<string | null>(null);

  const themaSetzen = (neu: "system" | "dark" | "light") => {
    setThema(neu);
    if (neu === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", neu);
  };

  return (
    <ScrollBereich className={styles.seite} label="Beispielseite">
      <div className={styles.innen}>
        <header className={styles.kopf}>
          <span className={styles.marke}>
            <Logo groesse={32} />
            <Wortmarke groesse={22} />
          </span>
          <div>
            <h1 className={styles.titel}>Komponenten</h1>
            <p className={styles.leise}>
              Alle Bausteine mit ihren Zuständen. Nur in der Entwicklung erreichbar, nur
              Beispiel-Daten.
            </p>
          </div>
          <div className={styles.thema}>
            {(["system", "dark", "light"] as const).map((x) => (
              <Button
                key={x}
                art={thema === x ? "leise" : "zweit"}
                aria-pressed={thema === x}
                onClick={() => themaSetzen(x)}
              >
                {x === "system" ? "wie System" : x === "dark" ? "dunkel" : "hell"}
              </Button>
            ))}
          </div>
        </header>

        <div className={styles.raster}>
          <Karte titel="Farben" breit>
            <div className={styles.farben}>
              {FARB_TOKENS.map((f) => (
                <div key={f} className={styles.farbe}>
                  <i style={{ background: `var(--${f})` }} />
                  <span>--{f}</span>
                </div>
              ))}
            </div>
          </Karte>

          <Karte titel="Schrift">
            <Wortmarke groesse={26} />
            <span className={styles.ueberschrift}>Überschrift, Inter 650</span>
            <strong>Zwischentitel, Inter 600</strong>
            <span>Fließtext, Inter 400. Pai hat deine Antwort vorbereitet.</span>
            <span className={styles.mono}>B-0142 · 9f3c 81d2 … a71e</span>
            <span className={styles.etikett}>Etikett</span>
          </Karte>

          <Karte titel="Knöpfe">
            {(["primaer", "zweit", "leise", "gefahr"] as const).map((art) => (
              <Reihe key={art}>
                {ZUSTAENDE.map((z) => (
                  <Button key={z} art={art} {...zustand(z)}>
                    {z}
                  </Button>
                ))}
              </Reihe>
            ))}
            <Reihe>
              <Button art="primaer" disabled>
                deaktiviert
              </Button>
              <Button art="primaer" laedt>
                {t("allgemein.laedt")}
              </Button>
              <Button art="zweit" icon="neuLaden">
                {t("allgemein.erneut")}
              </Button>
              <Button art="primaer" groesse="gross">
                {t("allgemein.speichern")}
              </Button>
            </Reihe>
          </Karte>

          <Karte titel="Symbol-Knöpfe">
            <Reihe>
              {ZUSTAENDE.map((z) => (
                <IconButton key={z} icon="panel" label={`Arbeitsfläche (${z})`} {...zustand(z)} />
              ))}
              <IconButton icon="panel" label="Arbeitsfläche (gedrückt)" aria-pressed="true" />
              <IconButton icon="panel" label="Arbeitsfläche (deaktiviert)" disabled />
            </Reihe>
            <Reihe>
              <IconButton icon="hoch" label={t("chat.senden")} art="rund-akzent" groesse={34} />
              <IconButton
                icon="hoch"
                label={`${t("chat.senden")} (deaktiviert)`}
                art="rund-akzent"
                groesse={34}
                disabled
              />
              <IconButton icon="stopp" label={t("chat.stopp")} art="rund" groesse={34} />
            </Reihe>
          </Karte>

          <Karte titel="Eingabefelder">
            <TextField label={t("bot.name")} defaultValue="Pai" />
            <TextField label="Mit Hover" placeholder="Zeiger darüber" data-zustand="hover" />
            <TextField label="Mit Fokus" placeholder="hat den Fokus" data-zustand="fokus" />
            <TextField
              label={t("modelle.schluessel")}
              type="password"
              defaultValue="beispiel-schluessel"
              fehler={t("fehler.schluessel_ungueltig")}
              hilfe="Der Schlüssel bleibt auf deinem Server."
            />
            <TextField
              label={t("modelle.basis_url")}
              value="https://api.eurouter.example"
              readOnly
              hilfe="fest"
            />
            <TextField label="Deaktiviert" defaultValue="geht gerade nicht" disabled />
            <TextField label={t("modelle.verbindungstest")} defaultValue="prüft …" laedt />
          </Karte>

          <Karte titel="Textfeld und Auswahl">
            <TextArea label={t("bot.anweisung")} defaultValue={tList("bot.beispiele")[0]} />
            <TextArea
              label="Mit Fehler"
              fehler="Bitte kürzer, höchstens 2000 Zeichen."
              defaultValue="…"
            />
            <Select
              label={t("einstellungen.zeitzone")}
              defaultValue="Europe/Berlin"
              optionen={[
                { wert: "Europe/Berlin", text: "Europe/Berlin" },
                { wert: "Europe/Vienna", text: "Europe/Vienna" },
                { wert: "Europe/Zurich", text: "Europe/Zurich" },
              ]}
            />
            <Select
              label="Deaktiviert"
              disabled
              optionen={[{ wert: "a", text: "Beispiel-Modell Groß" }]}
            />
          </Karte>

          <Karte titel="Schalter">
            <Switch an={schalter} onAendern={setSchalter} label={t("schleuse.schalter")}>
              {t("seite.datenschleuse")} {schalter ? t("schleuse.an") : t("schleuse.aus")}
            </Switch>
            <Switch an={false} onAendern={() => {}}>
              aus
            </Switch>
            <Switch an onAendern={() => {}} data-zustand="hover">
              an, Hover
            </Switch>
            <Switch an onAendern={() => {}} data-zustand="fokus">
              an, Fokus
            </Switch>
            <Switch an={false} onAendern={() => {}} disabled>
              {t("schleuse.status.nicht_installiert")}
            </Switch>
          </Karte>

          <Karte titel="Status (immer mit Wort)">
            <Reihe>
              <StatusChip art="ok">{t("pruefung.gueltig")}</StatusChip>
              <StatusChip art="warn">wartet auf dich</StatusChip>
              <StatusChip art="fehler">{t("schleuse.status.nicht_erreichbar")}</StatusChip>
              <StatusChip art="neutral">nicht geprüft</StatusChip>
              <StatusChip art="arbeitet">arbeitet</StatusChip>
              <StatusChip art="eu">{t("modelle.region.eu")}</StatusChip>
            </Reihe>
          </Karte>

          <Karte titel="Avatare: feste Paare aus Form und Farbe" breit>
            <div className={styles.avatare}>
              {BOT_COLORS.map((farbe) => (
                <figure key={farbe}>
                  <Avatar farbe={farbe} groesse={44} titel={`Avatar ${farbe}`} />
                  <figcaption>{farbe}</figcaption>
                </figure>
              ))}
            </div>
            <div className={styles.avatare}>
              {(["bereit", "arbeitet", "wartet", "schlaeft"] as const).map((z) => (
                <figure key={z}>
                  <Avatar farbe="violett" groesse={44} zustand={z} />
                  <figcaption>{z === "schlaeft" ? "schläft" : z}</figcaption>
                </figure>
              ))}
              <figure>
                <Avatar farbe="limette" groesse={44} still />
                <figcaption>still</figcaption>
              </figure>
            </div>
          </Karte>

          <Karte titel="Nachrichten" breit>
            <div className={styles.nachrichten}>
              <ChatBubble von="du" zeit="14:31">
                Kannst du mir eine Absage für den Termin mit Max Mustermann schreiben?
              </ChatBubble>
              <ChatBubble
                von="bot"
                name="Pai"
                zeit="14:31"
                avatar={<Avatar farbe="violett" groesse={30} still />}
                fuss={
                  <AntwortZeile
                    beleg={{ kennung: "B-0141", zustand: "gueltig", onPruefen: () => {} }}
                    schleuse={{ modus: "schleuse", kurz: "geschützt" }}
                    modell={{ name: "Beispiel-Modell Groß", region: "eu" }}
                    details={<p className={styles.leise}>Beim Modell kam &lt;PERSON_1&gt; an.</p>}
                  />
                }
              >
                <Markdown text={MARKDOWN_PROBE} blockTexte={BLOCK_TEXTE} />
              </ChatBubble>
              <ChatBubble
                von="bot"
                name="Pai"
                zeit="14:32"
                avatar={<Avatar farbe="violett" groesse={30} zustand="arbeitet" />}
                zustand="streamt"
              >
                <p>Ich schreibe gerade</p>
              </ChatBubble>
              <ChatBubble
                von="bot"
                name="Pai"
                zeit="14:33"
                avatar={<Avatar farbe="violett" groesse={30} still />}
                zustand="abgebrochen"
                zustandText={t("chat.antwort.abgebrochen")}
              >
                <p>Hallo Herr Mustermann, leider</p>
              </ChatBubble>
              <ChatBubble
                von="bot"
                name="Pai"
                zeit="14:34"
                avatar={<Avatar farbe="violett" groesse={30} still />}
                zustand="fehler"
                zustandText={t("chat.antwort.fehlgeschlagen")}
              >
                <ErrorState
                  code="kein_modell"
                  aktion={<Button art="primaer">Modell wählen</Button>}
                />
              </ChatBubble>
            </div>
          </Karte>

          <Karte titel="Zeile unter der Antwort">
            <AntwortZeile
              beleg={{ kennung: "B-0142", zustand: "offen", onPruefen: () => {} }}
              schleuse={{ modus: "direkt" }}
              modell={{ name: "Beispiel-Modell Groß", region: "eu" }}
            />
            <AntwortZeile
              beleg={{ kennung: "B-0143", zustand: "ungueltig", zustandText: "ungültig" }}
              schleuse={{
                modus: "schleuse",
                text: "Datenschleuse: 2 Angaben maskiert",
                kurz: "2 maskiert",
              }}
              modell={{ name: "Beispiel-Modell Außerhalb", region: "non_eu" }}
            />
            <div className={styles.schmal}>
              <span className={styles.etikett}>schmal (Handy)</span>
              <AntwortZeile
                beleg={{ kennung: "B-0141", zustand: "gueltig", onPruefen: () => {} }}
                schleuse={{
                  modus: "schleuse",
                  text: "Datenschleuse: 2 Angaben maskiert",
                  kurz: "2 maskiert",
                }}
                modell={{ name: "Beispiel-Modell Groß", region: "eu" }}
              />
            </div>
          </Karte>

          <Karte titel="Prüf-Ergebnis">
            <PruefErgebnis zustand="laeuft" />
            <PruefErgebnis
              zustand="gueltig"
              punkte={[
                { ok: true, text: t("pruefung.inhalt.ok") },
                { ok: true, text: t("pruefung.signatur.ok", { kurzform: "3f9c-2ab1" }) },
                { ok: true, text: t("pruefung.kette.ok") },
                { ok: true, text: t("pruefung.entscheidung.ok", { regel: "R-002" }) },
              ]}
            />
            <PruefErgebnis
              zustand="ungueltig"
              seq={141}
              punkte={[
                { ok: false, text: t("pruefung.inhalt.fehler") },
                { ok: true, text: t("pruefung.signatur.ok", { kurzform: "3f9c-2ab1" }) },
                { ok: false, text: t("pruefung.kette.fehler") },
              ]}
            />
          </Karte>

          <Karte titel="Leer, lädt, Fehler">
            <EmptyState
              titel={t("chat.leer.titel")}
              text={<p>{t("chat.leer.hinweis")}</p>}
              bild={<Avatar farbe="violett" groesse={48} zustand="schlaeft" />}
              aktion={tList("chat.leer.beispiele")
                .slice(0, 2)
                .map((b) => (
                  <Button key={b} art="leise">
                    {b}
                  </Button>
                ))}
            />
            <LoadingState />
            <ErrorState
              code="anbieter_nicht_erreichbar"
              ursache="Beim Verbindungstest kam nach 10 Sekunden keine Antwort."
              aktion={
                <Button art="zweit" icon="neuLaden">
                  {t("allgemein.erneut")}
                </Button>
              }
            />
          </Karte>

          <Karte titel="Eingabe des Chats" breit>
            <ChatEingabe
              onSenden={(text) => {
                setGesendet(text);
                setLaeuft(true);
              }}
              laeuft={laeuft}
              onStopp={() => setLaeuft(false)}
              schleuseAn={eingabeSchleuse}
              onSchleuse={setEingabeSchleuse}
              notiz={
                gesendet
                  ? `Gesendet: „${gesendet}“`
                  : "Enter sendet, Umschalt+Enter macht eine neue Zeile."
              }
            />
            <ChatEingabe
              onSenden={() => {}}
              schleuseAn={false}
              onSchleuse={() => {}}
              schleuseDeaktiviert
              deaktiviert
              platzhalter={t("fehler.kein_modell")}
            />
          </Karte>

          <Karte titel="Dialog, Blatt, Menü">
            <Reihe>
              <Button art="gefahr" onClick={() => setDialog("dialog")}>
                {t("chat.loeschen")}
              </Button>
              <Button art="zweit" onClick={() => setDialog("blatt")}>
                Blatt öffnen
              </Button>
              <Menue
                label="Weitere Aktionen"
                ausrichtung="start"
                eintraege={[
                  { id: "u", text: t("chat.umbenennen"), icon: "stift", onWaehlen: () => {} },
                  {
                    id: "x",
                    text: "Exportieren (deaktiviert)",
                    deaktiviert: true,
                    onWaehlen: () => {},
                  },
                  {
                    id: "l",
                    text: t("chat.loeschen"),
                    icon: "papierkorb",
                    gefahr: true,
                    onWaehlen: () => setDialog("dialog"),
                  },
                ]}
              />
            </Reihe>
            <Dialog
              offen={dialog === "dialog"}
              onSchliessen={() => setDialog(null)}
              titel={t("chat.loeschen")}
              schliessenLabel="Schließen"
              rueckfrage
              aktionen={
                <>
                  <Button art="zweit" onClick={() => setDialog(null)}>
                    {t("allgemein.abbrechen")}
                  </Button>
                  <Button art="gefahr" onClick={() => setDialog(null)}>
                    {t("allgemein.loeschen")}
                  </Button>
                </>
              }
            >
              <p>{t("chat.loeschen.frage", { titel: "Antwort an Max Mustermann" })}</p>
            </Dialog>
            <Dialog
              offen={dialog === "blatt"}
              onSchliessen={() => setDialog(null)}
              titel={t("seite.belege")}
              schliessenLabel="Schließen"
              art="blatt"
            >
              <BelegeListe />
            </Dialog>
          </Karte>

          <Karte titel="Reiter">
            <Reiter
              label="Bereiche"
              aktiv={reiter}
              onWechsel={setReiter}
              reiter={[
                { id: "belege", text: t("seite.belege"), zahl: 4, inhalt: <BelegeListe /> },
                {
                  id: "regeln",
                  text: t("belege.regeln"),
                  inhalt: <p className={styles.leise}>{t("regel.R-001")}</p>,
                },
              ]}
            />
          </Karte>

          <Karte titel="Fußzeile">
            <Footer />
          </Karte>

          <Karte titel="AppShell (eingebettet)" breit>
            <p className={styles.leise}>
              Bildschirmfüllend unter <a href="/_komponenten/app">/_komponenten/app</a>.
            </p>
            <div className={styles.shellRahmen}>
              <ShellDemo eingebettet />
            </div>
          </Karte>
        </div>
      </div>
    </ScrollBereich>
  );
}
