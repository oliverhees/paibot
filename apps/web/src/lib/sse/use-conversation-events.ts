/**
 * PaiBot – React-Hook für den Ereignis-Strom einer Unterhaltung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import type { ConversationEvent } from "@paibot/shared/ereignisse";
import type { ConversationId } from "@paibot/shared/ids";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Verbindung, type VerbindungsZustand, verbindeEreignisse } from "./client-kern";

export interface ConversationEventsOptionen {
  /** Wird für jedes neue Ereignis genau einmal gerufen, in aufsteigender Nummer. */
  onEvent: (ereignis: ConversationEvent) => void;
  /** Letzte schon bekannte Nummer (z. B. aus dem geladenen Verlauf); gilt beim Verbinden. */
  nachSeq?: number;
  /** `false` trennt die Verbindung (Standard `true`). */
  aktiv?: boolean;
}

export interface ConversationEventsErgebnis {
  zustand: VerbindungsZustand;
  /** Verbindet sofort neu ab der letzten Nummer (z. B. Knopf „Neu verbinden“). */
  neuVerbinden: () => void;
}

/**
 * Hält eine Verbindung zum Ereignis-Strom der Unterhaltung. Wechselt die Unterhaltung oder wird die
 * Komponente entfernt, wird die alte Verbindung geschlossen.
 */
export function useConversationEvents(
  conversationId: ConversationId | undefined,
  optionen: ConversationEventsOptionen,
): ConversationEventsErgebnis {
  const aktiv = optionen.aktiv !== false && conversationId !== undefined;
  const [zustand, setZustand] = useState<VerbindungsZustand>(aktiv ? "verbindet_neu" : "getrennt");
  const onEvent = useRef(optionen.onEvent);
  const nachSeq = useRef(optionen.nachSeq);
  const verbindung = useRef<Verbindung | undefined>(undefined);

  useEffect(() => {
    onEvent.current = optionen.onEvent;
    nachSeq.current = optionen.nachSeq;
  });

  useEffect(() => {
    if (!aktiv || conversationId === undefined) {
      setZustand("getrennt");
      return;
    }
    setZustand("verbindet_neu");
    const aktuelle = verbindeEreignisse({
      conversationId,
      nachSeq: nachSeq.current,
      onEvent: (ereignis) => onEvent.current(ereignis),
      onZustand: setZustand,
    });
    verbindung.current = aktuelle;
    return () => {
      aktuelle.schliessen();
      if (verbindung.current === aktuelle) verbindung.current = undefined;
    };
  }, [conversationId, aktiv]);

  const neuVerbinden = useCallback(() => verbindung.current?.neuVerbinden(), []);
  return { zustand, neuVerbinden };
}
