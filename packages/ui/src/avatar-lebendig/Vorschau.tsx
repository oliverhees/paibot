/**
 * PaiBot – Vorschau des lebendigen Avatars: alle Formen und Zustände, dazu ein spielbarer Lauf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { AvatarShape, BotColor } from "@paibot/shared/objekte";
import { useEffect, useRef, useState } from "react";
import { AvatarLebendig, type AvatarLebendigSteuerung } from "./AvatarLebendig";
import {
  AVATAR_AUSDRUECKE,
  AVATAR_LEBENDIG_ZUSTAENDE,
  type AvatarAusdruck,
  type AvatarLebendigZustand,
  FORM_GESICHT,
} from "./daten";
import styles from "./Vorschau.module.css";

/** Alle Formen; `daten.test.ts` prüft, dass sie mit `AVATAR_SHAPES` übereinstimmen (ohne Zod im Browser). */
const FORMEN_LISTE = Object.keys(FORM_GESICHT) as AvatarShape[];

/** Namen nur für die Vorschau (die App nimmt ihre Texte aus `@paibot/shared`). */
const ZUSTAND_NAME: Record<AvatarLebendigZustand, string> = {
  ruhig: "ruhig",
  hoert_zu: "hört zu",
  denkt: "denkt",
  schreibt: "schreibt",
  wartet: "wartet auf dich",
  fertig: "fertig",
  fehler: "Fehler",
  angehalten: "angehalten",
};

const AUSDRUCK_NAME: Record<AvatarAusdruck, string> = {
  nicken: "Nicken",
  kopfschuetteln: "Kopfschütteln",
  anpacken: "Anpacken",
  einverstanden: "Einverstanden",
  zwinkern: "Zwinkern",
  staunen: "Staunen",
};

const FORM_FARBE: Record<AvatarShape, BotColor> = {
  blatt: "limette",
  bogen: "blau",
  kiesel: "gruen",
  raute: "violett",
  dee: "tuerkis",
  wabe: "gelb",
  bluete: "pink",
};

const ANTWORT =
  "Gestern ging es um drei Dinge: das Angebot für Frau Muster, die offene Rechnung und den Termin am Freitag.";

const warte = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function AvatarLebendigVorschau() {
  const [zustand, setZustand] = useState<AvatarLebendigZustand>("ruhig");
  const [text, setText] = useState("");
  const [antwort, setAntwort] = useState("");
  const steuer = useRef<AvatarLebendigSteuerung>(null);
  const eingabe = useRef<HTMLInputElement>(null);
  const lauf = useRef(0);

  useEffect(
    () => () => {
      lauf.current += 1;
    },
    [],
  );

  const spiele = async () => {
    const nr = ++lauf.current;
    const gilt = () => nr === lauf.current;
    setAntwort("");
    setText("");
    setZustand("ruhig");
    await warte(250);
    const frage = "Fass die Notizen von gestern zusammen.";
    for (let i = 1; i <= frage.length && gilt(); i++) {
      setText(frage.slice(0, i));
      setZustand("hoert_zu");
      steuer.current?.blickNeu();
      await warte(38);
    }
    if (!gilt()) return;
    await warte(250);
    setText("");
    setZustand("ruhig");
    steuer.current?.ausdruck("nicken");
    await warte(650);
    if (!gilt()) return;
    setZustand("denkt");
    await warte(1400);
    if (!gilt()) return;
    setZustand("schreibt");
    const teile = ANTWORT.match(/\S+\s*/g) ?? [];
    for (let i = 0; i < teile.length && gilt(); ) {
      const n = 1 + (i % 3);
      const stueck = teile.slice(i, i + n).join("");
      i += n;
      setAntwort((a) => a + stueck);
      steuer.current?.textStueck(stueck.length);
      await warte(110);
    }
    if (!gilt()) return;
    setZustand("fertig");
    await warte(1800);
    if (gilt()) setZustand("ruhig");
  };

  return (
    <div className={styles.vorschau} data-vorschau="avatar-lebendig">
      <section>
        <h3 className={styles.titel}>Live: folgt dem Zeiger, spielt einen Lauf</h3>
        <div className={styles.buehne}>
          <div className={styles.figuren}>
            <span data-live="128">
              <AvatarLebendig
                ref={steuer}
                farbe="limette"
                groesse={128}
                zustand={zustand}
                folgtZeiger
                blickBezug={() => {
                  const el = eingabe.current;
                  if (!el) return null;
                  const r = el.getBoundingClientRect();
                  return {
                    x: r.left + Math.min(r.width - 14, 10 + text.length * 7),
                    y: r.top + r.height / 2,
                  };
                }}
                titel={`Pai ist ${ZUSTAND_NAME[zustand]}`}
              />
            </span>
            <span data-live="48">
              <AvatarLebendig farbe="limette" groesse={48} zustand={zustand} />
            </span>
            <span className={styles.chip}>
              <span data-live="24">
                <AvatarLebendig farbe="limette" groesse={24} zustand={zustand} />
              </span>
              <span data-wort="">{ZUSTAND_NAME[zustand]}</span>
            </span>
          </div>
          <div>
            <div className={styles.knoepfe} role="toolbar" aria-label="Zustand wählen">
              {AVATAR_LEBENDIG_ZUSTAENDE.map((z) => (
                <button
                  key={z}
                  type="button"
                  className={styles.knopf}
                  data-zustand-knopf={z}
                  aria-pressed={zustand === z}
                  onClick={() => {
                    lauf.current += 1;
                    setZustand(z);
                  }}
                >
                  {ZUSTAND_NAME[z]}
                </button>
              ))}
            </div>
            <div className={styles.knoepfe} role="toolbar" aria-label="Ausdruck auslösen">
              {AVATAR_AUSDRUECKE.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={styles.knopf}
                  data-ausdruck-knopf={a}
                  onClick={() => steuer.current?.ausdruck(a)}
                >
                  {AUSDRUCK_NAME[a]}
                </button>
              ))}
              <button
                type="button"
                className={styles.knopf}
                data-lauf=""
                onClick={() => void spiele()}
              >
                Lauf vorspielen
              </button>
            </div>
            <input
              ref={eingabe}
              className={styles.eingabe}
              value={text}
              placeholder="Nachricht an Pai …"
              aria-label="Eingabefeld (Vorschau)"
              onChange={(e) => {
                lauf.current += 1;
                setText(e.target.value);
                setZustand(e.target.value ? "hoert_zu" : "ruhig");
                steuer.current?.blickNeu();
              }}
            />
            <p className={styles.antwort} data-antwort="">
              {antwort}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3 className={styles.titel}>Alle Formen und Zustände (Standbild, 48 px)</h3>
        <div className={styles.raster} data-raster="formen">
          <span />
          {AVATAR_LEBENDIG_ZUSTAENDE.map((z) => (
            <span key={z} className={styles.kopfzelle}>
              {ZUSTAND_NAME[z]}
            </span>
          ))}
          {FORMEN_LISTE.map((form) => (
            <Zeile key={form} form={form} />
          ))}
        </div>
      </section>

      <section>
        <h3 className={styles.titel}>Größen (Blatt): 128, 48 und 24 px mit Wort</h3>
        <div className={styles.raster} data-raster="groessen">
          <span />
          {AVATAR_LEBENDIG_ZUSTAENDE.map((z) => (
            <span key={z} className={styles.kopfzelle}>
              {ZUSTAND_NAME[z]}
            </span>
          ))}
          {[128, 48, 24].map((px) => (
            <GroessenZeile key={px} px={px} />
          ))}
          <span className={styles.zeilenkopf}>mit Wort</span>
          {AVATAR_LEBENDIG_ZUSTAENDE.map((z) => (
            <span key={z} className={styles.chip}>
              <AvatarLebendig farbe="limette" groesse={24} zustand={z} still />
              <span>{ZUSTAND_NAME[z]}</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function Zeile({ form }: { form: AvatarShape }) {
  return (
    <>
      <span className={styles.zeilenkopf}>{form}</span>
      {AVATAR_LEBENDIG_ZUSTAENDE.map((z) => (
        <span key={z} data-zelle={`${form}-${z}`}>
          <AvatarLebendig farbe={FORM_FARBE[form]} form={form} groesse={48} zustand={z} still />
        </span>
      ))}
    </>
  );
}

function GroessenZeile({ px }: { px: number }) {
  return (
    <>
      <span className={styles.zeilenkopf}>{px} px</span>
      {AVATAR_LEBENDIG_ZUSTAENDE.map((z) => (
        <span key={z} data-zelle={`px${px}-${z}`}>
          <AvatarLebendig farbe="limette" groesse={px} zustand={z} still />
        </span>
      ))}
    </>
  );
}
