/**
 * PaiBot – geführte Einrichtung im Browser: Code, Passwort, Auswahl des Anbieters, Schlüssel
 * (bei EUrouter mit Routing-Regeln), Modell bzw. Regel, Datenschleuse, Name des Bots, fertig.
 * Die Zählung hat immer sieben Schritte; übersprungene Schritte zählen mit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import type { ApiErrorDetail } from "@paibot/shared/api";
import { LIMITS } from "@paibot/shared/konstanten";
import { t } from "@paibot/shared/texte";
import {
  Avatar,
  Button,
  Icon,
  type IconName,
  Logo,
  Switch,
  TestErgebnis,
  TextField,
  Wortmarke,
} from "@paibot/ui";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "../../lib/api/client";
import { einrichtungSchluesselText } from "../../lib/modelle/ansicht";
import type { AnbieterWahl } from "../../lib/modelle/konto-links";
import { AnbieterAuswahl, KontoLink } from "../AnbieterAuswahl";
import styles from "./einrichtung.module.css";

/** Ergebnis der Prüfung einer Routing-Regel, wie der Server es meldet. */
interface RegelErgebnis {
  name: string;
  ok: boolean;
  herkunft?: string;
  text?: string;
  ausweg?: string;
}

export interface EinrichtungProps {
  anbieter: string;
  /** Namen der wählbaren Anbieter; `eigener` nur, wenn der Server einen vorsieht. */
  wahl: { eurouter: string; mistral: string; eigener?: string };
  passwortMin: number;
  botVorschlag: string;
  schleuseInstalliert: boolean;
  ohneProxy: boolean;
}

type Schritt = "code" | "passwort" | "anbieter" | "schluessel" | "modell" | "schleuse" | "bot";

/** Alle Schritte, immer in dieser Reihenfolge und Anzahl (übersprungene zählen mit). */
const SCHRITTE: readonly Schritt[] = [
  "code",
  "passwort",
  "anbieter",
  "schluessel",
  "modell",
  "schleuse",
  "bot",
];

interface Modell {
  slug: string;
  displayName: string;
}

interface Abschluss {
  anbieter: boolean;
  anbieterName?: string;
  modell?: string;
  schleuse: "on" | "off";
  botName: string;
}

type Fehler = Partial<Record<Schritt, string>>;

const FELD_ZU_SCHRITT: Record<string, Schritt> = {
  setupCode: "code",
  password: "passwort",
  passwordRepeat: "passwort",
  apiKey: "schluessel",
  templateKey: "anbieter",
  ruleNames: "schluessel",
  ruleName: "modell",
  modelSlug: "modell",
  schleuseModeDefault: "schleuse",
  botName: "bot",
  timezone: "bot",
};

/** Schritt, zu dem ein Fehler des Servers gehört, und der Text dafür. */
function fehlerZuordnen(fehler: ApiErrorDetail): { schritt: Schritt; text: string } {
  const feld = fehler.felder?.[0]?.feld;
  const schritt = (feld && FELD_ZU_SCHRITT[feld]) || "bot";
  return { schritt, text: fehler.ausweg ? `${fehler.text} ${fehler.ausweg}` : fehler.text };
}

/**
 * Vorprüfung im Browser (ohne Zod, damit die Seite unter der strengen Content-Security-Policy keine
 * Auswertung von Code braucht): 12 Zeichen Crockford-Base32, Bindestriche und Kleinbuchstaben
 * erlaubt. Ob der Code stimmt, entscheidet nur der Server.
 */
function codeHatForm(eingabe: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(eingabe.replace(/[\s-]/g, "").toUpperCase());
}

function browserZeitzone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

const VERSPRECHEN: { icon: IconName; titel: string; text: string }[] = [
  {
    icon: "server",
    titel: t("einrichtung.versprechen.server.titel"),
    text: t("einrichtung.versprechen.server.text"),
  },
  {
    icon: "schleuse",
    titel: t("einrichtung.versprechen.schleuse.titel"),
    text: t("einrichtung.versprechen.schleuse.text"),
  },
  {
    icon: "beleg",
    titel: t("einrichtung.versprechen.beleg.titel"),
    text: t("einrichtung.versprechen.beleg.text"),
  },
];

export function Einrichtung({
  anbieter: standardAnbieter,
  wahl: wahlNamen,
  passwortMin,
  botVorschlag,
  schleuseInstalliert,
  ohneProxy,
}: EinrichtungProps) {
  const [schritt, setSchritt] = useState<Schritt>("code");
  const [wahl, setWahl] = useState<AnbieterWahl | undefined>();
  const [regeln, setRegeln] = useState<string[]>([""]);
  const [regelErgebnisse, setRegelErgebnisse] = useState<RegelErgebnis[] | undefined>();
  const [regel, setRegel] = useState<string | undefined>();
  const [testFehler, setTestFehler] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [passwort, setPasswort] = useState("");
  const [passwort2, setPasswort2] = useState("");
  const [schluessel, setSchluessel] = useState("");
  const [modelle, setModelle] = useState<Modell[] | undefined>();
  const [testLaeuft, setTestLaeuft] = useState(false);
  const [testOk, setTestOk] = useState<string | undefined>();
  const [modell, setModell] = useState<string | undefined>();
  const [schleuse, setSchleuse] = useState(false);
  const [botName, setBotName] = useState(botVorschlag);
  const [fehler, setFehler] = useState<Fehler>({});
  const [sendet, setSendet] = useState(false);
  const [fertig, setFertig] = useState<Abschluss | undefined>();
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  const erster = useRef(true);
  const modellGruppe = useId();

  const mitRegeln = wahl === "eurouter";
  /** Eigener Anbieter ohne Vorgabe des Servers: Schlüssel und Modell erst nach der Einrichtung. */
  const eigenSpaeter = wahl === "eigener" && wahlNamen.eigener === undefined;
  const anbieter =
    wahl === undefined
      ? standardAnbieter
      : wahl === "eigener"
        ? (wahlNamen.eigener ?? t("anbieterwahl.eigen.titel"))
        : wahlNamen[wahl];
  const geprueft = mitRegeln ? regelErgebnisse !== undefined : modelle !== undefined;
  const okRegeln = (regelErgebnisse ?? []).filter((r) => r.ok).map((r) => r.name);
  const mitSchluessel = !eigenSpaeter && schluessel.trim() !== "" && geprueft;
  const schritte = SCHRITTE;
  const nummer = schritte.indexOf(schritt) + 1;

  // Nach jedem Schrittwechsel liegt der Fokus auf der Überschrift (nicht beim ersten Laden).
  // biome-ignore lint/correctness/useExhaustiveDependencies: läuft bewusst bei jedem Wechsel
  useEffect(() => {
    if (erster.current) {
      erster.current = false;
      return;
    }
    ueberschrift.current?.focus();
  }, [schritt, fertig]);

  const gehe = (ziel: Schritt) => setSchritt(ziel);
  /** Ohne Schlüssel gibt es nichts zu wählen: der Schritt „Modell“ wird übersprungen. */
  const zaehlt = (s: Schritt) => s !== "modell" || mitSchluessel;
  const naechster = () => {
    const i = schritte.indexOf(schritt);
    const ziel = schritte.slice(i + 1).find(zaehlt);
    if (ziel) gehe(ziel);
  };
  const voriger = () => {
    const i = schritte.indexOf(schritt);
    const ziel = schritte.slice(0, i).reverse().find(zaehlt);
    if (ziel) gehe(ziel);
  };
  const fehlerSetzen = (s: Schritt, text: string | undefined) =>
    setFehler((alt) => ({ ...alt, [s]: text }));

  function pruefeSchritt(): boolean {
    switch (schritt) {
      case "code": {
        const ok = codeHatForm(code);
        fehlerSetzen("code", ok ? undefined : t("einrichtung.code.format"));
        return ok;
      }
      case "passwort": {
        if (passwort.length < passwortMin) {
          fehlerSetzen("passwort", t("einrichtung.passwort.regel", { min: passwortMin }));
          return false;
        }
        if (passwort.length > LIMITS.passwordMaxChars) {
          fehlerSetzen(
            "passwort",
            t("einrichtung.passwort.zu_lang", { max: LIMITS.passwordMaxChars }),
          );
          return false;
        }
        if (passwort !== passwort2) {
          fehlerSetzen("passwort", t("einrichtung.passwort.ungleich"));
          return false;
        }
        fehlerSetzen("passwort", undefined);
        return true;
      }
      case "anbieter": {
        const ok = wahl !== undefined;
        fehlerSetzen("anbieter", ok ? undefined : t("anbieterwahl.waehlen"));
        return ok;
      }
      case "schluessel": {
        if (eigenSpaeter) return true;
        if (schluessel.trim() === "") {
          fehlerSetzen("schluessel", t("einrichtung.schluessel.leer"));
          return false;
        }
        if (!geprueft) {
          fehlerSetzen("schluessel", t("einrichtung.schluessel.erst_testen"));
          return false;
        }
        if (mitRegeln && okRegeln.length === 0) {
          fehlerSetzen("schluessel", t("anbieterwahl.regeln.keine_ok"));
          return false;
        }
        return true;
      }
      case "modell": {
        if (mitRegeln) {
          const ok = regel !== undefined && okRegeln.includes(regel);
          fehlerSetzen("modell", ok ? undefined : t("anbieterwahl.regel.waehlen"));
          return ok;
        }
        const ok = modelle?.length === 0 || modell !== undefined;
        fehlerSetzen("modell", ok ? undefined : t("einrichtung.modell.waehlen"));
        return ok;
      }
      case "bot": {
        const ok = botName.trim() !== "";
        fehlerSetzen("bot", ok ? undefined : t("fehler.eingabe_ungueltig"));
        return ok;
      }
      default:
        return true;
    }
  }

  /** Eingetragene Regel-Namen ohne leere Felder und ohne Doppel. */
  const regelNamen = () => [...new Set(regeln.map((r) => r.trim()).filter((r) => r !== ""))];

  function testZuruecksetzen() {
    setModelle(undefined);
    setModell(undefined);
    setRegelErgebnisse(undefined);
    setRegel(undefined);
    setTestOk(undefined);
    setTestFehler(undefined);
  }

  async function verbindungTesten(): Promise<boolean> {
    if (schluessel.trim() === "") {
      fehlerSetzen("schluessel", t("einrichtung.schluessel.leer"));
      return false;
    }
    const namen = regelNamen();
    if (mitRegeln && namen.length === 0) {
      fehlerSetzen("schluessel", t("anbieterwahl.regeln.leer", { anbieter }));
      return false;
    }
    setTestLaeuft(true);
    testZuruecksetzen();
    fehlerSetzen("schluessel", undefined);
    const antwort = await apiFetch<{ modelle: Modell[]; regeln?: RegelErgebnis[] }>(
      "POST",
      "/api/einrichtung/verbindungstest",
      {
        setupCode: code,
        apiKey: schluessel,
        ...(wahl === undefined ? {} : { templateKey: wahl }),
        ...(mitRegeln ? { ruleNames: namen } : {}),
      },
    );
    setTestLaeuft(false);
    if (antwort.ok) {
      if (mitRegeln) {
        const ergebnisse = antwort.daten.regeln ?? [];
        setRegelErgebnisse(ergebnisse);
        const ok = ergebnisse.filter((r) => r.ok);
        setRegel(ok.length === 1 ? ok[0]?.name : undefined);
        if (ok.length > 0) {
          setTestOk(t("anbieterwahl.regeln.ok", { anzahl: ok.length, von: ergebnisse.length }));
        } else {
          setTestFehler(t("anbieterwahl.regeln.keine_ok"));
        }
        return ok.length > 0;
      }
      setModelle(antwort.daten.modelle);
      setTestOk(t("einrichtung.schluessel.ok", { anzahl: antwort.daten.modelle.length }));
      return true;
    }
    const { schritt: ziel, text } = fehlerZuordnen(antwort.fehler);
    if (ziel === "code") {
      fehlerSetzen("code", text);
      gehe("code");
      return false;
    }
    setTestFehler(text);
    if (antwort.fehler.felder?.some((f) => f.feld === "apiKey")) fehlerSetzen("schluessel", text);
    return false;
  }

  function spaeterEintragen() {
    setSchluessel("");
    testZuruecksetzen();
    fehlerSetzen("schluessel", undefined);
    gehe("schleuse");
  }

  async function abschliessen() {
    setSendet(true);
    const zeitzone = browserZeitzone();
    const antwort = await apiFetch<Abschluss>("POST", "/api/einrichtung", {
      setupCode: code,
      password: passwort,
      passwordRepeat: passwort2,
      ...(wahl === undefined || eigenSpaeter ? {} : { templateKey: wahl }),
      ...(mitSchluessel ? { apiKey: schluessel } : {}),
      ...(mitSchluessel && !mitRegeln && modell !== undefined ? { modelSlug: modell } : {}),
      ...(mitSchluessel && mitRegeln ? { ruleNames: okRegeln } : {}),
      ...(mitSchluessel && mitRegeln && regel !== undefined ? { ruleName: regel } : {}),
      schleuseModeDefault: schleuse ? "on" : "off",
      botName: botName.trim(),
      ...(zeitzone ? { timezone: zeitzone } : {}),
    });
    setSendet(false);
    if (antwort.ok) {
      setFertig(antwort.daten);
      return;
    }
    const { schritt: ziel, text } = fehlerZuordnen(antwort.fehler);
    fehlerSetzen(ziel, text);
    gehe(ziel);
  }

  async function weiter(event: FormEvent) {
    event.preventDefault();
    // Schlüssel eingegeben, aber noch nicht getestet: erst testen, dann weiter zur Modell-Wahl.
    if (schritt === "schluessel" && !eigenSpaeter && schluessel.trim() !== "" && !geprueft) {
      if (await verbindungTesten()) gehe("modell");
      return;
    }
    if (!pruefeSchritt()) return;
    if (schritt === "bot") void abschliessen();
    else naechster();
  }

  const sprache = fertig
    ? t("einrichtung.sprache.fertig")
    : {
        code: t("einrichtung.sprache.code", { name: botName.trim() || botVorschlag }),
        passwort: t("einrichtung.sprache.passwort"),
        anbieter: t("anbieterwahl.sprache"),
        schluessel: t("einrichtung.sprache.schluessel"),
        modell: t("einrichtung.sprache.modell"),
        schleuse: t("einrichtung.sprache.schleuse"),
        bot: t("einrichtung.sprache.bot"),
      }[schritt];

  return (
    <div className={styles.seite}>
      <header className={styles.kopf}>
        <span className={styles.marke}>
          <Logo groesse={26} />
          <Wortmarke />
        </span>
        <span className={styles.leise}>{t("seite.einrichtung")}</span>
      </header>
      <main className={styles.buehne}>
        <div className={styles.begleiter}>
          <Avatar farbe="limette" groesse={92} zustand={sendet ? "arbeitet" : "bereit"} />
          <p className={styles.sprechblase} aria-live="polite">
            {sprache}
          </p>
        </div>

        <div className={styles.karte}>
          {fertig ? (
            <section aria-labelledby="einrichtung-titel">
              <h1 id="einrichtung-titel" ref={ueberschrift} tabIndex={-1} className={styles.titel}>
                {t("einrichtung.fertig.titel")}
              </h1>
              <p className={styles.text}>{t("einrichtung.fertig.text")}</p>
              <ul className={styles.fertigListe}>
                <li>
                  <Icon name="check" />
                  {t("einrichtung.fertig.passwort")}
                </li>
                <li>
                  <Icon name="check" />
                  {t("einrichtung.fertig.bot", { name: fertig.botName })}
                </li>
                <li>
                  <Icon name={fertig.anbieter ? "check" : "info"} />
                  {fertig.anbieter
                    ? t("einrichtung.fertig.anbieter", {
                        anbieter: fertig.anbieterName ?? anbieter,
                      })
                    : t("einrichtung.fertig.ohne_anbieter")}
                </li>
                {fertig.modell && (
                  <li>
                    <Icon name="check" />
                    {t("einrichtung.fertig.modell", { modell: fertig.modell })}
                  </li>
                )}
                <li>
                  <Icon name={fertig.schleuse === "on" ? "check" : "info"} />
                  {fertig.schleuse === "on"
                    ? t("einrichtung.fertig.schleuse_an")
                    : t("einrichtung.fertig.schleuse_aus")}
                </li>
              </ul>
              <div className={styles.knoepfe}>
                <span />
                <a href="/" className={styles.primaerLink}>
                  {t("einrichtung.fertig.weiter")}
                </a>
              </div>
            </section>
          ) : (
            <form onSubmit={(e) => void weiter(e)} noValidate aria-labelledby="einrichtung-titel">
              <div className={styles.fortschritt}>
                <span className={styles.etikett}>
                  {t("einrichtung.schritt", { nummer, gesamt: schritte.length })}
                </span>
                <div className={styles.balken} aria-hidden="true">
                  {schritte.map((s, i) => (
                    <i key={s} data-an={i < nummer || undefined} />
                  ))}
                </div>
              </div>

              {schritt === "code" && (
                <>
                  <h1
                    id="einrichtung-titel"
                    ref={ueberschrift}
                    tabIndex={-1}
                    className={styles.titel}
                  >
                    {t("einrichtung.code.titel")}
                  </h1>
                  <p className={styles.text}>{t("einrichtung.code.text")}</p>
                  <ul className={styles.versprechen}>
                    {VERSPRECHEN.map((v) => (
                      <li key={v.icon}>
                        <span className={styles.rund}>
                          <Icon name={v.icon} />
                        </span>
                        <p>
                          <strong>{v.titel}</strong>
                          <span>{v.text}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                  <TextField
                    label={t("einrichtung.code.label")}
                    name="setupCode"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className={styles.mono}
                    fehler={fehler.code}
                    hilfe={`${t("einrichtung.code.hinweis")} ${t("einrichtung.code.hinweis_coolify")}`}
                  />
                  {ohneProxy && (
                    <p className={styles.warnung} role="note">
                      <Icon name="warnung" />
                      <span>{t("zugang.ohne_proxy")}</span>
                    </p>
                  )}
                </>
              )}

              {schritt === "passwort" && (
                <>
                  <h1
                    id="einrichtung-titel"
                    ref={ueberschrift}
                    tabIndex={-1}
                    className={styles.titel}
                  >
                    {t("einrichtung.passwort.titel")}
                  </h1>
                  <p className={styles.text}>{t("einrichtung.passwort.text")}</p>
                  <div className={styles.felder}>
                    <TextField
                      label={t("einrichtung.passwort.label")}
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      value={passwort}
                      onChange={(e) => setPasswort(e.target.value)}
                      fehler={fehler.passwort}
                    />
                    <TextField
                      label={t("einrichtung.passwort.wiederholen")}
                      type="password"
                      name="passwordRepeat"
                      autoComplete="new-password"
                      value={passwort2}
                      onChange={(e) => setPasswort2(e.target.value)}
                    />
                  </div>
                  <ul className={styles.pruefliste} aria-live="polite">
                    <li data-ok={passwort.length >= passwortMin || undefined}>
                      <Icon name={passwort.length >= passwortMin ? "check" : "x"} />
                      {t("einrichtung.passwort.laenge", { min: passwortMin })}
                    </li>
                    <li data-ok={(passwort !== "" && passwort === passwort2) || undefined}>
                      <Icon name={passwort !== "" && passwort === passwort2 ? "check" : "x"} />
                      {t("einrichtung.passwort.gleich")}
                    </li>
                  </ul>
                  <p className={styles.hinweis}>{t("einrichtung.passwort.tipp")}</p>
                </>
              )}

              {schritt === "anbieter" && (
                <>
                  <h1
                    id="einrichtung-titel"
                    ref={ueberschrift}
                    tabIndex={-1}
                    className={styles.titel}
                  >
                    {t("anbieterwahl.titel")}
                  </h1>
                  <p className={styles.text}>{t("anbieterwahl.text")}</p>
                  <AnbieterAuswahl
                    wert={wahl}
                    onWahl={(w) => {
                      if (w !== wahl) testZuruecksetzen();
                      setWahl(w);
                      fehlerSetzen("anbieter", undefined);
                    }}
                    {...(fehler.anbieter ? { fehler: fehler.anbieter } : {})}
                  />
                </>
              )}

              {schritt === "schluessel" && (
                <>
                  <h1
                    id="einrichtung-titel"
                    ref={ueberschrift}
                    tabIndex={-1}
                    className={styles.titel}
                  >
                    {t("einrichtung.schluessel.titel")}
                  </h1>
                  {eigenSpaeter ? (
                    <p className={styles.text}>{t("anbieterwahl.eigen.spaeter")}</p>
                  ) : (
                    <>
                      <p className={styles.text}>
                        {mitRegeln
                          ? t("anbieterwahl.regeln.text", { anbieter })
                          : einrichtungSchluesselText(anbieter)}
                      </p>
                      {wahl !== undefined && <KontoLink wahl={wahl} />}
                      <TextField
                        label={t("einrichtung.schluessel.feld", { anbieter })}
                        type="password"
                        name="apiKey"
                        autoComplete="off"
                        spellCheck={false}
                        className={styles.mono}
                        value={schluessel}
                        onChange={(e) => {
                          setSchluessel(e.target.value);
                          testZuruecksetzen();
                        }}
                        laedt={testLaeuft && !mitRegeln}
                        fehler={fehler.schluessel}
                        hilfe={t("einrichtung.schluessel.hilfe")}
                      />
                      {mitRegeln && (
                        <fieldset className={styles.regeln}>
                          <legend className={styles.regelLegende}>
                            {t("anbieterwahl.regeln.legende")}
                          </legend>
                          <p className={styles.hinweis}>
                            {t("anbieterwahl.regeln.wo", { anbieter })}
                          </p>
                          {regeln.map((r, i) => (
                            // Die Felder haben keine eigene Kennung; die Stelle genügt.
                            // biome-ignore lint/suspicious/noArrayIndexKey: Reihenfolge fest
                            <div key={i} className={styles.regelZeile}>
                              <TextField
                                label={t("anbieterwahl.regel.feld", { nummer: i + 1 })}
                                name={`ruleName${i}`}
                                autoComplete="off"
                                spellCheck={false}
                                value={r}
                                maxLength={100}
                                onChange={(e) => {
                                  const neu = [...regeln];
                                  neu[i] = e.target.value;
                                  setRegeln(neu);
                                  testZuruecksetzen();
                                }}
                              />
                              {regeln.length > 1 && (
                                <Button
                                  art="leise"
                                  icon="x"
                                  onClick={() => {
                                    setRegeln(regeln.filter((_, j) => j !== i));
                                    testZuruecksetzen();
                                  }}
                                >
                                  {t("anbieterwahl.regel.entfernen")}
                                </Button>
                              )}
                            </div>
                          ))}
                          {regeln.length < 5 && (
                            <span>
                              <Button
                                art="leise"
                                icon="plus"
                                onClick={() => setRegeln([...regeln, ""])}
                              >
                                {t("anbieterwahl.regel.weitere")}
                              </Button>
                            </span>
                          )}
                          <p className={styles.hinweis}>
                            {t("anbieterwahl.regeln.kosten", { anbieter })}
                          </p>
                        </fieldset>
                      )}
                      <span>
                        <Button
                          art="zweit"
                          onClick={() => void verbindungTesten()}
                          laedt={testLaeuft}
                        >
                          {mitRegeln
                            ? t("anbieterwahl.regeln.pruefen")
                            : t("einrichtung.schluessel.testen")}
                        </Button>
                      </span>
                      <div aria-live="polite" className={styles.ergebnisse}>
                        {testLaeuft && (
                          <p className={styles.hinweis}>
                            {mitRegeln
                              ? t("anbieterwahl.regeln.laeuft")
                              : t("modelle.verbindung.laeuft")}
                          </p>
                        )}
                        {testOk && (
                          <TestErgebnis art="ok" titel={t("anbieterwahl.test.ok")}>
                            {testOk}
                          </TestErgebnis>
                        )}
                        {testFehler && (
                          <TestErgebnis art="fehler" titel={t("anbieterwahl.test.fehler")}>
                            {testFehler}
                          </TestErgebnis>
                        )}
                        {regelErgebnisse && regelErgebnisse.length > 0 && (
                          <ul className={styles.regelErgebnisse}>
                            {regelErgebnisse.map((r) => (
                              <li key={r.name}>
                                <span className={styles.regelSymbol} data-ok={r.ok || undefined}>
                                  <Icon name={r.ok ? "check" : "warnung"} />
                                </span>
                                <span>
                                  <strong>
                                    {r.ok
                                      ? t("anbieterwahl.regel.ok", { name: r.name })
                                      : t("anbieterwahl.regel.nicht_ok", { name: r.name })}
                                  </strong>{" "}
                                  {r.ok
                                    ? (r.herkunft ?? "")
                                    : [r.text, r.ausweg].filter(Boolean).join(" ")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {schritt === "modell" && (
                <>
                  <h1
                    id="einrichtung-titel"
                    ref={ueberschrift}
                    tabIndex={-1}
                    className={styles.titel}
                  >
                    {mitRegeln ? t("anbieterwahl.regel.titel") : t("einrichtung.modell.label")}
                  </h1>
                  <p className={styles.text}>
                    {mitRegeln ? t("anbieterwahl.regel.text") : t("einrichtung.modell.text")}
                  </p>
                  {mitRegeln ? (
                    <fieldset className={styles.modelle} aria-describedby={`${modellGruppe}f`}>
                      <legend className={styles.unsichtbar}>
                        {t("anbieterwahl.regel.liste", { anbieter })}
                      </legend>
                      {okRegeln.map((name) => (
                        <label
                          key={name}
                          className={styles.modell}
                          data-gewaehlt={regel === name || undefined}
                        >
                          <input
                            type="radio"
                            name="ruleName"
                            value={name}
                            checked={regel === name}
                            onChange={() => setRegel(name)}
                          />
                          <span className={styles.modellText}>
                            <strong>{name}</strong>
                            <span>
                              {regelErgebnisse?.find((r) => r.name === name)?.herkunft ?? ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  ) : modelle && modelle.length > 0 ? (
                    <fieldset className={styles.modelle} aria-describedby={`${modellGruppe}f`}>
                      <legend className={styles.unsichtbar}>
                        {t("einrichtung.modell.liste", { anbieter })}
                      </legend>
                      {modelle.map((m) => (
                        <label
                          key={m.slug}
                          className={styles.modell}
                          data-gewaehlt={modell === m.slug || undefined}
                        >
                          <input
                            type="radio"
                            name="modelSlug"
                            value={m.slug}
                            checked={modell === m.slug}
                            onChange={() => setModell(m.slug)}
                          />
                          <span className={styles.modellText}>
                            <strong>{m.displayName}</strong>
                            <span className={styles.mono}>{m.slug}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <p className={styles.hinweis}>{t("einrichtung.modell.keins")}</p>
                  )}
                  {fehler.modell && (
                    <p id={`${modellGruppe}f`} className={styles.fehler} role="alert">
                      {fehler.modell}
                    </p>
                  )}
                </>
              )}

              {schritt === "schleuse" && (
                <>
                  <h1
                    id="einrichtung-titel"
                    ref={ueberschrift}
                    tabIndex={-1}
                    className={styles.titel}
                  >
                    {t("einrichtung.schleuse.label")}
                  </h1>
                  <p className={styles.text}>{t("einrichtung.schleuse.erklaerung")}</p>
                  <Switch
                    an={schleuse}
                    onAendern={setSchleuse}
                    disabled={!schleuseInstalliert}
                    label={t("schleuse.standard")}
                  >
                    {t("schleuse.standard")}: {schleuse ? t("schleuse.an") : t("schleuse.aus")}
                  </Switch>
                  <p className={styles.hinweis}>
                    {schleuseInstalliert
                      ? schleuse
                        ? t("einrichtung.schleuse.an_hinweis")
                        : t("einrichtung.schleuse.aus_hinweis")
                      : t("einrichtung.schleuse.nicht_installiert")}
                  </p>
                  {fehler.schleuse && (
                    <p className={styles.fehler} role="alert">
                      {fehler.schleuse}
                    </p>
                  )}
                </>
              )}

              {schritt === "bot" && (
                <>
                  <h1
                    id="einrichtung-titel"
                    ref={ueberschrift}
                    tabIndex={-1}
                    className={styles.titel}
                  >
                    {t("einrichtung.bot.titel")}
                  </h1>
                  <p className={styles.text}>{t("einrichtung.bot.text")}</p>
                  <TextField
                    label={t("einrichtung.bot.label")}
                    name="botName"
                    value={botName}
                    maxLength={LIMITS.botNameChars}
                    autoComplete="off"
                    onChange={(e) => setBotName(e.target.value)}
                    fehler={fehler.bot}
                  />
                </>
              )}

              <div className={styles.knoepfe}>
                {nummer > 1 ? (
                  <Button art="zweit" onClick={voriger} disabled={sendet}>
                    {t("allgemein.zurueck")}
                  </Button>
                ) : (
                  <span />
                )}
                <span className={styles.rechts}>
                  {schritt === "schluessel" && !eigenSpaeter && (
                    <Button art="leise" onClick={spaeterEintragen}>
                      {t("einrichtung.schluessel.ueberspringen")}
                    </Button>
                  )}
                  <Button
                    art="primaer"
                    type="submit"
                    groesse={schritt === "bot" ? "gross" : "normal"}
                    laedt={sendet}
                  >
                    {schritt === "bot"
                      ? sendet
                        ? t("einrichtung.abschliessen.laeuft")
                        : t("einrichtung.abschliessen")
                      : t("allgemein.weiter")}
                  </Button>
                </span>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
