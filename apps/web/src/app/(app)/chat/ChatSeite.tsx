/**
 * PaiBot – Chat mit dem Bot: Verlauf, Antworten live Stück für Stück, Stopp, Schalter der
 * Datenschleuse, Zeile mit Beleg, Weg und Modell unter jeder Antwort, Belege rechts.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import "../../../lib/ohne-auswertung";
import type { ApiErrorDetail } from "@paibot/shared/api";
import type { ConversationId } from "@paibot/shared/ids";
import { LIMITS } from "@paibot/shared/konstanten";
import { errorText, errorWayOut, t, tList } from "@paibot/shared/texte";
import {
  AntwortZeile,
  Avatar,
  BelegZeile,
  Button,
  ChatBubble,
  ChatEingabe,
  Dialog,
  EmptyState,
  Icon,
  Markdown,
  Menue,
  ScrollBereich,
  TextField,
} from "@paibot/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../../../lib/api/client";
import {
  type AnsichtEintrag,
  type AnsichtLaufEnde,
  type AnsichtNachricht,
  abbruchAngefragt,
  abbruchZurueck,
  ansichtAus,
  belegeMischen,
  belegZurAntwort,
  ereignisAnwenden,
  gesendet,
  leereAnsicht,
  sendenGesperrt,
} from "../../../lib/chat/ansicht";
import {
  belegKennung,
  laengenHinweis,
  schleuseFehler,
  schleuseFehlerArt,
  tagSchluessel,
  tagText,
  titelAusNachricht,
  uhrzeit,
  wegAngabe,
  zielZuCode,
  zielZuSchleuseFehler,
} from "../../../lib/chat/anzeige";
import { CHAT_PFADE, unterhaltungsAdresse } from "../../../lib/chat/pfade";
import { useFlaeche, useKopf, useRahmen } from "../../../lib/chat/rahmen-kontext";
import type {
  BelegKurz,
  ChatBereitschaft,
  ChatVerlauf,
  UnterhaltungInfo,
} from "../../../lib/chat/typen";
import { entwurfLesen, entwurfMerken } from "../../../lib/speicher";
import { useConversationEvents } from "../../../lib/sse/use-conversation-events";
import { BelegeFlaeche } from "./BelegeFlaeche";
import styles from "./chat.module.css";

export interface ChatSeiteProps {
  bereitschaft: ChatBereitschaft;
  /** Geladener Verlauf; fehlt bei einer neuen Unterhaltung. */
  verlauf?: ChatVerlauf;
}

const BLOCK_TEXTE = {
  etikett: t("chat.entwurf.etikett"),
  kopieren: t("chat.entwurf.kopieren"),
  kopiert: t("chat.entwurf.kopiert"),
};

/** Abstand zum unteren Rand, bis zu dem der Verlauf neuen Text automatisch mitrollt. */
const ANKLEBEN_PX = 96;
/** Wartezeit, bevor angekündigte Belege vollständig geholt werden (sie kommen oft paarweise). */
const BELEGE_WARTEN_MS = 300;

interface Gesendet {
  messageId: string;
  runId: string;
  zeit: string;
}

function Fehlerhinweis({
  fehler,
  onSchliessen,
}: {
  fehler: ApiErrorDetail;
  onSchliessen: () => void;
}) {
  const ziel = zielZuCode(fehler.code);
  return (
    <div className={styles.fehler} role="alert">
      <div>
        <strong>{fehler.text}</strong>
        {fehler.ausweg && <p>{fehler.ausweg}</p>}
        {ziel && (
          <Link href={ziel.href} prefetch={false} className={styles.link}>
            {ziel.text}
          </Link>
        )}
      </div>
      <button type="button" className={styles.schliessen} onClick={onSchliessen}>
        {t("chat.schliessen")}
      </button>
    </div>
  );
}

export function ChatSeite({ bereitschaft, verlauf }: ChatSeiteProps) {
  const router = useRouter();
  const rahmen = useRahmen();
  const { unterhaltungMerken, unterhaltungEntfernen, setFlaecheOffen } = rahmen;
  const kontext = useMemo(
    () => (bereitschaft.modell ? { modell: bereitschaft.modell } : {}),
    [bereitschaft.modell],
  );
  const [unterhaltung, setUnterhaltung] = useState<UnterhaltungInfo | undefined>(
    verlauf?.unterhaltung,
  );
  const [ansicht, setAnsicht] = useState(() =>
    verlauf ? ansichtAus(verlauf, kontext) : leereAnsicht(),
  );
  const [text, setText] = useState("");
  const [schleuseAn, setSchleuseAn] = useState(
    (verlauf?.unterhaltung.schleuse ?? bereitschaft.schleuseStandard) === "on",
  );
  const [sendet, setSendet] = useState<string | undefined>();
  const [fehler, setFehler] = useState<ApiErrorDetail | undefined>();
  const [schritte, setSchritte] = useState(true);
  const [belegOffen, setBelegOffen] = useState<string | undefined>();
  const [dialog, setDialog] = useState<"umbenennen" | "loeschen" | undefined>();
  const [ansage, setAnsage] = useState("");
  const verlaufRef = useRef<HTMLElement>(null);
  const eingabeRef = useRef<HTMLDivElement>(null);
  const ankleben = useRef(true);
  const jetzt = useMemo(() => new Date(), []);
  const { botName, zeitzone } = bereitschaft;
  const bereit = bereitschaft.modell !== undefined && bereitschaft.schluessel;
  const id = unterhaltung?.id;

  // Live-Verlauf: ab der letzten bekannten Nummer, ohne Lücke und ohne Doppel.
  const { zustand: verbindung, neuVerbinden } = useConversationEvents(
    id as ConversationId | undefined,
    {
      nachSeq: ansicht.letzteSeq,
      onEvent: (e) => setAnsicht((a) => ereignisAnwenden(a, e, kontext)),
    },
  );

  // Entwurf je Unterhaltung merken.
  useEffect(() => {
    if (id !== undefined) setText((alt) => alt || entwurfLesen(id));
  }, [id]);
  useEffect(() => {
    if (id !== undefined) entwurfMerken(id, text);
  }, [id, text]);

  // Angekündigte Belege vollständig holen (nicht, während die Unterhaltung gelöscht wird).
  const offeneBelege = ansicht.belege.filter((b) => !b.vollstaendig).length;
  const loescht = dialog === "loeschen";
  useEffect(() => {
    if (id === undefined || offeneBelege === 0 || loescht) return;
    let aktiv = true;
    const zeitgeber = setTimeout(async () => {
      const r = await apiFetch<{ belege: BelegKurz[] }>("GET", CHAT_PFADE.unterhaltung(id));
      if (aktiv && r.ok) setAnsicht((a) => belegeMischen(a, r.daten.belege));
    }, BELEGE_WARTEN_MS);
    return () => {
      aktiv = false;
      clearTimeout(zeitgeber);
    };
  }, [id, offeneBelege, loescht]);

  // Fertige Antwort im Live-Bereich ansagen (nicht jedes Stück).
  useEffect(() => {
    const fertig = ansicht.fertigeAntwort;
    if (fertig === undefined) return;
    const n = ansicht.eintraege.find((e) => e.art === "nachricht" && e.id === fertig);
    if (n?.art !== "nachricht") return;
    const kurz = n.text.length > 400 ? `${n.text.slice(0, 400)} …` : n.text;
    setAnsage(`${t("chat.antwort.fertig", { name: botName })}: ${kurz}`);
  }, [ansicht.fertigeAntwort, ansicht.eintraege, botName]);

  // Mitrollen, solange man unten ist.
  useEffect(() => {
    const el = verlaufRef.current;
    if (!el) return;
    const messen = () => {
      ankleben.current = el.scrollHeight - el.scrollTop - el.clientHeight < ANKLEBEN_PX;
    };
    el.addEventListener("scroll", messen, { passive: true });
    return () => el.removeEventListener("scroll", messen);
  }, []);
  useLayoutEffect(() => {
    const el = verlaufRef.current;
    if (el && ankleben.current) el.scrollTop = el.scrollHeight;
  });

  const oeffneBeleg = useCallback(
    (belegId: string | undefined) => {
      setBelegOffen(belegId);
      setFlaecheOffen(true);
    },
    [setFlaecheOffen],
  );

  async function senden(roh: string) {
    if (sendet !== undefined || sendenGesperrt(ansicht) || !bereit) return;
    if (laengenHinweis(roh, LIMITS.messageChars).art === "zu_lang") {
      // Die Eingabe leert sich nach dem Senden; der Text kommt zurück.
      queueMicrotask(() => setText(roh));
      return;
    }
    setFehler(undefined);
    setSendet(roh);
    ankleben.current = true;
    const zurueck = (f: ApiErrorDetail) => {
      setSendet(undefined);
      setFehler(f);
      setText((stand) => stand || roh);
    };
    let ziel = unterhaltung;
    if (ziel === undefined) {
      const r = await apiFetch<{ unterhaltung: UnterhaltungInfo; zuletzt: string }>(
        "POST",
        CHAT_PFADE.unterhaltungen(),
        { title: titelAusNachricht(roh) },
      );
      if (!r.ok) return zurueck(r.fehler);
      ziel = r.daten.unterhaltung;
      setUnterhaltung(ziel);
      unterhaltungMerken({ id: ziel.id, titel: ziel.titel, zuletzt: r.daten.zuletzt });
      window.history.replaceState(null, "", unterhaltungsAdresse(ziel.id));
    }
    const modus = schleuseAn ? "on" : "off";
    const r = await apiFetch<Gesendet>("POST", CHAT_PFADE.nachrichten(ziel.id), {
      text: roh,
      schleuse: modus,
    });
    if (!r.ok) return zurueck(r.fehler);
    setAnsicht((a) => gesendet(a, { ...r.daten, text: roh }));
    setSendet(undefined);
    entwurfMerken(ziel.id, "");
    setUnterhaltung({ ...ziel, schleuse: modus });
    unterhaltungMerken({ id: ziel.id, titel: ziel.titel, zuletzt: r.daten.zeit });
  }

  async function stoppen() {
    const lauf = ansicht.lauf;
    if (id === undefined || lauf === undefined || lauf.abbruch) return;
    setAnsicht(abbruchAngefragt);
    const r = await apiFetch("POST", CHAT_PFADE.abbrechen(id, lauf.id));
    if (r.ok) return;
    setAnsicht(abbruchZurueck);
    // Schon zu Ende: dann ist nichts mehr abzubrechen, die Ereignisse zeigen das Ergebnis.
    if (r.status !== 404) setFehler(r.fehler);
  }

  async function schleuseSchalten(an: boolean) {
    setSchleuseAn(an);
    if (unterhaltung === undefined) return;
    const r = await apiFetch<{ unterhaltung: UnterhaltungInfo }>(
      "PUT",
      CHAT_PFADE.schleuse(unterhaltung.id),
      { mode: an ? "on" : "off" },
    );
    if (r.ok) {
      setUnterhaltung(r.daten.unterhaltung);
      setSchleuseAn(r.daten.unterhaltung.schleuse === "on");
    } else {
      setSchleuseAn(!an);
      setFehler(r.fehler);
    }
  }

  function beispiel(satz: string) {
    setText(satz);
    eingabeRef.current?.querySelector("textarea")?.focus();
  }

  // ---------- Kopfzeile ----------
  const lauf = ansicht.lauf;
  const botZustand = lauf ? "arbeitet" : "bereit";
  const statusText = lauf
    ? lauf.abbruch
      ? t("chat.lauf.stoppt")
      : lauf.phase === "wartet"
        ? t("chat.lauf.wartet")
        : t("chat.lauf.schreibt")
    : t("chat.bot.bereit");
  const titel = unterhaltung?.titel ?? t("chat.titel.neu");
  const kopf = useMemo(
    () => (
      <div className={styles.kopf}>
        <span className={styles.botTitel}>
          <Avatar farbe={bereitschaft.botFarbe} groesse={28} zustand={botZustand} still />
          <span className={styles.botText}>
            <strong>{titel}</strong>
            <small>
              {botName} ·{" "}
              <span className={styles.status} data-zustand={botZustand}>
                {statusText}
              </span>
            </small>
          </span>
        </span>
        <span className={styles.platz} />
        <button
          type="button"
          className={styles.textKnopf}
          aria-pressed={schritte}
          title={t("chat.kopf.schritte_label")}
          onClick={() => setSchritte((s) => !s)}
        >
          <Icon name="beleg" />
          <span className={styles.nurBreit}>{t("chat.kopf.schritte")}</span>
          <span className={styles.nurLesbar}>{t("chat.kopf.schritte_label")}</span>
        </button>
        {bereitschaft.modell && (
          <Link
            href="/modelle"
            prefetch={false}
            className={styles.modellKnopf}
            aria-label={t("chat.kopf.modell", {
              name: bereitschaft.modell.name,
              region: t(`modelle.region.${bereitschaft.modell.region}`),
            })}
          >
            <span className={styles.nurBreit}>{bereitschaft.modell.name}</span>
            <span className={styles.region}>
              {t(`modelle.region.${bereitschaft.modell.region}`)}
            </span>
          </Link>
        )}
        {unterhaltung && (
          <Menue
            label={t("chat.kopf.menue")}
            eintraege={[
              {
                id: "umbenennen",
                text: t("chat.umbenennen"),
                icon: "stift",
                onWaehlen: () => setDialog("umbenennen"),
              },
              {
                id: "belege",
                text: t("chat.menue.belege"),
                icon: "beleg",
                onWaehlen: () => oeffneBeleg(undefined),
              },
              {
                id: "loeschen",
                text: `${t("chat.loeschen")} …`,
                icon: "papierkorb",
                gefahr: true,
                onWaehlen: () => setDialog("loeschen"),
              },
            ]}
          />
        )}
      </div>
    ),
    [
      bereitschaft.botFarbe,
      bereitschaft.modell,
      botName,
      botZustand,
      oeffneBeleg,
      schritte,
      statusText,
      titel,
      unterhaltung,
    ],
  );
  useKopf(kopf);

  // ---------- Arbeitsfläche ----------
  const flaeche = useMemo(
    () =>
      unterhaltung === undefined
        ? undefined
        : {
            inhalt: (
              <BelegeFlaeche
                belege={ansicht.belege}
                zeitzone={zeitzone}
                botName={botName}
                {...(belegOffen === undefined ? {} : { offen: belegOffen })}
                onOeffnen={setBelegOffen}
              />
            ),
            zahl: ansicht.belege.length,
          },
    [unterhaltung, ansicht.belege, zeitzone, botName, belegOffen],
  );
  useFlaeche(flaeche);

  // ---------- Verlauf ----------
  function antwortZeile(n: AnsichtNachricht): ReactNode {
    if (!schritte) return null;
    if (n.zustand === "streamt") {
      return (
        <p className={styles.arbeitet}>
          <span className={styles.status} data-zustand="arbeitet">
            {lauf?.phase === "wartet" ? t("chat.lauf.wartet") : t("chat.lauf.schreibt")}
          </span>
          <span>{t("chat.lauf.beleg_folgt")}</span>
        </p>
      );
    }
    const b = belegZurAntwort(ansicht.belege, n.runId);
    const beleg =
      b?.seq === undefined
        ? undefined
        : {
            kennung: belegKennung(b.seq),
            zustand: "offen" as const,
            zustandText: t("chat.beleg.zeile"),
            onPruefen: () => oeffneBeleg(b.id),
          };
    const modell = n.modell ?? bereitschaft.modell;
    if (n.route === undefined || modell === undefined) {
      return beleg ? (
        <div className={styles.nurBeleg}>
          <BelegZeile beleg={beleg} />
        </div>
      ) : null;
    }
    return (
      <AntwortZeile
        {...(beleg ? { beleg } : {})}
        schleuse={wegAngabe(n.route, modell.region)}
        modell={modell}
      />
    );
  }

  function avatar(arbeitet: boolean) {
    return (
      <Avatar
        farbe={bereitschaft.botFarbe}
        groesse={30}
        zustand={arbeitet ? "arbeitet" : "bereit"}
        still
      />
    );
  }

  function nachricht(n: AnsichtNachricht): ReactNode {
    if (n.rolle === "du") {
      return (
        <ChatBubble key={n.id} von="du" zeit={uhrzeit(n.zeit, zeitzone)}>
          <span className={styles.duText}>{n.text}</span>
        </ChatBubble>
      );
    }
    const zustand =
      n.zustand === "fehler" ? "fehler" : n.zustand === "abgebrochen" ? "abgebrochen" : n.zustand;
    const schleuseArt =
      n.zustand === "fehler" && n.fehlerCode
        ? schleuseFehlerArt({
            ergebnis: "fehlgeschlagen",
            code: n.fehlerCode,
            ueberSchleuse: n.route === "schleuse",
          })
        : undefined;
    const hinweis =
      n.zustand === "abgebrochen"
        ? t("chat.ende.abgebrochen_teil")
        : schleuseArt
          ? schleuseFehler(schleuseArt).text
          : n.zustand === "fehler"
            ? (n.fehlerText ?? (n.fehlerCode ? errorText(n.fehlerCode) : t("fehler.intern")))
            : undefined;
    const ziel = schleuseArt
      ? zielZuSchleuseFehler(schleuseArt)
      : n.zustand === "fehler" && n.fehlerCode
        ? zielZuCode(n.fehlerCode)
        : undefined;
    return (
      <ChatBubble
        key={n.id}
        von="bot"
        name={botName}
        zeit={uhrzeit(n.zeit, zeitzone)}
        avatar={avatar(n.zustand === "streamt")}
        zustand={zustand}
        {...(hinweis ? { zustandText: hinweis } : {})}
        fuss={
          <>
            {ziel && (
              <Link href={ziel.href} prefetch={false} className={styles.link}>
                {ziel.text}
              </Link>
            )}
            {antwortZeile(n)}
          </>
        }
      >
        {n.text === "" ? (
          <span className={styles.leise}>{t("chat.antwort.schreibt", { name: botName })}</span>
        ) : (
          <Markdown text={n.text} blockTexte={BLOCK_TEXTE} />
        )}
      </ChatBubble>
    );
  }

  function laufEnde(e: AnsichtLaufEnde): ReactNode {
    const schleuseArt = schleuseFehlerArt({
      ergebnis: e.ergebnis,
      code: e.code,
      schleuseGemeldet: e.schleuseGrund !== undefined,
    });
    const schleuse = schleuseArt ? schleuseFehler(schleuseArt) : undefined;
    const ziel = schleuseArt ? zielZuSchleuseFehler(schleuseArt) : zielZuCode(e.code);
    const b = belegZurAntwort(ansicht.belege, e.runId);
    const ueberschrift =
      e.ergebnis === "abgebrochen"
        ? t("chat.ende.abgebrochen", { name: botName })
        : e.ergebnis === "abgelehnt"
          ? t("chat.ende.abgelehnt")
          : t("chat.antwort.fehlgeschlagen");
    const satz =
      e.ergebnis === "abgebrochen" ? undefined : (schleuse?.text ?? e.text ?? errorText(e.code));
    const ausweg =
      e.ergebnis === "abgebrochen" ? undefined : (schleuse?.ausweg ?? errorWayOut(e.code));
    return (
      <ChatBubble
        key={`ende-${e.runId}`}
        von="bot"
        name={botName}
        zeit={uhrzeit(e.zeit, zeitzone)}
        avatar={avatar(false)}
        zustand={e.ergebnis === "abgebrochen" ? "abgebrochen" : "fehler"}
        fuss={
          schritte && b?.seq !== undefined ? (
            <div className={styles.nurBeleg}>
              <BelegZeile
                beleg={{
                  kennung: belegKennung(b.seq),
                  zustand: "offen",
                  zustandText: t("chat.beleg.zeile"),
                  onPruefen: () => oeffneBeleg(b.id),
                }}
              />
            </div>
          ) : undefined
        }
      >
        <div className={styles.ende}>
          <strong>{ueberschrift}</strong>
          {satz && <p>{satz}</p>}
          {e.schleuseGrund && !schleuse && (
            <p>{t("chat.ende.schleuse", { grund: e.schleuseGrund })}</p>
          )}
          {ausweg && <p className={styles.leise}>{ausweg}</p>}
          {ziel && (
            <Link href={ziel.href} prefetch={false} className={styles.link}>
              {ziel.text}
            </Link>
          )}
        </div>
      </ChatBubble>
    );
  }

  function eintrag(e: AnsichtEintrag): ReactNode {
    return e.art === "nachricht" ? nachricht(e) : laufEnde(e);
  }

  const mitTagen: ReactNode[] = [];
  let tag = "";
  for (const e of ansicht.eintraege) {
    const neu = tagSchluessel(e.zeit, zeitzone);
    if (neu !== tag) {
      tag = neu;
      mitTagen.push(
        <span key={`tag-${neu}`} className={styles.tag}>
          {tagText(e.zeit, zeitzone, jetzt)}
        </span>,
      );
    }
    mitTagen.push(eintrag(e));
  }
  const streamtSchon = ansicht.eintraege.some(
    (e) => e.art === "nachricht" && e.rolle === "bot" && e.runId === lauf?.id,
  );
  const leer = ansicht.eintraege.length === 0 && sendet === undefined;

  const nichtBereit = !bereit ? (
    <EmptyState
      bild={<Avatar farbe={bereitschaft.botFarbe} groesse={56} zustand="schlaeft" still />}
      titel={
        bereitschaft.modell === undefined
          ? t("chat.kein_modell.titel", { name: botName })
          : t("chat.kein_schluessel.titel")
      }
      text={
        <p className={styles.absatz}>
          {bereitschaft.modell === undefined
            ? t("chat.kein_modell.text", { name: botName })
            : t("chat.kein_schluessel.text", { name: botName })}
        </p>
      }
      aktion={
        <Link href="/modelle" prefetch={false} className={styles.primaerLink}>
          {t("chat.ziel.modelle")}
        </Link>
      }
    />
  ) : null;

  const laenge = laengenHinweis(text, LIMITS.messageChars);
  const schleuseHinweis = !bereitschaft.schleuseInstalliert ? (
    <>
      {t("chat.schleuse.nicht_eingerichtet")}{" "}
      <Link href="/datenschleuse" prefetch={false} className={styles.link}>
        {t("chat.schleuse.zuschalten")}
      </Link>
    </>
  ) : ansicht.schleuseBlockiert && schleuseAn ? (
    <>
      {t("chat.schleuse.nicht_bereit")}{" "}
      <Link href="/datenschleuse" prefetch={false} className={styles.link}>
        {t("chat.ziel.datenschleuse")}
      </Link>
    </>
  ) : null;
  const hinweise =
    laenge.art !== "ok" || schleuseHinweis ? (
      <div className={styles.hinweise}>
        {laenge.art !== "ok" && (
          <p
            className={styles.laenge}
            data-art={laenge.art}
            {...(laenge.art === "zu_lang" ? { role: "alert" } : {})}
          >
            {laenge.text}
          </p>
        )}
        {schleuseHinweis && <p className={styles.notizZeile}>{schleuseHinweis}</p>}
      </div>
    ) : null;

  return (
    <div className={styles.seite}>
      <ScrollBereich
        ref={verlaufRef}
        className={styles.verlauf}
        role="log"
        aria-live="off"
        label={t("chat.verlauf")}
      >
        <div className={styles.spalte}>
          {leer && !bereit && nichtBereit}
          {leer && bereit && (
            <EmptyState
              bild={<Avatar farbe={bereitschaft.botFarbe} groesse={64} />}
              titel={t("chat.leer.titel")}
              text={<p className={styles.absatz}>{t("chat.leer.hinweis")}</p>}
              aktion={
                <div className={styles.beispiele}>
                  {tList("chat.leer.beispiele").map((satz) => (
                    <Button key={satz} art="zweit" onClick={() => beispiel(satz)}>
                      {satz}
                    </Button>
                  ))}
                </div>
              }
            />
          )}
          {mitTagen}
          {sendet !== undefined && (
            <div className={styles.ausstehend} aria-busy="true">
              <ChatBubble von="du" zeit={t("chat.ausstehend")}>
                <span className={styles.duText}>{sendet}</span>
              </ChatBubble>
            </div>
          )}
          {lauf && !streamtSchon && (
            <ChatBubble
              von="bot"
              name={botName}
              avatar={avatar(true)}
              zustand="streamt"
              fuss={
                schritte ? (
                  <p className={styles.arbeitet}>
                    <span className={styles.status} data-zustand="arbeitet">
                      {lauf.abbruch
                        ? t("chat.lauf.stoppt")
                        : lauf.phase === "wartet"
                          ? t("chat.lauf.wartet")
                          : t("chat.lauf.schreibt")}
                    </span>
                    <span>{t("chat.lauf.beleg_folgt")}</span>
                  </p>
                ) : undefined
              }
            >
              <span className={styles.leise}>{t("chat.antwort.schreibt", { name: botName })}</span>
            </ChatBubble>
          )}
        </div>
      </ScrollBereich>
      <p className={styles.nurLesbar} aria-live="polite">
        {ansage}
      </p>
      <div className={styles.unten} ref={eingabeRef}>
        {verbindung !== "verbunden" && id !== undefined && (
          <div className={styles.verbindung} role="status">
            {verbindung === "verbindet_neu" ? (
              <span>{t("chat.verbindung.neu")}</span>
            ) : (
              <>
                <span>{t("chat.verbindung.getrennt")}</span>
                <button type="button" className={styles.link} onClick={neuVerbinden}>
                  {t("chat.verbindung.knopf")}
                </button>
              </>
            )}
          </div>
        )}
        {fehler && <Fehlerhinweis fehler={fehler} onSchliessen={() => setFehler(undefined)} />}
        {!leer && nichtBereit}
        {hinweise}
        <ChatEingabe
          wert={text}
          onWert={setText}
          onSenden={(roh) => void senden(roh)}
          laeuft={lauf !== undefined}
          onStopp={() => void stoppen()}
          schleuseAn={schleuseAn}
          onSchleuse={(an) => void schleuseSchalten(an)}
          schleuseDeaktiviert={!bereitschaft.schleuseInstalliert && !schleuseAn}
          platzhalter={t("chat.eingabe.platzhalter_bot", { name: botName })}
          deaktiviert={!bereit || sendet !== undefined}
          notiz={t("chat.notiz", { name: botName })}
        />
      </div>

      <Dialog
        offen={dialog === "umbenennen"}
        onSchliessen={() => setDialog(undefined)}
        titel={t("chat.umbenennen.titel")}
        schliessenLabel={t("chat.schliessen")}
      >
        {unterhaltung && (
          <Umbenennen
            unterhaltung={unterhaltung}
            onFertig={(u) => {
              setUnterhaltung(u);
              const alt = rahmen.unterhaltungen.find((x) => x.id === u.id);
              unterhaltungMerken({
                id: u.id,
                titel: u.titel,
                zuletzt: alt?.zuletzt ?? new Date().toISOString(),
              });
              setDialog(undefined);
            }}
            onAbbrechen={() => setDialog(undefined)}
          />
        )}
      </Dialog>
      <Dialog
        offen={dialog === "loeschen"}
        onSchliessen={() => setDialog(undefined)}
        titel={t("chat.loeschen.frage", { titel })}
        schliessenLabel={t("chat.schliessen")}
        rueckfrage
      >
        {unterhaltung && (
          <Loeschen
            unterhaltung={unterhaltung}
            onFertig={() => {
              entwurfMerken(unterhaltung.id, "");
              unterhaltungEntfernen(unterhaltung.id);
              setDialog(undefined);
              router.push("/");
            }}
            onAbbrechen={() => setDialog(undefined)}
          />
        )}
      </Dialog>
    </div>
  );
}

function Umbenennen({
  unterhaltung,
  onFertig,
  onAbbrechen,
}: {
  unterhaltung: UnterhaltungInfo;
  onFertig: (u: UnterhaltungInfo) => void;
  onAbbrechen: () => void;
}) {
  const [wert, setWert] = useState(unterhaltung.titel);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  async function speichern() {
    const titel = wert.trim();
    if (titel === "") {
      setFehler(t("fehler.eingabe_ungueltig"));
      return;
    }
    setLaeuft(true);
    const r = await apiFetch<{ unterhaltung: UnterhaltungInfo }>(
      "PATCH",
      CHAT_PFADE.unterhaltung(unterhaltung.id),
      { title: titel },
    );
    setLaeuft(false);
    if (r.ok) onFertig(r.daten.unterhaltung);
    else setFehler(r.fehler.text);
  }
  return (
    <form
      className={styles.dialogForm}
      onSubmit={(e) => {
        e.preventDefault();
        void speichern();
      }}
    >
      <TextField
        label={t("chat.umbenennen.feld")}
        value={wert}
        maxLength={LIMITS.conversationTitleChars}
        onChange={(e) => setWert(e.target.value)}
        {...(fehler ? { fehler } : {})}
        data-erster-fokus
      />
      <div className={styles.dialogAktionen}>
        <Button art="zweit" onClick={onAbbrechen}>
          {t("allgemein.abbrechen")}
        </Button>
        <Button art="primaer" type="submit" laedt={laeuft}>
          {t("allgemein.speichern")}
        </Button>
      </div>
    </form>
  );
}

function Loeschen({
  unterhaltung,
  onFertig,
  onAbbrechen,
}: {
  unterhaltung: UnterhaltungInfo;
  onFertig: () => void;
  onAbbrechen: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<ApiErrorDetail | undefined>();
  async function loeschen() {
    setLaeuft(true);
    const r = await apiFetch("DELETE", CHAT_PFADE.unterhaltung(unterhaltung.id));
    setLaeuft(false);
    if (r.ok) onFertig();
    else setFehler(r.fehler);
  }
  return (
    <div className={styles.dialogForm}>
      <p className={styles.absatz}>{t("chat.loeschen.text")}</p>
      {fehler && (
        <p className={styles.dialogFehler} role="alert">
          {fehler.text} {fehler.ausweg}
        </p>
      )}
      <div className={styles.dialogAktionen}>
        <Button art="zweit" onClick={onAbbrechen} data-erster-fokus>
          {t("allgemein.abbrechen")}
        </Button>
        <Button art="gefahr" laedt={laeuft} onClick={() => void loeschen()}>
          {t("allgemein.loeschen")}
        </Button>
      </div>
    </div>
  );
}
