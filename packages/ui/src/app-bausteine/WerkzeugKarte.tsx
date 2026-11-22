/**
 * PaiBot – Karte eines Werkzeugs: Einstufung „liest“ oder „schreibt“, gesperrt bei Änderung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "../basis/Button";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import { StatusChip } from "../zustaende/StatusChip";
import { FremderText } from "./FremderText";
import { bereinigeFremdText } from "./fremdText";
import styles from "./Werkzeug.module.css";
import {
  type AenderungFeld,
  kurzeFassung,
  type SchemaText,
  type SchemaTextArt,
  type ServerHinweis,
  type WerkzeugAenderung,
  type WerkzeugArt,
  type WerkzeugStatus,
  wirdAngeboten,
  wirksameArt,
} from "./werkzeug";

export interface WerkzeugKarteProps {
  /** Name des Werkzeugs laut App: fremder Text. */
  name: string;
  /** Titel laut App (fremder Text), wenn die App einen angibt. */
  titel?: string;
  /** Beschreibung laut App: fremder Text, so gezeigt, wie sie an das Modell ginge. */
  beschreibung?: string;
  status: WerkzeugStatus;
  /** Einstufung des Besitzers. Gilt nur bei `status="bestaetigt"`; sonst zählt „schreibt“. */
  art?: WerkzeugArt;
  /** Bei `status="geaendert"`: wie der Besitzer die frühere Fassung eingestuft hatte. */
  bisher?: WerkzeugArt;
  /** Kurze Kennung der Fassung, auf die sich die Bestätigung bezieht. */
  fassung?: string;
  /** Was die App über sich behauptet. Nur Anzeige. */
  serverHinweis?: ServerHinweis;
  /** `false`: PaiBot kann die Eingaben nicht prüfen; „liest“ ist dann nicht wählbar. */
  schemaPruefbar?: boolean;
  /** Bei `status="geaendert"`: was sich gegenüber der bestätigten Fassung geändert hat. */
  aenderungen?: readonly WerkzeugAenderung[];
  /**
   * Die zuletzt bestätigte Fassung liegt außerhalb der geladenen Fassungen: Es gibt keinen
   * vollständigen Vergleich. Die Karte sagt das; sie behauptet nie, es sei nichts geändert.
   */
  vergleichUnvollstaendig?: boolean;
  /**
   * Alles Lesbare aus dem Schema, das mit dem Werkzeug ans Modell ginge (Feldnamen,
   * Feldbeschreibungen, Auswahlwerte, Vorgaben, Beispiele). Wird beim Bestätigen mit gezeigt.
   */
  schemaTexte?: readonly SchemaText[];
  /**
   * Adresse eines Bildes oder Symbols, die die App liefert. Wird nie geladen oder angezeigt;
   * die Karte nutzt immer ihr eigenes Symbol. Die Eigenschaft gibt es nur, damit der Aufrufer
   * Server-Daten ohne Vorarbeit durchreichen kann.
   */
  symbolAdresse?: string;
  /** Wird gerade gespeichert. */
  speichert?: boolean;
  /**
   * Der Besitzer hat eine Einstufung bestätigt. `fassung` ist der volle Abdruck genau der Fassung,
   * die er gesehen hat; der Aufrufer schickt ihn mit, damit nur diese Fassung bestätigt wird.
   */
  onEinstufen?: (art: WerkzeugArt, fassung: string | undefined) => void;
  /** Überschriften-Ebene des Namens (Standard 4). */
  ebene?: 3 | 4 | 5;
  className?: string;
}

const FELD_TEXT: Record<AenderungFeld, () => string> = {
  name: () => t("apps.werkzeug.feld.name"),
  titel: () => t("apps.werkzeug.feld.titel"),
  beschreibung: () => t("apps.werkzeug.feld.beschreibung"),
  eingabe: () => t("apps.werkzeug.feld.eingabe"),
  ausgabe: () => t("apps.werkzeug.feld.ausgabe"),
  hinweise: () => t("apps.werkzeug.feld.hinweise"),
};

const SCHEMA_ART: Record<SchemaTextArt, () => string> = {
  feldname: () => t("apps.schema.art.feldname"),
  feldbeschreibung: () => t("apps.schema.art.feldbeschreibung"),
  enum: () => t("apps.schema.art.enum"),
  default: () => t("apps.schema.art.default"),
  beispiel: () => t("apps.schema.art.beispiel"),
  typ: () => t("apps.schema.art.typ"),
  pflicht: () => t("apps.schema.art.pflicht"),
  grenze: () => t("apps.schema.art.grenze"),
  zusatz: () => t("apps.schema.art.zusatz"),
  ausgabe: () => t("apps.schema.art.ausgabe"),
};

/**
 * Höchstlänge für Texte, die ans Modell gehen (Beschreibung, Schema-Texte): so hoch, dass nichts
 * gekürzt wird. Die Datenbank lässt höchstens 64 KB je Schema zu. Der Besitzer bestätigt, was das
 * Modell bekommt, also sieht er es ganz.
 */
const GRENZE_VOLL = 70_000;

/** So viele Schema-Texte stehen sofort da; der Rest klappt auf. */
const SCHEMA_SOFORT = 4;

function artText(art: WerkzeugArt): string {
  return t(`apps.werkzeug.art.${art}`);
}

/**
 * Ein Werkzeug einer App. Ohne Bestätigung steht es auf „schreibt“ und wird keinem Bot angeboten.
 * „Liest“ wählt nur der Besitzer, für genau diese Fassung. Ändert die App das Werkzeug, ist es
 * gesperrt und zeigt, was sich geändert hat; erst „Neu bestätigen“ hebt das auf.
 */
export function WerkzeugKarte({
  name,
  titel,
  beschreibung,
  status,
  art,
  bisher,
  fassung,
  serverHinweis,
  schemaPruefbar = true,
  aenderungen = [],
  vergleichUnvollstaendig = false,
  schemaTexte = [],
  speichert = false,
  onEinstufen,
  ebene = 4,
  className,
}: WerkzeugKarteProps) {
  const Ueberschrift = `h${ebene}` as "h3" | "h4" | "h5";
  const wirksam = wirksameArt(status, art);
  const angeboten = wirdAngeboten(status, art);
  const [offen, setOffen] = useState(false);
  // Die Fassung, die der Besitzer beim Öffnen des Felds sah: Nur sie wird bestätigt, nie eine, die
  // erst danach in die Eigenschaften kam.
  const [gesehen, setGesehen] = useState<string | undefined>();
  const [wahl, setWahl] = useState<WerkzeugArt>("schreibt");
  const [alleSchema, setAlleSchema] = useState(false);
  const gruppe = useId();
  const warnId = useId();
  const schemaId = useId();
  const karte = useRef<HTMLElement>(null);
  const panel = useRef<HTMLFormElement>(null);
  const warEinmalOffen = useRef(false);
  const sauberName = bereinigeFremdText(name, "name").text || t("apps.fremd.leer");
  const sauberTitel = bereinigeFremdText(titel, "titel").text;

  // Beim Öffnen steht „schreibt“ vor; eine bestehende Einstufung bleibt Ausgangspunkt.
  const oeffnen = () => {
    setWahl(status === "bestaetigt" && art !== undefined ? art : "schreibt");
    setGesehen(fassung);
    setOffen(true);
  };

  // Kommt eine neue Fassung, während das Feld offen ist, schließt es sich: Der Besitzer sieht erst
  // die neue Fassung, dann stuft er sie ein.
  useEffect(() => {
    if (offen && gesehen !== fassung) setOffen(false);
  }, [offen, gesehen, fassung]);

  useEffect(() => {
    if (offen) {
      warEinmalOffen.current = true;
      panel.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    } else if (warEinmalOffen.current) {
      karte.current?.querySelector<HTMLButtonElement>("[data-ausloeser]")?.focus();
    }
  }, [offen]);

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (wahl === "liest" && !schemaPruefbar) return;
    onEinstufen?.(wahl, gesehen);
    setOffen(false);
  };

  const aktion =
    status === "neu"
      ? t("apps.werkzeug.einstufen")
      : status === "geaendert"
        ? t("apps.werkzeug.neu_bestaetigen")
        : status === "bestaetigt"
          ? t("apps.werkzeug.aendern")
          : undefined;

  const optionen: { wert: WerkzeugArt; sperre?: boolean }[] = [
    { wert: "schreibt" },
    { wert: "liest", sperre: !schemaPruefbar },
    { wert: "gesperrt" },
  ];

  return (
    <article
      ref={karte}
      className={klassen(styles.karte, className)}
      data-status={status}
      data-fassung={fassung}
      data-wirksam={wirksam}
      data-angeboten={angeboten ? "ja" : "nein"}
      aria-label={sauberName}
    >
      <div className={styles.kopf}>
        <div className={styles.namen}>
          <Ueberschrift className={styles.name}>
            <FremderText text={name} art="name" />
          </Ueberschrift>
          {sauberTitel !== "" && (
            <span className={styles.titel}>
              <FremderText text={titel} art="titel" />
            </span>
          )}
        </div>
        <div className={styles.chips}>
          {status === "geaendert" ? (
            <StatusChip art="warn">{t("apps.werkzeug.status.geaendert")}</StatusChip>
          ) : status === "entfernt" ? (
            <StatusChip art="neutral">{t("apps.werkzeug.status.entfernt")}</StatusChip>
          ) : (
            <>
              <StatusChip art={wirksam === "liest" ? "ok" : "neutral"}>
                {artText(wirksam)}
              </StatusChip>
              {status === "neu" && (
                <StatusChip art="warn">{t("apps.werkzeug.status.neu")}</StatusChip>
              )}
            </>
          )}
        </div>
      </div>

      {beschreibung !== undefined && beschreibung !== "" && (
        <FremderText
          text={beschreibung}
          art="beschreibung"
          darstellung="kasten"
          grenze={GRENZE_VOLL}
        />
      )}

      {serverHinweis && (
        <p className={styles.hinweis} data-art={serverHinweis}>
          <Icon name={serverHinweis === "veraendert" ? "warnung" : "info"} groesse={14} />
          <span>
            {serverHinweis === "veraendert"
              ? t("apps.werkzeug.hinweis.veraendert")
              : t("apps.werkzeug.hinweis.nur_lesend")}
          </span>
        </p>
      )}

      {status === "geaendert" && (
        <p className={styles.sperre}>
          <Icon name="schloss" groesse={16} />
          <span>{t("apps.werkzeug.gesperrt.grund")}</span>
        </p>
      )}
      {(status === "geaendert" || status === "neu") && vergleichUnvollstaendig && (
        <p className={styles.hinweis} data-vergleich="unvollstaendig">
          <Icon name="info" groesse={14} />
          <span>{t("apps.werkzeug.aenderung.unvollstaendig")}</span>
        </p>
      )}
      {(status === "geaendert" || status === "neu") && aenderungen.length > 0 && (
        <section className={styles.aenderung} aria-label={t("apps.werkzeug.aenderung.titel")}>
          <h5 className={styles.aenderungTitel}>{t("apps.werkzeug.aenderung.titel")}</h5>
          <ul className={styles.aenderungListe}>
            {aenderungen.map((a) => (
              <li key={a.feld} className={styles.feld}>
                <p className={styles.feldName}>{FELD_TEXT[a.feld]()}</p>
                <div className={styles.paar}>
                  <div className={styles.seite}>
                    <span className={styles.seiteName}>{t("apps.werkzeug.aenderung.vorher")}</span>
                    <FremderText text={a.vorher} art="wert" darstellung="block" />
                  </div>
                  <div className={styles.seite}>
                    <span className={styles.seiteName}>{t("apps.werkzeug.aenderung.nachher")}</span>
                    <FremderText text={a.nachher} art="wert" darstellung="block" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!schemaPruefbar && status !== "entfernt" && (
        <p className={styles.hinweis} id={schemaId}>
          <Icon name="info" groesse={14} />
          <span>{t("apps.werkzeug.schema")}</span>
        </p>
      )}

      {schemaTexte.length > 0 && status !== "entfernt" && (
        <section className={styles.schema} aria-label={t("apps.schema.titel")} data-schema="">
          <h5 className={styles.aenderungTitel}>{t("apps.schema.titel")}</h5>
          <p className={styles.leise}>{t("apps.schema.hinweis")}</p>
          <ul className={styles.aenderungListe}>
            {(alleSchema ? schemaTexte : schemaTexte.slice(0, SCHEMA_SOFORT)).map((e, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: feste Liste ohne eigene Kennung
              <li key={i} className={styles.feld}>
                <p className={styles.feldName}>
                  {SCHEMA_ART[e.art]()} ·{" "}
                  <FremderText text={e.pfad} art="name" grenze={GRENZE_VOLL} />
                </p>
                <FremderText text={e.text} art="wert" darstellung="block" grenze={GRENZE_VOLL} />
              </li>
            ))}
          </ul>
          {schemaTexte.length > SCHEMA_SOFORT && (
            <Button
              art="leise"
              aria-expanded={alleSchema}
              onClick={() => setAlleSchema(!alleSchema)}
            >
              {alleSchema
                ? t("apps.schema.weniger")
                : t("apps.schema.alle", { anzahl: schemaTexte.length })}
            </Button>
          )}
        </section>
      )}

      <div className={styles.fuss}>
        <p className={styles.meta}>
          {status === "bestaetigt" && (
            <span>
              {angeboten ? t("apps.werkzeug.angeboten") : t("apps.werkzeug.nicht_angeboten")}
            </span>
          )}
          {status === "neu" && (
            <span>
              {t("apps.werkzeug.nicht_angeboten")} {t("apps.werkzeug.standard")}.
            </span>
          )}
          {(status === "geaendert" || status === "neu") && bisher !== undefined && (
            <span>{t("apps.werkzeug.bisher", { art: artText(bisher) })}</span>
          )}
          {fassung && (
            <span>
              {t("apps.werkzeug.fassung")}{" "}
              <code className={styles.fassung}>{kurzeFassung(fassung)}</code>
            </span>
          )}
        </p>
        {aktion && onEinstufen && !offen && (
          <Button
            art={status === "geaendert" ? "primaer" : "zweit"}
            onClick={oeffnen}
            aria-label={`${aktion}: ${sauberName}`}
            aria-expanded={false}
            data-ausloeser=""
          >
            {aktion}
          </Button>
        )}
      </div>

      {offen && (
        <form
          className={styles.einstufung}
          ref={panel}
          onSubmit={absenden}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !speichert) {
              e.stopPropagation();
              setOffen(false);
            }
          }}
        >
          <fieldset className={styles.frage}>
            <legend>{t("apps.einstufung.frage")}</legend>
            <div className={styles.optionen}>
              {optionen.map((o) => (
                <label key={o.wert} className={styles.option}>
                  <input
                    type="radio"
                    name={gruppe}
                    value={o.wert}
                    checked={wahl === o.wert}
                    disabled={o.sperre || speichert}
                    aria-describedby={o.sperre ? schemaId : undefined}
                    onChange={() => setWahl(o.wert)}
                  />
                  <span className={styles.optionTitel}>{t(`apps.einstufung.${o.wert}`)}</span>
                  <span className={styles.optionText}>{t(`apps.einstufung.${o.wert}.text`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div aria-live="polite" id={warnId}>
            {wahl === "liest" && (
              <p className={styles.warnung}>
                <Icon name="warnung" groesse={14} />
                <span>{t("apps.einstufung.liest.warnung")}</span>
              </p>
            )}
          </div>
          <div className={styles.knoepfe}>
            <Button type="submit" art="primaer" laedt={speichert}>
              {t("apps.einstufung.bestaetigen")}
            </Button>
            <Button art="leise" onClick={() => setOffen(false)} disabled={speichert}>
              {t("apps.einstufung.abbrechen")}
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}
