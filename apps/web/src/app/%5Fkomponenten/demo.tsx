/**
 * PaiBot – Vorschau der AppShell mit Verlauf, Eingabe und Belegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { t } from "@paibot/shared/texte";
import {
  AntwortZeile,
  AppShell,
  AvatarLebendig,
  ChatBubble,
  ChatEingabe,
  Markdown,
  Menue,
  ScrollBereich,
  StatusChip,
} from "@paibot/ui";
import { useState } from "react";
import styles from "./beispiele.module.css";
import { ANTWORT_MARKDOWN, BELEGE, BLOCK_TEXTE, navigation, SHELL_TEXTE } from "./daten";

/** Liste der Belege für die Arbeitsfläche. */
export function BelegeListe() {
  return (
    <ul className={styles.belege}>
      {BELEGE.map((b) => (
        <li key={b.kennung} className={styles.beleg}>
          <span className={styles.belegText}>
            <strong>{b.aktion}</strong>
            <small>
              Pai · <span className={styles.mono}>{b.kennung}</span>
            </small>
          </span>
          <span className={styles.belegRechts}>
            <span className={styles.mono}>{b.zeit}</span>
            <StatusChip art={b.zustand === "gueltig" ? "ok" : "neutral"}>
              {b.zustand === "gueltig" ? t("pruefung.gueltig") : "nicht geprüft"}
            </StatusChip>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Verlauf mit Beispiel-Nachrichten. */
export function Verlauf({ streamt }: { streamt: boolean }) {
  return (
    <ScrollBereich className={styles.verlauf} label="Verlauf" role="log">
      <div className={styles.verlaufSpalte}>
        <ChatBubble von="du" zeit="14:31">
          Max Mustermann fragt, ob wir Donnerstag auf 14 Uhr gehen können. Schreib ihm bitte eine
          kurze, freundliche Antwort.
        </ChatBubble>
        <ChatBubble
          von="bot"
          name="Pai"
          zeit="14:31"
          avatar={<AvatarLebendig farbe="violett" groesse={30} />}
          fuss={
            <AntwortZeile
              beleg={{ kennung: "B-0141", zustand: "gueltig", onPruefen: () => {} }}
              schleuse={{
                modus: "schleuse",
                text: "Datenschleuse: 2 Angaben maskiert",
                kurz: "2 maskiert",
              }}
              modell={{ name: "Beispiel-Modell Groß", region: "eu" }}
              details={
                <p className={styles.leise}>
                  Beim Modell kamen statt der Namen nur Platzhalter an, z. B. &lt;PERSON_1&gt;.
                </p>
              }
            />
          }
        >
          <Markdown text={ANTWORT_MARKDOWN} blockTexte={BLOCK_TEXTE} />
        </ChatBubble>
        <ChatBubble von="du" zeit="14:32">
          Schlag zusätzlich Freitag um 10 Uhr vor.
        </ChatBubble>
        <ChatBubble
          von="bot"
          name="Pai"
          zeit="14:32"
          avatar={
            <AvatarLebendig
              farbe="violett"
              groesse={30}
              zustand={streamt ? "schreibt" : "ruhig"}
              still
            />
          }
          zustand={streamt ? "streamt" : "fertig"}
          fuss={
            streamt ? (
              <p className={styles.leise}>{t("chat.antwort.schreibt", { name: "Pai" })}</p>
            ) : (
              <AntwortZeile
                beleg={{ kennung: "B-0142", zustand: "offen", onPruefen: () => {} }}
                schleuse={{ modus: "direkt" }}
                modell={{ name: "Beispiel-Modell Groß", region: "eu" }}
              />
            )
          }
        >
          <p>Klar, ich ergänze Freitag um 10 Uhr als zweiten Vorschlag</p>
        </ChatBubble>
      </div>
    </ScrollBereich>
  );
}

/** AppShell mit Beispiel-Daten. */
export function ShellDemo({ eingebettet = false }: { eingebettet?: boolean }) {
  const [schleuse, setSchleuse] = useState(true);
  const [streamt, setStreamt] = useState(false);
  return (
    <AppShell
      eingebettet={eingebettet}
      navigation={navigation("u1")}
      texte={SHELL_TEXTE}
      flaeche={{ inhalt: <BelegeListe />, zahl: BELEGE.length }}
      kopf={
        <>
          <span className={styles.kopfTitel}>
            <AvatarLebendig farbe="violett" groesse={26} />
            <span className={styles.kopfText}>
              <strong>Antwort an Max Mustermann</strong>
              <small>Pai · bereit</small>
            </span>
          </span>
          <span className={styles.platz} />
          <span className={styles.nurBreit}>
            <StatusChip art="eu">{`Beispiel-Modell Groß · ${t("modelle.region.eu")}`}</StatusChip>
          </span>
          <Menue
            label="Weitere Aktionen"
            eintraege={[
              { id: "umbenennen", text: t("chat.umbenennen"), icon: "stift", onWaehlen: () => {} },
              {
                id: "loeschen",
                text: t("chat.loeschen"),
                icon: "papierkorb",
                gefahr: true,
                onWaehlen: () => {},
              },
            ]}
          />
        </>
      }
    >
      <Verlauf streamt={streamt} />
      <ChatEingabe
        onSenden={() => setStreamt(true)}
        laeuft={streamt}
        onStopp={() => setStreamt(false)}
        schleuseAn={schleuse}
        onSchleuse={setSchleuse}
        platzhalter="Schreib Pai eine Nachricht"
        notiz="Jede Antwort bekommt einen Beleg, den du prüfen kannst."
      />
    </AppShell>
  );
}
