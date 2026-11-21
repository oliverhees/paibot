/**
 * PaiBot – geführte Einrichtung im Browser: Code, Passwort, Anbieter, Modell, Datenschleuse,
 * Name des Bots, fertig.
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
  TextField,
  Wortmarke,
} from "@paibot/ui";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "../../lib/api/client";
import { einrichtungSchluesselText } from "../../lib/modelle/ansicht";
import styles from "./einrichtung.module.css";

export interface EinrichtungProps {
  anbieter: string;
  passwortMin: number;
  botVorschlag: string;
  schleuseInstalliert: boolean;
  ohneProxy: boolean;
}

type Schritt = "code" | "passwort" | "schluessel" | "modell" | "schleuse" | "bot";

interface Modell {
  slug: string;
  displayName: string;
}

interface Abschluss {
  anbieter: boolean;
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
  anbieter,
  passwortMin,
  botVorschlag,
  schleuseInstalliert,
  ohneProxy,
}: EinrichtungProps) {
  const [schritt, setSchritt] = useState<Schritt>("code");
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

  const mitSchluessel = schluessel.trim() !== "" && modelle !== undefined;
  const schritte: Schritt[] = [
    "code",
    "passwort",
    "schluessel",
    ...(mitSchluessel ? (["modell"] as const) : []),
    "schleuse",
    "bot",
  ];
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
  const naechster = () => {
    const i = schritte.indexOf(schritt);
    const ziel = schritte[i + 1];
    if (ziel) gehe(ziel);
  };
  const voriger = () => {
    const i = schritte.indexOf(schritt);
    const ziel = schritte[i - 1];
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
      case "schluessel": {
        if (schluessel.trim() === "") {
          fehlerSetzen("schluessel", t("einrichtung.schluessel.leer"));
          return false;
        }
        if (modelle === undefined) {
          fehlerSetzen("schluessel", t("einrichtung.schluessel.erst_testen"));
          return false;
        }
        return true;
      }
      case "modell": {
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

  async function verbindungTesten(): Promise<boolean> {
    if (schluessel.trim() === "") {
      fehlerSetzen("schluessel", t("einrichtung.schluessel.leer"));
      return false;
    }
    setTestLaeuft(true);
    setTestOk(undefined);
    fehlerSetzen("schluessel", undefined);
    const antwort = await apiFetch<{ modelle: Modell[] }>(
      "POST",
      "/api/einrichtung/verbindungstest",
      { setupCode: code, apiKey: schluessel },
    );
    setTestLaeuft(false);
    if (antwort.ok) {
      setModelle(antwort.daten.modelle);
      setModell(undefined);
      setTestOk(t("einrichtung.schluessel.ok", { anzahl: antwort.daten.modelle.length }));
      return true;
    }
    setModelle(undefined);
    const { schritt: ziel, text } = fehlerZuordnen(antwort.fehler);
    fehlerSetzen(ziel === "code" ? "code" : "schluessel", text);
    if (ziel === "code") gehe("code");
    return false;
  }

  function spaeterEintragen() {
    setSchluessel("");
    setModelle(undefined);
    setModell(undefined);
    setTestOk(undefined);
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
      ...(mitSchluessel ? { apiKey: schluessel } : {}),
      ...(mitSchluessel && modell !== undefined ? { modelSlug: modell } : {}),
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
    if (schritt === "schluessel" && schluessel.trim() !== "" && modelle === undefined) {
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
                    ? t("einrichtung.fertig.anbieter", { anbieter })
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
                  <p className={styles.text}>{einrichtungSchluesselText(anbieter)}</p>
                  <div className={styles.feldReihe}>
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
                        setModelle(undefined);
                        setTestOk(undefined);
                      }}
                      laedt={testLaeuft}
                      fehler={fehler.schluessel}
                      hilfe={testOk ?? t("einrichtung.schluessel.hilfe")}
                    />
                    <Button art="leise" onClick={() => void verbindungTesten()} laedt={testLaeuft}>
                      {t("einrichtung.schluessel.testen")}
                    </Button>
                  </div>
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
                    {t("einrichtung.modell.label")}
                  </h1>
                  <p className={styles.text}>{t("einrichtung.modell.text")}</p>
                  {modelle && modelle.length > 0 ? (
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
                  {schritt === "schluessel" && (
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
