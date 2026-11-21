/**
 * PaiBot – Vorschau des Startbereichs: Fassung, Thema, Not-Aus und Tageszeit umschaltbar.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import {
  AvatarLebendig,
  Button,
  ChatEingabe,
  Startbereich,
  type StartFassung,
  StartStilleSitz,
  tageszeitFuerStunde,
} from "@paibot/ui";
import { useEffect, useRef, useState } from "react";
import styles from "./vorschau.module.css";

const FASSUNGEN: { id: StartFassung; text: string }[] = [
  { id: "begruessung", text: "Begrüßung" },
  { id: "startbrett", text: "Startbrett" },
  { id: "stille", text: "Stille" },
];

const UNTERHALTUNGEN = [
  { id: "u1", titel: "Antwort an Max Mustermann", zeit: "heute" },
  { id: "u2", titel: "Wochenplan sortieren", zeit: "gestern" },
  { id: "u3", titel: "Ideen für den Newsletter", zeit: "16.11." },
];

/** Alle Fassungen nebeneinander ausprobieren; nur erfundene Beispiel-Daten, keine Abrufe. */
export function StartbereichVorschau() {
  const [fassung, setFassung] = useState<StartFassung>("begruessung");
  const [notAus, setNotAus] = useState(false);
  const [stunde, setStunde] = useState(19);
  const [mitBelegen, setMitBelegen] = useState(true);
  const [dunkel, setDunkel] = useState<"dark" | "light">("dark");
  const [wert, setWert] = useState("");
  const [feld, setFeld] = useState<HTMLTextAreaElement | null>(null);
  const unten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dunkel);
  }, [dunkel]);
  useEffect(() => {
    setFeld(unten.current?.querySelector("textarea") ?? null);
  }, []);

  const anfang = (text: string) => {
    setWert(text);
    unten.current?.querySelector("textarea")?.focus();
  };

  return (
    <div className={styles.seite}>
      <header className={styles.leiste}>
        <strong>Startbereich</strong>
        {FASSUNGEN.map((f) => (
          <Button
            key={f.id}
            art={fassung === f.id ? "leise" : "zweit"}
            aria-pressed={fassung === f.id}
            onClick={() => setFassung(f.id)}
          >
            {f.text}
          </Button>
        ))}
        <Button
          art="zweit"
          aria-pressed={dunkel === "light"}
          onClick={() => setDunkel(dunkel === "dark" ? "light" : "dark")}
        >
          {dunkel === "dark" ? "Hell" : "Dunkel"}
        </Button>
        <Button art="zweit" aria-pressed={notAus} onClick={() => setNotAus(!notAus)}>
          Not-Aus
        </Button>
        <Button art="zweit" aria-pressed={mitBelegen} onClick={() => setMitBelegen(!mitBelegen)}>
          Zahl der Belege
        </Button>
        <label className={styles.stunde}>
          Stunde
          <input
            type="number"
            min={0}
            max={23}
            value={stunde}
            onChange={(e) => setStunde(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
          />
        </label>
      </header>
      <div className={styles.verlauf}>
        <div className={styles.spalte}>
          <Startbereich
            fassung={fassung}
            avatar={<AvatarLebendig farbe="limette" groesse={112} still />}
            avatarKlein={<AvatarLebendig farbe="limette" groesse={18} still />}
            botName="Pai"
            modell="Beispiel-Modell Allrounder"
            herkunft="local"
            schleuseAn={false}
            notAus={notAus}
            {...(mitBelegen ? { belege: 23 } : {})}
            unterhaltungen={UNTERHALTUNGEN}
            tageszeit={tageszeitFuerStunde(stunde)}
            onAnfang={anfang}
          />
        </div>
      </div>
      <div className={styles.unten} ref={unten}>
        {fassung === "stille" && (
          <StartStilleSitz
            avatar={<AvatarLebendig farbe="limette" groesse={64} still />}
            notAus={notAus}
            onAnfang={anfang}
            eingabe={feld}
            leer={wert.trim().length === 0}
          />
        )}
        <ChatEingabe
          wert={wert}
          onWert={setWert}
          onSenden={() => setWert("")}
          schleuseAn={false}
          onSchleuse={() => {}}
          deaktiviert={notAus}
        />
      </div>
    </div>
  );
}
