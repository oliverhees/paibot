/**
 * PaiBot – Sichere Markdown-Darstellung für Antworten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { EntwurfBlock, type EntwurfTexte } from "./EntwurfBlock";
import styles from "./Markdown.module.css";
import { ohneSchreibrichtung, sichereUrl } from "./sichereUrl";

interface HastKnoten {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastKnoten[];
}

function textVon(knoten: HastKnoten | undefined): string {
  if (!knoten) return "";
  if (knoten.type === "text") return knoten.value ?? "";
  return (knoten.children ?? []).map(textVon).join("");
}

function spracheVon(knoten: HastKnoten | undefined): string | undefined {
  const code = knoten?.children?.find((k) => k.tagName === "code");
  const klassen = code?.properties?.className;
  const liste = Array.isArray(klassen) ? klassen : [];
  const treffer = liste.find(
    (k): k is string => typeof k === "string" && k.startsWith("language-"),
  );
  return treffer?.slice("language-".length);
}

/** Längste sichtbare Ziel-Adresse neben einem Link. */
const ZIEL_ZEICHEN = 60;

/** Ziel eines Links zum Anzeigen: Host und Pfad, gekürzt (ohne Abfrage-Teil). */
export function linkZiel(url: string): string {
  const u = new URL(url);
  const pfad = u.pathname === "/" ? "" : u.pathname;
  const voll = `${u.host}${pfad}${u.search || u.hash ? "…" : ""}`;
  return voll.length > ZIEL_ZEICHEN ? `${voll.slice(0, ZIEL_ZEICHEN - 1)}…` : voll;
}

/** Steht das Ziel schon im Linktext? Dann braucht es keine zweite Angabe. */
function zielImText(text: string, url: string): boolean {
  const ohne = (s: string) =>
    s
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
  return ohne(text) === ohne(url) || ohne(text) === ohne(linkZiel(url));
}

/** Link mit sichtbarem Ziel: Linktext und Bild-Beschriftung können das Ziel sonst verbergen. */
function SichtbarerLink({
  ziel,
  text,
  children,
}: {
  ziel: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <>
      <a href={ziel} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
      {!zielImText(text, ziel) && <span className={styles.ziel}> ({linkZiel(ziel)})</span>}
    </>
  );
}

/**
 * Link aus fremder Quelle: nicht anklickbar, das ganze Ziel (mit Abfrage-Teil) steht als Text da.
 * Wer es öffnen will, kopiert es bewusst.
 */
function FremderLink({ ziel, children }: { ziel: string; children: ReactNode }) {
  return (
    <>
      <span>{children}</span>
      <span className={styles.ziel}>
        {" "}
        ({t("chat.link.fremd")} <code>{ziel}</code>)
      </span>
    </>
  );
}

export interface MarkdownProps {
  /** Antworttext des Bots in Markdown. */
  text: string;
  /**
   * Der Text stützt sich auf Inhalte aus einer fremden Quelle (etwa einer App): Links und Bilder
   * sind dann nicht anklickbar und zeigen ihr volles Ziel samt Abfrage-Teil, damit nichts
   * unbemerkt an eine fremde Adresse geht.
   */
  fremd?: boolean;
  /** Texte für abgesetzte Blöcke (Etikett, Kopieren, Kopiert). */
  blockTexte: EntwurfTexte;
  /** Ein abgesetzter Block wurde kopiert. */
  onKopiert?: () => void;
}

/**
 * Zeigt Markdown sicher an: kein rohes HTML, keine Bilder (Bild-Markdown wird zum Link
 * bzw. Text und nie geladen), Links nur mit http/https, mit `rel="noopener noreferrer nofollow"`
 * und sichtbarem Ziel.
 */
export function Markdown({ text, blockTexte, onKopiert, fremd = false }: MarkdownProps) {
  const komponenten: Components = {
    a: ({ href, children, node }) => {
      const ziel = sichereUrl(href);
      if (!ziel) return <span>{children}</span>;
      if (fremd) return <FremderLink ziel={ziel}>{children}</FremderLink>;
      return (
        <SichtbarerLink ziel={ziel} text={textVon(node as unknown as HastKnoten)}>
          {children}
        </SichtbarerLink>
      );
    },
    img: ({ src, alt }) => {
      const ziel = sichereUrl(typeof src === "string" ? src : undefined);
      const beschriftung = alt || ziel || "";
      if (!ziel) return <span>{beschriftung}</span>;
      if (fremd) return <FremderLink ziel={ziel}>{beschriftung}</FremderLink>;
      return (
        <SichtbarerLink ziel={ziel} text={beschriftung}>
          {beschriftung}
        </SichtbarerLink>
      );
    },
    pre: ({ node }) => {
      const knoten = node as unknown as HastKnoten | undefined;
      const inhalt = textVon(knoten).replace(/\n$/, "");
      const sprache = spracheVon(knoten);
      return (
        <EntwurfBlock
          text={inhalt}
          texte={blockTexte}
          {...(sprache === undefined ? {} : { sprache })}
          {...(onKopiert === undefined ? {} : { onKopiert })}
        />
      );
    },
  };
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => sichereUrl(url) ?? ""}
        components={komponenten}
      >
        {ohneSchreibrichtung(text)}
      </ReactMarkdown>
    </div>
  );
}
