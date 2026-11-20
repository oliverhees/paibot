/**
 * PaiBot – Hilfen für die Tests des Ereignis-Stroms: Meldungs-Quelle über PGlite mit Zählern,
 * Zeitgeber mit Zählern, Leser für SSE-Antworten, Beispiel-Unterhaltung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Database } from "@paibot/db";
import { bots, conversations } from "@paibot/db/repo";
import type { ConversationId } from "@paibot/shared/ids";
import type { Uhr } from "./strom";
import type { MeldungsAbo, MeldungsQuelle } from "./verteiler";

/** Meldungs-Quelle über PGlite; zählt LISTEN und UNLISTEN und kann einen Wiederaufbau vorspielen. */
/** Was PGlite für `listen` anbietet (Ausschnitt). */
export interface PgliteListen {
  listen(kanal: string, beiMeldung: (nutzlast: string) => void): Promise<() => Promise<void>>;
}

export function pgliteQuelle(client: PgliteListen) {
  const stand = { listen: 0, unlisten: 0, aktiv: 0 };
  const bereit = new Set<() => void>();
  const quelle: MeldungsQuelle = {
    async listen(kanal, beiMeldung, beiBereit): Promise<MeldungsAbo> {
      stand.listen += 1;
      const ab = await client.listen(kanal, beiMeldung);
      stand.aktiv += 1;
      bereit.add(beiBereit);
      beiBereit();
      return {
        async unlisten() {
          stand.unlisten += 1;
          stand.aktiv -= 1;
          bereit.delete(beiBereit);
          await ab();
        },
      };
    },
  };
  return {
    quelle,
    stand,
    /** Spielt vor, dass die Verbindung neu aufgebaut wurde (Meldungen dazwischen verloren). */
    wiederaufbau() {
      for (const fn of bereit) fn();
    },
  };
}

/** Meldungs-Quelle, die nichts meldet (für Tests, in denen nur gezählt wird). */
export function stilleQuelle() {
  const stand = { listen: 0, unlisten: 0 };
  const quelle: MeldungsQuelle = {
    async listen() {
      stand.listen += 1;
      return {
        async unlisten() {
          stand.unlisten += 1;
        },
      };
    },
  };
  return { quelle, stand };
}

/** Echte Zeitgeber, aber gezählt: `offen` ist die Zahl noch nicht gelöschter Zeitgeber. */
export function zaehlUhr(): Uhr & { readonly offen: number } {
  const aktiv = new Set<unknown>();
  return {
    setInterval(fn, ms) {
      const h = setInterval(fn, ms);
      aktiv.add(h);
      return h;
    },
    clearInterval(h) {
      aktiv.delete(h);
      clearInterval(h as ReturnType<typeof setInterval>);
    },
    setTimeout(fn, ms) {
      const h = setTimeout(() => {
        aktiv.delete(h);
        fn();
      }, ms);
      aktiv.add(h);
      return h;
    },
    clearTimeout(h) {
      aktiv.delete(h);
      clearTimeout(h as ReturnType<typeof setTimeout>);
    },
    get offen() {
      return aktiv.size;
    },
  };
}

/** Ein SSE-Block, zerlegt in Felder. */
export interface SseBlock {
  roh: string;
  id?: string;
  event?: string;
  data?: string;
  retry?: string;
  kommentar?: string;
}

function zerlegen(roh: string): SseBlock {
  const block: SseBlock = { roh };
  for (const zeile of roh.split("\n")) {
    if (zeile.startsWith(":")) block.kommentar = zeile.slice(1).trimStart();
    else {
      const i = zeile.indexOf(":");
      const name = i < 0 ? zeile : zeile.slice(0, i);
      const wert = i < 0 ? "" : zeile.slice(i + 1).replace(/^ /, "");
      if (name === "id" || name === "event" || name === "data" || name === "retry") {
        block[name] = wert;
      }
    }
  }
  return block;
}

/** Liest eine SSE-Antwort Block für Block. */
export function sseLeser(strom: ReadableStream<Uint8Array>) {
  const reader = strom.getReader();
  const dekodierer = new TextDecoder();
  let puffer = "";
  let ende = false;
  const bloecke: SseBlock[] = [];
  let offen: Promise<ReadableStreamReadResult<Uint8Array>> | undefined;

  async function mehr(bisMs: number): Promise<boolean> {
    let zeitgeber: ReturnType<typeof setTimeout> | undefined;
    const zeit = new Promise<"zeit">((r) => {
      zeitgeber = setTimeout(() => r("zeit"), bisMs);
    });
    try {
      offen ??= reader.read();
      const teil = await Promise.race([offen, zeit]);
      if (teil === "zeit") return false;
      offen = undefined;
      if (teil.done) {
        ende = true;
        return false;
      }
      puffer += dekodierer.decode(teil.value, { stream: true });
      let i = puffer.indexOf("\n\n");
      while (i >= 0) {
        bloecke.push(zerlegen(puffer.slice(0, i)));
        puffer = puffer.slice(i + 2);
        i = puffer.indexOf("\n\n");
      }
      return true;
    } finally {
      clearTimeout(zeitgeber);
    }
  }

  return {
    bloecke,
    get ende() {
      return ende;
    },
    /** Liest, bis `bedingung` gilt oder `ms` vergangen sind. */
    async bis(bedingung: (b: SseBlock[]) => boolean, ms = 3000): Promise<SseBlock[]> {
      const grenze = Date.now() + ms;
      while (!bedingung(bloecke)) {
        if (ende) throw new Error(`Strom zu Ende; ${bloecke.length} Blöcke`);
        const rest = grenze - Date.now();
        if (rest <= 0) throw new Error(`Zeit abgelaufen; ${bloecke.length} Blöcke`);
        await mehr(rest);
      }
      return bloecke;
    },
    /** Liest bis `ms` lang alles, was kommt. */
    async sammeln(ms: number): Promise<SseBlock[]> {
      const grenze = Date.now() + ms;
      while (!ende && Date.now() < grenze) await mehr(grenze - Date.now());
      return bloecke;
    },
    /** Liest bis zum Ende des Stroms. */
    async bisEnde(ms = 3000): Promise<SseBlock[]> {
      const grenze = Date.now() + ms;
      while (!ende) {
        if (Date.now() > grenze) throw new Error("Strom endet nicht");
        await mehr(grenze - Date.now());
      }
      return bloecke;
    },
    ereignisse(): SseBlock[] {
      return bloecke.filter((b) => b.event !== undefined);
    },
    nummern(): number[] {
      return bloecke.filter((b) => b.id !== undefined).map((b) => Number(b.id));
    },
    async abbrechen() {
      await reader.cancel();
    },
  };
}

/** Legt einen Bot und eine Unterhaltung an. */
export async function beispielUnterhaltung(
  db: Database,
  titel = "Beispiel",
): Promise<ConversationId> {
  const bot = await bots.create(db, {
    name: `Pai ${titel} ${Math.random().toString(36).slice(2, 8)}`,
    avatarShape: "blatt",
    color: "violett",
  });
  const unterhaltung = await conversations.create(db, { botId: bot.id, title: titel });
  return unterhaltung.id;
}

/** Wartet, bis `bedingung` gilt. */
export async function warten(bedingung: () => boolean, ms = 3000): Promise<void> {
  const grenze = Date.now() + ms;
  while (!bedingung()) {
    if (Date.now() > grenze) throw new Error("Zeit abgelaufen");
    await new Promise((r) => setTimeout(r, 10));
  }
}
