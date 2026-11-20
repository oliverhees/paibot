/**
 * PaiBot – Sichere Markdown-Darstellung für Antworten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { EntwurfBlock, type EntwurfTexte } from "./EntwurfBlock";
import styles from "./Markdown.module.css";
import { sichereUrl } from "./sichereUrl";

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

export interface MarkdownProps {
  /** Antworttext des Bots in Markdown. */
  text: string;
  /** Texte für abgesetzte Blöcke (Etikett, Kopieren, Kopiert). */
  blockTexte: EntwurfTexte;
}

/**
 * Zeigt Markdown sicher an: kein rohes HTML, keine Bilder (Bild-Markdown wird zum Link
 * bzw. Text und nie geladen), Links nur mit http/https und `rel="noopener noreferrer"`.
 */
export function Markdown({ text, blockTexte }: MarkdownProps) {
  const komponenten: Components = {
    a: ({ href, children }) => {
      const ziel = sichereUrl(href);
      if (!ziel) return <span>{children}</span>;
      return (
        <a href={ziel} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    img: ({ src, alt }) => {
      const ziel = sichereUrl(typeof src === "string" ? src : undefined);
      const beschriftung = alt || ziel || "";
      if (!ziel) return <span>{beschriftung}</span>;
      return (
        <a href={ziel} target="_blank" rel="noopener noreferrer">
          {beschriftung}
        </a>
      );
    },
    pre: ({ node }) => {
      const knoten = node as unknown as HastKnoten | undefined;
      const inhalt = textVon(knoten).replace(/\n$/, "");
      return <EntwurfBlock text={inhalt} texte={blockTexte} sprache={spracheVon(knoten)} />;
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
        {text}
      </ReactMarkdown>
    </div>
  );
}
