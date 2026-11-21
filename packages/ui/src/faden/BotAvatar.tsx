/**
 * PaiBot – Avatar eines Bots im Faden: der lebendige Avatar mit Farbe, Form und Zustand des Bots.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { AvatarShape, BotColor } from "@paibot/shared/objekte";
import { AvatarLebendig } from "../avatar-lebendig/AvatarLebendig";
import type { AvatarLebendigZustand } from "../avatar-lebendig/daten";

export interface BotAvatarProps {
  farbe: BotColor;
  form?: AvatarShape;
  zustand?: AvatarLebendigZustand;
  groesse?: number;
  /** Ohne Bewegung (Listen, Stapel). */
  still?: boolean;
  /** Name für Bildschirmleser; ohne ihn ist der Avatar Schmuck neben einem sichtbaren Namen. */
  titel?: string;
}

/**
 * Der Avatar eines Bots. Der Zustand kommt immer von außen (aus Ereignissen des Servers); der
 * Baustein rät nichts. In Listen und Stapeln steht er still.
 */
export function BotAvatar({
  farbe,
  form,
  zustand = "ruhig",
  groesse = 24,
  still,
  titel,
}: BotAvatarProps) {
  return (
    <AvatarLebendig
      farbe={farbe}
      {...(form ? { form } : {})}
      zustand={zustand}
      groesse={groesse}
      {...(still !== undefined ? { still } : {})}
      {...(titel ? { titel } : {})}
    />
  );
}

/** Mehrere Avatare leicht überlappend. */
export function AvatarStapel({
  bots,
  groesse = 20,
  ueberlappung = 6,
}: {
  bots: readonly {
    id: string;
    farbe: BotColor;
    form?: AvatarShape;
    zustand?: AvatarLebendigZustand;
  }[];
  groesse?: number;
  ueberlappung?: number;
}) {
  return (
    <span style={{ display: "inline-flex" }} aria-hidden="true">
      {bots.map((b, i) => (
        <span key={b.id} style={i === 0 ? undefined : { marginLeft: -ueberlappung }}>
          <BotAvatar
            farbe={b.farbe}
            {...(b.form ? { form: b.form } : {})}
            zustand={b.zustand ?? "ruhig"}
            groesse={groesse}
            still
          />
        </span>
      ))}
    </span>
  );
}
