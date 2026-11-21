/**
 * PaiBot – Haken für den Avatar der Chat-Seite: hält die zwei kurzen Merkmale („fertig“, „Fehler“),
 * gibt dem Avatar Ausdrücke und Text-Stücke aus den Ereignissen und räumt seinen Zeitgeber ab.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { ConversationEvent } from "@paibot/shared/ereignisse";
import type { AvatarLebendigSteuerung } from "@paibot/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AvatarMerker,
  type AvatarMerkmale,
  avatarAufEreignis,
  type ChatAvatarAusdruck,
} from "../../../lib/chat/avatar";

export interface ChatAvatarSteuerung {
  /** An den Avatar im Kopf der Seite hängen (`ref`). */
  avatarRef: React.RefObject<AvatarLebendigSteuerung | null>;
  merkmale: AvatarMerkmale;
  /** Ein Ereignis aus dem Lauf-Strom ist angekommen. */
  ereignis(e: ConversationEvent): void;
  /** Einmaliger Ausdruck, z. B. nach dem Senden. */
  ausdruck(name: ChatAvatarAusdruck): void;
  /** Der Besitzer tippt oder sendet etwas Neues. */
  neuesAnfangen(): void;
  /** Blick neu ausrichten (die Schreibstelle hat sich bewegt). */
  blickNeu(): void;
}

export function useChatAvatar(): ChatAvatarSteuerung {
  const avatarRef = useRef<AvatarLebendigSteuerung | null>(null);
  const [merkmale, setMerkmale] = useState<AvatarMerkmale>({ fertig: false, fehler: false });
  const merker = useRef<AvatarMerker | null>(null);

  useEffect(() => {
    const m = new AvatarMerker(setMerkmale, {
      setze: (fn, ms) => setTimeout(fn, ms),
      loesche: (z) => clearTimeout(z as ReturnType<typeof setTimeout>),
    });
    merker.current = m;
    return () => {
      m.stop();
      merker.current = null;
    };
  }, []);

  const ereignis = useCallback((e: ConversationEvent) => {
    const a = avatarAufEreignis(e);
    merker.current?.anwenden(a);
    if (a.textStueck !== undefined) avatarRef.current?.textStueck(a.textStueck);
    if (a.ausdruck !== undefined) avatarRef.current?.ausdruck(a.ausdruck);
  }, []);
  const ausdruck = useCallback((name: ChatAvatarAusdruck) => {
    avatarRef.current?.ausdruck(name);
  }, []);
  const neuesAnfangen = useCallback(() => merker.current?.neuesAnfangen(), []);
  const blickNeu = useCallback(() => avatarRef.current?.blickNeu(), []);
  return { avatarRef, merkmale, ereignis, ausdruck, neuesAnfangen, blickNeu };
}
