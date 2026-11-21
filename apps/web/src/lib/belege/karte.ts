/**
 * PaiBot – Inhalt der Beleg-Karte in Nutzer-Sprache (nur Server): was, wer, wann, Entscheidung mit
 * Regeln und Fassung, Vorbedingungen und Grenzen in Worten, Ergebnis mit Status und Token, Verweise.
 * Liefert nur Daten (Texte und Verweise), die Oberfläche setzt sie als Text, nie als HTML.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { canonicalize } from "@paibot/receipts/pruefen";
import type { PublicKeyInfo } from "@paibot/shared/belege";
import { ERROR_CODES, type ErrorCode } from "@paibot/shared/fehler";
import { errorText, isTextKey, t } from "@paibot/shared/texte";
import { LIMITS_BY_ID, PRECONDITIONS } from "@paibot/shared/tor";
import { ergebnis, kennung, wasText, wer, zeitText } from "./darstellung";
import type { BelegUmfeld } from "./lesen";

/** Ein Stück Text in einer Zeile; mit `href` ein Verweis innerhalb der App. */
export interface KartenTeil {
  text: string;
  mono?: boolean;
  leise?: boolean;
  href?: string;
}

/** Eine Zeile der Karte mit einer oder mehreren Textzeilen. */
export interface KartenZeile {
  titel: string;
  zeilen: KartenTeil[][];
}

export interface BelegKarteDaten {
  id: string;
  seq: number;
  kennung: string;
  titel: string;
  artText: string;
  zeilen: KartenZeile[];
  technik: {
    json: string;
    hash: string;
    signatur: string;
    schluessel: string;
    vorgaenger: string;
  };
}

type Roh = Record<string, unknown>;

function objekt(wert: unknown): Roh | undefined {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert)
    ? (wert as Roh)
    : undefined;
}

function liste(wert: unknown): Roh[] {
  return Array.isArray(wert) ? wert.map(objekt).filter((x): x is Roh => x !== undefined) : [];
}

function str(wert: unknown): string {
  return typeof wert === "string" || typeof wert === "number" ? String(wert) : "–";
}

function regelName(id: string): string {
  const schluessel = `regel.${id}`;
  return isTextKey(schluessel) ? t(schluessel as "regel.R-001") : id;
}

const VORBEDINGUNG_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PRECONDITIONS).map(([id, v]) => [v.name, id]),
);
const GRENZE_ID: Record<string, string> = Object.fromEntries(
  Object.entries(LIMITS_BY_ID).map(([id, name]) => [name, id]),
);

function vorbedingungErgebnis(wert: unknown): string {
  if (wert === "ok") return t("belege.vorbedingung.ok");
  if (wert === "verletzt") return t("belege.vorbedingung.verletzt");
  return t("belege.vorbedingung.entfaellt");
}

function grenzeErgebnis(wert: unknown): string {
  if (wert === "ok") return t("belege.grenze.ok");
  if (wert === "verletzt") return t("belege.grenze.verletzt");
  return t("belege.grenze.entfaellt");
}

function stufeText(wert: unknown): string {
  return wert === "ask" || wert === "prepare" || wert === "execute"
    ? t(`belege.stufe.${wert}`)
    : str(wert);
}

function kurzePruefsumme(hash: string): string {
  const hex = hash.replace(/^sha256:/, "");
  return hex.length > 12 ? `${hex.slice(0, 4)} ${hex.slice(4, 8)} … ${hex.slice(-4)}` : hex;
}

export interface KartenKontext {
  zeitzone: string;
  botNamen?: Readonly<Record<string, string>>;
  schluessel?: readonly PublicKeyInfo[];
}

/** Baut den Inhalt der Karte aus einem Beleg und seinem Umfeld. */
export function belegKarte(umfeld: BelegUmfeld, kontext: KartenKontext): BelegKarteDaten {
  const { beleg } = umfeld;
  const body = objekt(beleg.body);
  const typ = body?.type;
  const zeilen: KartenZeile[] = [];
  const aktion = objekt(body?.action);
  const ziel = objekt(aktion?.target);

  // Was
  const was: KartenTeil[][] = [[{ text: wasText(beleg) }]];
  if (typeof ziel?.conversationId === "string") {
    was.push([
      {
        text: t("belege.karte.zur_unterhaltung"),
        href: `/chat/${encodeURIComponent(ziel.conversationId)}`,
        leise: true,
      },
    ]);
  }
  zeilen.push({ titel: t("belege.karte.was"), zeilen: was });
  zeilen.push({
    titel: t("belege.karte.art"),
    zeilen: [[{ text: t(`belege.art.${artVon(typ)}`) }]],
  });
  zeilen.push({
    titel: t("belege.karte.wer"),
    zeilen: [[{ text: wer(beleg, kontext.botNamen).text }]],
  });
  zeilen.push({
    titel: t("belege.karte.wann"),
    zeilen: [[{ text: zeitText(beleg, kontext.zeitzone, true) }]],
  });

  if (typ === "decision") {
    const d = objekt(body?.decision);
    zeilen.push({
      titel: t("belege.karte.entscheidung"),
      zeilen: [
        [
          { text: ergebnis(beleg).text },
          { text: t("belege.karte.stufe", { stufe: stufeText(d?.stage) }), leise: true },
        ],
        [{ text: str(d?.reason), leise: true }],
      ],
    });
    const regeln = liste(d?.rules);
    zeilen.push({
      titel: t("belege.karte.regeln"),
      zeilen:
        regeln.length === 0
          ? [[{ text: t("belege.karte.keine"), leise: true }]]
          : regeln.map((r) => [
              { text: `„${regelName(str(r.id))}“` },
              { text: str(r.id), mono: true, leise: true },
              { text: t("belege.karte.fassung", { fassung: str(r.version) }), leise: true },
              ...(typeof r.hash === "string"
                ? [{ text: kurzePruefsumme(r.hash), mono: true, leise: true }]
                : []),
            ]),
    });
    zeilen.push({
      titel: t("belege.karte.regelstand"),
      zeilen: [
        [
          d?.ruleStand === undefined
            ? { text: t("belege.karte.regelstand_fehlt"), leise: true }
            : { text: str(d.ruleStand) },
        ],
      ],
    });
    const vorbedingungen = liste(d?.preconditions);
    if (vorbedingungen.length > 0) {
      zeilen.push({
        titel: t("belege.karte.vorbedingungen"),
        zeilen: vorbedingungen.map((v) => {
          const id = VORBEDINGUNG_ID[str(v.name)] ?? str(v.name);
          return [
            { text: id, mono: true, leise: true },
            { text: `${regelName(id)}: ${vorbedingungErgebnis(v.result)}` },
          ];
        }),
      });
    }
    const grenzen = liste(d?.limits);
    if (grenzen.length > 0) {
      zeilen.push({
        titel: t("belege.karte.grenzen"),
        zeilen: grenzen.map((g) => {
          const id = GRENZE_ID[str(g.name)] ?? str(g.name);
          const wert = g.value === undefined ? "" : ` (${str(g.value)})`;
          return [
            { text: id, mono: true, leise: true },
            { text: `${regelName(id)}: ${grenzeErgebnis(g.result)}${wert}` },
          ];
        }),
      });
    }
  } else if (typ === "result") {
    const r = objekt(body?.result);
    const ergebnisZeilen: KartenTeil[][] = [[{ text: ergebnis(beleg).text }]];
    if (typeof r?.code === "string" && (ERROR_CODES as readonly string[]).includes(r.code)) {
      ergebnisZeilen.push([{ text: errorText(r.code as ErrorCode), leise: true }]);
    }
    zeilen.push({ titel: t("belege.karte.ergebnis"), zeilen: ergebnisZeilen });
    const tokens = objekt(r?.tokens);
    if (tokens !== undefined) {
      zeilen.push({
        titel: t("belege.karte.tokens"),
        zeilen: [
          [
            {
              text: t("belege.karte.tokens_wert", {
                rein: str(tokens.input),
                raus: str(tokens.output),
              }),
            },
          ],
        ],
      });
    }
  } else if (typ === "start") {
    const f = objekt(body?.facts);
    const fp = kontext.schluessel?.find((s) => s.keyId === body?.keyId)?.fingerprint;
    zeilen.push({
      titel: t("belege.karte.installation"),
      zeilen: [[{ text: str(f?.installationId), mono: true }]],
    });
    zeilen.push({
      titel: t("belege.karte.schluessel"),
      zeilen: [
        [
          { text: str(body?.keyId), mono: true },
          ...(fp ? [{ text: fp, mono: true, leise: true }] : []),
        ],
      ],
    });
    zeilen.push({
      titel: t("belege.karte.software"),
      zeilen: [[{ text: str(f?.software), mono: true }]],
    });
  } else if (typ === "key_change") {
    const f = objekt(body?.facts);
    zeilen.push({
      titel: t("belege.karte.neuer_schluessel"),
      zeilen: [[{ text: str(f?.newKeyId), mono: true }]],
    });
    if (f?.previousKeyId !== undefined) {
      zeilen.push({
        titel: t("belege.karte.bisheriger_schluessel"),
        zeilen: [[{ text: str(f.previousKeyId), mono: true }]],
      });
    }
    zeilen.push({
      titel: t("belege.karte.beglaubigung"),
      zeilen: [
        [
          {
            text:
              f?.signedBy === "previous"
                ? t("belege.karte.beglaubigt")
                : t("belege.karte.nicht_beglaubigt"),
          },
        ],
      ],
    });
  }

  if (umfeld.partner !== undefined) {
    zeilen.push({
      titel:
        umfeld.partner.art === "result"
          ? t("belege.karte.ergebnis_beleg")
          : t("belege.karte.entscheidungs_beleg"),
      zeilen: [
        [
          {
            text: kennung(umfeld.partner.seq),
            mono: true,
            href: `/belege/${encodeURIComponent(umfeld.partner.id)}`,
          },
        ],
      ],
    });
  }

  zeilen.push({
    titel: t("belege.karte.kennung"),
    zeilen: [
      [
        { text: kennung(beleg.seq), mono: true },
        { text: kurzePruefsumme(str(beleg.hash)), mono: true, leise: true },
      ],
    ],
  });

  const kette: KartenTeil[] = [];
  if (umfeld.vorgaenger !== undefined) {
    kette.push({
      text: kennung(umfeld.vorgaenger.seq),
      mono: true,
      href: `/belege/${encodeURIComponent(umfeld.vorgaenger.id)}`,
    });
  }
  kette.push({ text: kennung(beleg.seq), mono: true });
  if (umfeld.nachfolger !== undefined) {
    kette.push({
      text: kennung(umfeld.nachfolger.seq),
      mono: true,
      href: `/belege/${encodeURIComponent(umfeld.nachfolger.id)}`,
    });
  }
  const ketteZeilen: KartenTeil[][] = [kette];
  if (umfeld.vorgaenger !== undefined) {
    ketteZeilen.push([
      {
        text: t("belege.karte.enthaelt", { kennung: kennung(umfeld.vorgaenger.seq) }),
        leise: true,
      },
    ]);
  }
  zeilen.push({ titel: t("belege.karte.kette"), zeilen: ketteZeilen });

  let json: string;
  try {
    json = canonicalize(beleg.body as never);
  } catch {
    json = JSON.stringify(beleg.body);
  }
  return {
    id: String(beleg.id),
    seq: beleg.seq,
    kennung: kennung(beleg.seq),
    titel: wasText(beleg),
    artText: t(`belege.art.${artVon(typ)}`),
    zeilen,
    technik: {
      json,
      hash: str(beleg.hash),
      signatur: str(beleg.signature),
      schluessel: str(beleg.keyId),
      vorgaenger: str(body?.prev),
    },
  };
}

function artVon(typ: unknown): "start" | "decision" | "result" | "key_change" | "unbekannt" {
  return typ === "start" || typ === "decision" || typ === "result" || typ === "key_change"
    ? typ
    : "unbekannt";
}
