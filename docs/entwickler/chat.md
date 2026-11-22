<!--
PaiBot – Entwickler-Doku: Chat (Unterhaltungen, Nachrichten, Läufe, Ereignis-Strom).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Chat – für Entwickler

**Anwender-Doku:** [Chat](../funktion-chat.md)

## Zweck und Entscheidung

Der Chat nimmt eine Nachricht an, lässt die Antwort im Hintergrund entstehen und überträgt sie Stück für Stück an den Browser. Beteiligt sind die Chat-Routen der Web-App (`apps/web/src/lib/chat/aktionen.ts`), die Warteschlange (`packages/jobs/`), der Worker (`apps/worker/`), die Lauf-Steuerung und der Motor (`packages/agents/`) und der Ereignis-Strom (`apps/web/src/lib/sse/`).

Belegte Entscheidungen im Code:

- **Senden ganz oder gar nicht:** Nachricht, Lauf, Ereignisse und Auftrag in der Warteschlange entstehen in einer Transaktion (`apps/web/src/lib/chat/aktionen.ts#nachrichtSenden`, `apps/web/src/lib/warteschlange.ts`, Kopfkommentar).
- **Keine Wiederholung:** Ein fehlgeschlagener Lauf wird nie wiederholt, „eine Modell-Antwort darf nicht doppelt entstehen“ (`packages/jobs/src/vertrag.ts#RUN_QUEUE`, `retryLimit: 0`); auch die Lauf-Steuerung wiederholt nie und fällt nie auf den direkten Weg zurück (Kommentar an `packages/agents/src/run/ausfuehren.ts#executeRun`).
- **Warteschlange in Postgres:** pg-boss im Schema `pgboss`; nur `packages/jobs/` kennt die Bibliothek (`packages/jobs/src/pgboss-queue.ts`, `packages/jobs/src/vertrag.ts#QUEUE_SCHEMA`).
- **Motor nur an einer Stelle:** Der Motor auf dem Vercel AI SDK steckt in `packages/agents/src/motor-aisdk.ts` und macht genau einen Modell-Schritt ohne Werkzeug-Ausführung (Kopfkommentar; `packages/agents/src/run/vertrag.ts#MAX_MOTOR_STEPS` ist 1).
- **Eine LISTEN-Verbindung je Prozess:** Meldungen gehen im Speicher an alle offenen Ströme (`apps/web/src/lib/sse/verteiler.ts`, Kopfkommentar).

## Aufbau

| Datei                                                  | Aufgabe                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/chat/aktionen.ts`                    | Chat-Routen: Unterhaltungen, Nachrichten senden, Stopp, neu erzeugen, Datenschleuse je Unterhaltung                                                                |
| `apps/web/src/lib/chat/laden.ts`                       | Lesen auf dem Server: Seitenleiste, Verlauf, kurze Belege, Bereitschaft                                                                                            |
| `apps/web/src/lib/chat/ansicht.ts`                     | Zustands-Kern der Ansicht als reine Funktionen (Ereignisse anwenden, Doppel verwerfen)                                                                             |
| `apps/web/src/lib/chat/export.ts`                      | Unterhaltung als Markdown-Datei; HTML, Bilder, Skript-Links und Steuerzeichen werden entschärft (`sichererInhalt`)                                                 |
| `apps/web/src/lib/chat/suche.ts`                       | Suche in Titeln und Nachrichten                                                                                                                                    |
| `apps/web/src/lib/chat/fassungen.ts`                   | Fassungen einer neu erzeugten Antwort                                                                                                                              |
| `apps/web/src/lib/warteschlange.ts`                    | Warteschlange der Web-App zum Einreihen                                                                                                                            |
| `apps/web/src/lib/sse/ereignis-route.ts`               | Route des Ereignis-Stroms: Sitzung, Eingaben, Platz, Strom                                                                                                         |
| `apps/web/src/lib/sse/strom.ts`                        | ein Strom: erst LISTEN, dann nachholen, dann live                                                                                                                  |
| `apps/web/src/lib/sse/verteiler.ts`                    | gemeinsame LISTEN-Verbindung                                                                                                                                       |
| `apps/web/src/lib/sse/grenzen.ts`                      | Zeiten, Puffer, Anzahl Ströme (`STROM_GRENZEN`)                                                                                                                    |
| `apps/web/src/lib/sse/use-conversation-events.ts`      | React-Hook `useConversationEvents`                                                                                                                                 |
| `packages/jobs/src/index.ts`                           | `createQueue`; `packages/jobs/src/pgboss-queue.ts` (`jobIdForRun`)                                                                                                 |
| `packages/agents/src/run/ausfuehren.ts`                | `executeRun`: ein Lauf von der Nachricht bis zur Antwort                                                                                                           |
| `packages/agents/src/run/kontext.ts`                   | Kontext in einem Lesestand, Verlauf begrenzen, Fakten von `modell.anfragen`                                                                                        |
| `packages/agents/src/run/strom.ts`                     | Text-Stücke bündeln und als `text.delta` schreiben                                                                                                                 |
| `packages/agents/src/run/waechter.ts`                  | Herzschlag, Abbruch-Wunsch, Not-Aus, Zeitgrenzen; hält nach `GUARD_READ_FAILURES` Lesefehlern oder `GUARD_READ_TIMEOUT_MS` hängendem Lesen an                      |
| `packages/agents/src/run/aufraeumen.ts`                | `failStaleRuns`: hängende Läufe beenden; der Worker ruft es auch im Betrieb regelmäßig auf (`startStaleCleanup`, `staleIntervalMs` in `apps/worker/src/worker.ts`) |
| `packages/agents/src/prompt.ts`                        | Anweisung an das Modell (`buildSystemPrompt`)                                                                                                                      |
| `packages/agents/src/motor-aisdk.ts`                   | Motor (`createAiSdkMotor`)                                                                                                                                         |
| `apps/worker/src/worker.ts`                            | Rolle `worker`: Start, Warteschlange, sauberes Ende                                                                                                                |
| `apps/worker/src/lauf.ts`                              | Auftrag bearbeiten; scheitert die Steuerung, Lauf als fehlgeschlagen abschließen (`failRun`)                                                                       |
| `apps/worker/src/abhaengigkeiten.ts`                   | echte Abhängigkeiten eines Laufs: Datenbank, Tor, Motor, Datenschleuse                                                                                             |
| `apps/web/src/app/(app)/chat/ChatSeite.tsx`            | Oberfläche; Seite einer Unterhaltung `apps/web/src/app/(app)/chat/[id]/page.tsx`                                                                                   |
| `apps/web/src/lib/chat/anzeige.ts`                     | Texte und Ziele zu Fehlern; `tagesbudgetAusweg`: bei Ablehnung durch G-04 (Begründung im Ende des Laufs oder im Beleg „Entscheidung“) Ausweg und Link zu den Grenzen |
| `apps/web/src/lib/chat/avatar.ts`                      | Zustand und Ausdruck des Avatars aus Ereignissen (`avatarZustand`, `avatarAufEreignis`, `AvatarMerker` für „fertig“ und Fehler)                                    |
| `apps/web/src/app/(app)/chat/useChatAvatar.ts`         | Haken: hält den Merker, gibt dem Avatar Text-Stücke und Ausdrücke, räumt den Zeitgeber ab                                                                          |
| `apps/web/src/lib/chat/startbereich.ts`                | Wahl der Fassung des Startbereichs: Standard, Prüfung, Cookie `paibot_startbereich`                                                                                |
| `packages/ui/src/startbereich/`                        | Bausteine des Startbereichs (`Startbereich`, drei Fassungen, `StartStilleSitz`, Gruß nach Tageszeit)                                                               |
| `packages/ui/src/avatar-lebendig/`                     | Baustein `AvatarLebendig` (Standbild aus Daten, Takt in `leben.ts`)                                                                                                |
| `apps/web/src/app/(app)/einstellungen/Darstellung.tsx` | Reiter „Darstellung“: Wahl der Fassung mit Vorschau                                                                                                                |
| `packages/ui/src/chat/ChatEingabe.tsx`                 | Eingabefeld: Fokus kehrt nach Senden oder Stopp zurück (`fokusZurueck` in `packages/ui/src/chat/eingabe.ts`); gesperrte Plätze für noch nicht gebaute Funktionen   |

Datenfluss einer Nachricht:

1. `POST /api/unterhaltungen/:id/nachrichten` → `nachrichtSenden`: Weicht der Schalter der Datenschleuse ab, wird er zuerst umgeschaltet; dann `nachricht.senden` durch das Tor mit den Fakten `inputChars`, `maxInputChars`, `conversationExists`, `runActive`, `killSwitch` (`apps/web/src/lib/chat/aktionen.ts#nachrichtSenden`).
2. In der Ausführung, in einer Transaktion: Nachricht `user`, Lauf, Ereignisse `message.created` und `run.queued`, Auftrag einreihen. Antwort mit Status 202.
3. Der Worker holt den Auftrag ab und ruft `executeRun` (`apps/worker/src/lauf.ts#createRunHandler`).
4. `executeRun` (Kommentar in `packages/agents/src/run/ausfuehren.ts#executeRun`): Kontext laden; Lauf auf `running`, `run.started`; ohne Modell Ende mit `kein_modell`; Weg, Anweisung, Verlauf; `modell.anfragen` durch das Tor mit Akteur `bot:<id>`; nur in der Ausführung entsteht der Modell-Zugang (`resolveModel`) und läuft der Motor; Text als `text.delta`, am Ende `message.completed`.
5. Ende: `succeeded`, `cancelled` (`run.cancelled`, Teiltext bleibt), `failed` (`run.failed`, gegebenenfalls `schleuse.blockiert`) oder `denied` (`run.denied`).
6. Der Browser liest `GET /api/unterhaltungen/:id/ereignisse` und wendet die Ereignisse an (`apps/web/src/lib/chat/ansicht.ts`).

Sperr-Reihenfolge: Die Lauf-Steuerung hält nie eine Transaktion offen, während sie das Tor aufruft; der Beleg-Schreiber nimmt so immer zuerst die Beleg-Sperre (Kommentar an `executeRun`).

### Fäden: Oberfläche (Vorschau mit Beispiel-Daten)

Der Faden eines Teams ist ein ganz normaler Chat: dieselben Blasen (`packages/ui/src/chat/ChatBubble.module.css`), derselbe lebendige Avatar (`packages/ui/src/avatar-lebendig/AvatarLebendig.tsx`), dieselben Farben und Abstände (`packages/ui/src/tokens.css`). Die Bausteine liegen in `packages/ui/src/faden/` und sind **noch nicht an die App angeschlossen**: Sie bekommen alle Angaben als Eigenschaften (Typen in `packages/ui/src/faden/typen.ts`, keine Verträge mit dem Server), die Beispiele stehen in `packages/ui/src/faden/beispiel.ts` (erfundenes Team „Studio“). Die Vorschau gibt es nur mit `pnpm dev` unter `/_komponenten/faden` (`apps/web/src/app/%5Fkomponenten/faden/page.tsx`, `apps/web/src/app/%5Fkomponenten/nur-entwicklung.ts`); Szene und Thema stehen in der Adresse (`?szene=gross&thema=hell`).

| Datei                                    | Aufgabe                                                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/faden/Ansicht.tsx`      | `FadenAnsicht`: Seitenleiste, Kopfzeile, Kopf, Umschalter, Gespräch, Eingabe und Leiste zusammengesetzt; Zustand „leer“ (kein Team)     |
| `packages/ui/src/faden/Kopf.tsx`         | `FadenKopf`: Karte, schmale Zeile und Ergebnis-Karte; auf- und zuklappbar, Wahl im Browser gemerkt (`leseGemerkt`, `schreibeGemerkt`)   |
| `packages/ui/src/faden/Staffelstab.tsx`  | `StabBahn` und `StabVerdichtet`: wer führt, wer dran ist, wer als Nächstes kommt                                                        |
| `packages/ui/src/faden/Leiste.tsx`       | `FadenLeiste`: Reiter Ziele, Team, Lieferungen, Fragen, Belege; am Handy ein Blatt von unten mit Griffzeile                             |
| `packages/ui/src/faden/Gespraech.tsx`    | Beiträge, eingeklappte Gruppen mit Ergebnis-Zeile, Grenzen-Karte, Umschalter „Alles · Nur Ergebnisse · Nur an mich“                     |
| `packages/ui/src/faden/Zeilen.tsx`       | vom Server erkannte Zeilen mit Tor-Ergebnis, Beleg und aufklappbarem Zettel (`AuftragsZettel`)                                          |
| `packages/ui/src/faden/Fragen.tsx`       | Fragen an dich im Kopf (`FragenBand`) und in der Leiste (`FragenKarten`) mit Antwort-Vorschlägen                                        |
| `packages/ui/src/faden/Zulieferung.tsx`  | Zulieferung als Kärtchen                                                                                                                |
| `packages/ui/src/faden/BelegZeichen.tsx` | Beleg-Zeichen mit kleinem Fenster (Escape schließt, Fokus kehrt zurück)                                                                 |
| `packages/ui/src/faden/Marken.tsx`       | Marken „dran“, „führt“, „direkte Bitte“, „Leitung“, „aus fremden Inhalten“                                                              |
| `packages/ui/src/faden/Seitenleiste.tsx` | Pai, Teams mit Leitung und Mitgliedern (ab mehr als sechs „+N ruhig“), Fäden je Team, Not-Aus                                           |
| `packages/ui/src/faden/Eingabe.tsx`      | Eingabe mit @-Auswahl und Leiste „Aufrufen“; Hilfen in `packages/ui/src/faden/erwaehnung.ts`                                            |
| `packages/ui/src/faden/funktionen.ts`    | reine Funktionen: `kopfForm` (Schwellen), `ergebnisZeile`, `filtereGespraech`, `gueltigeMoeglichkeiten`, `vorschlagText`, `teamGruppen` |
| `packages/ui/src/faden/text.ts`          | Bot-Text für die Anzeige: `reinerText`, `sauberName`, `ersteZeile`                                                                      |
| `packages/shared/src/i18n/de.ts`         | feste Texte im Block `faden.*` am Ende der Datei                                                                                        |

Regeln der Oberfläche, jeweils mit ihrer Stelle:

- **Schwellen:** Ab fünf Zielen oder sechs Beteiligten startet der Kopf als schmale Zeile und die Leiste ist offen; darunter ist der Kopf offen und es gibt keine Leiste von selbst (`kopfForm`, `SCHWELLE_ZIELE`, `SCHWELLE_BETEILIGTE` in `packages/ui/src/faden/funktionen.ts`). Was der Besitzer wählt, merkt sich der Browser mit `try/catch` (`schreibeGemerkt` in `packages/ui/src/faden/Kopf.tsx`) und geht vor.
- **Bot-Text ist immer Text:** Er wird nie als HTML eingesetzt, nie als Bild-Adresse und nie als Link zum Anklicken (`BeitragsText` in `packages/ui/src/faden/Gespraech.tsx`). Namen werden auf eine Zeile und 40 Zeichen gekürzt, Richtungs-, unsichtbare und Steuerzeichen fallen weg (`sauberName`, `reinerText` in `packages/ui/src/faden/text.ts`). Text aus fremden Inhalten trägt das Kennzeichen „aus fremden Inhalten“ (`FremdMarke` in `packages/ui/src/faden/Marken.tsx`).
- **„führt“ und „dran“ sind nur Anzeige:** Die Marken kommen aus den übergebenen Angaben (`StabPlatz` in `packages/ui/src/faden/typen.ts`), nie aus dem Text eines Bots; mehrere Bots können zugleich „dran“ sein (`markiereDran` in `packages/ui/src/faden/funktionen.ts`).
- **Ergebnis-Zeile einer Gruppe:** Sie wird fest aus Namen und den ersten Zeilen der Zulieferungen zusammengesetzt (`ergebnisZeile` in `packages/ui/src/faden/funktionen.ts`); der Baustein selbst erzeugt keinen Text, er zeigt die übergebene Eigenschaft (`GespraechsGruppe` in `packages/ui/src/faden/Gespraech.tsx`). Eine Ergänzung der Leitung steht getrennt und als Bot-Text gekennzeichnet.
- **Antwort-Vorschläge setzen nur Text ins Eingabefeld:** Zu einer Möglichkeit eines Bots kommt ein fester Text („Möglichkeit 1“), nie ihr Wortlaut; Möglichkeiten mit Link oder über 120 Zeichen gibt es nicht (`vorschlagText`, `gueltigeMoeglichkeiten` in `packages/ui/src/faden/funktionen.ts`). Abgeschickt wird nur, wenn du es selbst tust (`vorschlag` in `packages/ui/src/faden/Ansicht.tsx`).
- **Der Knopf „+10.000 Token für diesen Auftrag“** steht nur in der Grenzen-Karte, mit dem Text „gilt für diesen Auftrag, Tagesbudget bleibt“ und dem Zähler; der sechste Zuschlag ist gesperrt (`GrenzenKarte` in `packages/ui/src/faden/Gespraech.tsx`, `zuschlagMoeglich`). Er ruft nur zurück; ob der Zuschlag gilt, entscheidet später der Server.
- **Ergebnis-Karte und Stempel „abgenommen“** erscheinen nur, wenn der Stand „fertig“ übergeben wird (`FadenKopf` in `packages/ui/src/faden/Kopf.tsx`, `abnahme` in `packages/ui/src/faden/Gespraech.tsx`), nie aus dem Text einer Antwort.
- **Kein „Neu erzeugen“, keine Kennzeichnung „EU“ oder „sicher“:** Beides gibt es in den Bausteinen nicht; ein Test prüft es für jede Szene (`apps/web/src/app/%5Fkomponenten/faden.test.ts`).
- **Kein Zod im Browser:** Die Bausteine importieren aus `@paibot/shared` nur Typen (`packages/ui/src/kein-zod.test.ts`).
- **Erkannte Zeilen:** Die Bausteine zeigen, was der Server erkannt hat (`ErkannteZeilen` in `packages/ui/src/faden/Zeilen.tsx`); sie erkennen selbst nichts.

## Datenmodell und Migrationen

| Tabelle               | Schema                                     | Wofür                                                                                                      |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `conversations`       | `packages/db/src/schema/unterhaltungen.ts` | Unterhaltungen mit Bot und Schalter der Datenschleuse                                                      |
| `messages`            | `packages/db/src/schema/unterhaltungen.ts` | Nachrichten mit Rolle, Weg und Token; wer laut Antwort geantwortet hat (`served_provider`, `served_model`) |
| `runs`                | `packages/db/src/schema/unterhaltungen.ts` | Läufe; höchstens ein offener je Unterhaltung (`runs_ein_offener_lauf_je_unterhaltung`)                     |
| `conversation_events` | `packages/db/src/schema/unterhaltungen.ts` | Ereignis-Strom mit laufender Nummer je Unterhaltung                                                        |
| `pgboss.*`            | eigenes Schema der Warteschlange           | Aufträge (`packages/jobs/src/vertrag.ts#QUEUE_SCHEMA`)                                                     |

Offene Zustände eines Laufs: `packages/shared/src/objects.ts#ACTIVE_RUN_STATUSES`.

Migrationen: `packages/db/drizzle/0001_basis.sql` (Tabellen), `packages/db/drizzle/0002_nur_anhaengen.sql` (Trigger `ereignisse_nur_anhaengen`), `packages/db/drizzle/0005_haertung.sql` (CHECK `conversation_events_type_werte`), `packages/db/drizzle/0011_chat_ergaenzungen.sql` (Aktionen `unterhaltung.exportieren`, `antwort.neu_erzeugen` in den CHECKs), `packages/db/drizzle/0012_anbieter_wahl.sql` (`served_provider`, `served_model` mit Format-CHECKs).

Antwortzeile: Die Angabe „Antwort von … · Sitz … laut …“ baut `apps/web/src/lib/modelle/herkunft.ts#antwortHerkunft` aus `servedBy` der Nachricht (siehe [Anbieter und Modelle](anbieter-und-modelle.md)).

Zugriff: `packages/db/src/repo/unterhaltungen.ts`, `packages/db/src/repo/nachrichten.ts`, `packages/db/src/repo/laeufe.ts`, `packages/db/src/repo/ereignisse.ts`, `packages/db/src/repo/suche.ts`.

## Schnittstellen

Routen aus `apps/web/src/lib/routen.ts#API_ROUTEN` (alle mit Zugang `besitzer`):

| Route                                                   | Aktion                     |
| ------------------------------------------------------- | -------------------------- |
| `GET /api/unterhaltungen`                               | – (lesend)                 |
| `POST /api/unterhaltungen`                              | `unterhaltung.anlegen`     |
| `GET /api/unterhaltungen/:id`                           | – (lesend)                 |
| `PATCH /api/unterhaltungen/:id`                         | `unterhaltung.umbenennen`  |
| `DELETE /api/unterhaltungen/:id`                        | `unterhaltung.loeschen`    |
| `GET /api/unterhaltungen/:id/nachrichten`               | – (lesend)                 |
| `POST /api/unterhaltungen/:id/nachrichten`              | `nachricht.senden`         |
| `GET /api/unterhaltungen/:id/ereignisse` (SSE)          | – (lesend)                 |
| `PUT /api/unterhaltungen/:id/schleuse`                  | `schleuse.umschalten`      |
| `POST /api/unterhaltungen/:id/laeufe/:laufId/abbrechen` | `lauf.abbrechen`           |
| `POST /api/unterhaltungen/:id/antworten/:antwortId/neu` | `antwort.neu_erzeugen`     |
| `POST /api/unterhaltungen/:id/export` (Download)        | `unterhaltung.exportieren` |
| `GET /api/suche`                                        | – (lesend)                 |

Die Route-Dateien liegen unter `apps/web/src/app/api/unterhaltungen/`. Der Bot fragt das Modell über die Aktion `modell.anfragen` (`packages/shared/src/actions.ts`).

Ereignisse (`packages/shared/src/events.ts#EVENT_DATA`): `message.created`, `run.queued`, `run.started`, `text.delta`, `message.completed`, `run.waiting`, `run.resumed`, `run.cancelled`, `run.failed`, `run.denied`, `tool.requested`, `tool.finished`, `schleuse.blockiert`, `beleg.created`. Übertragung: `retry: 2750` am Anfang, Herzschlag `: puls` alle 15 Sekunden (`packages/shared/src/events.ts#SSE_RETRY_MS`, `packages/shared/src/events.ts#SSE_HEARTBEAT`).

## Sicherheit

- **Tor vor jedem Schreiben:** Jede verändernde Chat-Route geht über ihre Aktion; der Bot fragt das Modell nur über `modell.anfragen` mit R-002 (Bot der Unterhaltung) (`packages/shared/src/gate.ts`). Ein Test ruft jede Route auf und prüft die zwei Belege (`apps/web/src/gate-pflicht.test.ts`), im Worker ebenso (`apps/worker/src/gate-pflicht.test.ts`).
- **Modell-Zugang nur mit Berechtigung:** `resolveModel` wird nur in der Ausführung des Tors aufgerufen (`packages/agents/src/run/ausfuehren.ts`).
- **Grenzen:** Nachricht höchstens `messageChars` (32 000) Zeichen (`packages/shared/src/constants.ts`); Rate-Limit `nachricht` 30 je Minute (`packages/shared/src/constants.ts#RATE_LIMITS`); Körper bis `GROESSTER_KOERPER_BYTES` (256 KiB) (`apps/web/src/lib/api/koerper.ts`). Laufzeit eines Auftrags 600 Sekunden (`packages/jobs/src/vertrag.ts#RUN_QUEUE`), Gesamt-Zeitgrenze eines Laufs 540 000 ms (`packages/agents/src/run/vertrag.ts#RUN_TUNING`).
- **Proxy ausgenommen:** Die Route „Nachricht senden“ läuft nicht durch den Proxy und prüft Sitzung, Herkunft und Prüfzeichen selbst (Kommentar an `config` in `apps/web/src/proxy.ts`).
- **Ereignis-Strom:** nur mit Sitzung, die bei jedem Herzschlag neu geprüft wird; höchstens 10 Ströme je Sitzung und 20 im Prozess; ein Strom endet nach 15 Minuten (`apps/web/src/lib/sse/grenzen.ts#STROM_GRENZEN`).
- **Werkzeug-Wunsch:** Wünscht das Modell ein Werkzeug, endet der Lauf mit `abgelehnt`, nichts wird ausgeführt (Kommentar an `executeRun`).

## Tests

| Test                                                                                                                         | Prüft                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/chat/aktionen.test.ts`                                                                                     | Chat-Routen über den Rahmen: Sitzung, Prüfzeichen, Tor, Belege; Senden ganz oder gar nicht                                                                        |
| `apps/web/src/lib/chat/ansicht.test.ts`                                                                                      | Zustands-Kern: Abbruch, Fehler, Ablehnung, Doppel, Neuladen                                                                                                       |
| `apps/web/src/lib/chat/neu-erzeugen.test.ts`                                                                                 | Antwort neu erzeugen                                                                                                                                              |
| `apps/web/src/lib/chat/avatar.test.ts`                                                                                       | Avatar folgt den Ereignissen: denkt, schreibt, fertig, Abbruch, Fehler, Not-Aus, Zeitgeber                                                                        |
| `apps/web/src/lib/chat/startbereich.test.ts`, `apps/web/src/lib/chat/anzeige.test.ts`                                        | Wahl der Fassung (Cookie), Zeitangabe für „Zuletzt“ (`kurzTagText`)                                                                                               |
| `apps/web/src/app/(app)/chat/ChatSeite.test.ts`                                                                              | Startbereich im ersten Bild je Fassung, fehlende Zahl der Belege                                                                                                  |
| `apps/web/src/app/(app)/einstellungen/seiten.test.ts`                                                                        | Reiter „Darstellung“                                                                                                                                              |
| `packages/ui/browser/avatar.test.mjs`, `packages/ui/browser/startbereich.test.mjs`                                           | Avatar und Startbereich im echten Browser (`pnpm --filter @paibot/ui test:browser`)                                                                               |
| `packages/ui/src/faden/funktionen.test.ts`, `packages/ui/src/faden/text.test.ts`, `packages/ui/src/faden/erwaehnung.test.ts` | Fäden: Schwellen, Ergebnis-Zeile, Filter, Vorschläge, Bereinigung von Bot-Text, @-Auswahl                                                                         |
| `apps/web/src/app/%5Fkomponenten/faden.test.ts`                                                                              | Fäden: jede Szene, Bot-Text bleibt Text, Marken, Ergebnis-Karte nur bei „fertig“, Grenzen-Karte                                                                   |
| `packages/ui/browser/faden.test.mjs`                                                                                         | Fäden im echten Browser: Kopf auf und zu (Maus, Enter, Leertaste), Schwellen, Leiste, Handy-Blatt, Umschalter, Vorschläge, Maße bei 1440 und 390, dunkel und hell |
| `apps/web/src/lib/chat/export.test.ts`, `apps/web/src/lib/chat/suche.test.ts`                                                | Export (auch Entschärfung) und Suche                                                                                                                              |
| `apps/web/src/lib/chat/browser-module.test.ts`                                                                               | Browser-Module laden weder Zod noch Routen-Vertrag                                                                                                                |
| `apps/web/src/lib/sse/ereignis-route.test.ts`                                                                                | Strom gegen PGlite: nachholen, live, ohne Lücke und Doppel, Grenzen                                                                                               |
| `apps/web/src/lib/sse/strom-postgres.test.ts`                                                                                | Strom gegen echtes Postgres (nur mit `PAIBOT_TEST_DATABASE_URL`)                                                                                                  |
| `apps/web/src/lib/sse/client-kern.test.ts`                                                                                   | Strom im Browser: Reihenfolge, Doppel, Neuverbinden                                                                                                               |
| `packages/agents/src/run/lauf.test.ts`                                                                                       | Lauf-Steuerung mit Test-Motor: Glücksfall, Ablehnung, Abbruch, Fehler                                                                                             |
| `packages/agents/src/run/lauf-anbieter.test.ts`                                                                              | Lauf-Steuerung mit echtem Motor gegen den Test-Anbieter                                                                                                           |
| `packages/agents/src/run/sperren-postgres.test.ts`                                                                           | Sperr-Reihenfolge gegen echtes Postgres                                                                                                                           |
| `packages/agents/src/run/datenbank-ausfall-postgres.test.ts`                                                                 | Wächter hält bei Ausfall der Datenbank an; Stopp-Wunsch ohne Herzschlag endet                                                                                     |
| `packages/agents/src/motor-aisdk.test.ts`, `packages/agents/src/motor-netz.test.ts`                                          | Motor: Streaming, Abbruch, Fehler; nur das Ziel aus dem Zugang                                                                                                    |
| `packages/jobs/src/queue.test.ts`                                                                                            | Reihenfolge je Unterhaltung, parallele Unterhaltungen, kein Doppel-Lauf                                                                                           |
| `apps/worker/src/lauf.test.ts`, `apps/worker/src/worker.test.ts`                                                             | Auftrag, Start-Reihenfolge, Ende bei Signal                                                                                                                       |
| `packages/db/src/repo/laeufe.test.ts`, `packages/db/src/repo/ereignisse.test.ts`                                             | ein offener Lauf, Statuswechsel; laufende Nummer                                                                                                                  |
| `tools/durchstich/src/lauf.test.ts`                                                                                          | Durchstich über die echte Lauf-Steuerung bis zum Test-Anbieter                                                                                                    |

Ausführen:

```bash
pnpm --filter @paibot/web test
pnpm --filter @paibot/agents test
pnpm --filter @paibot/worker test
pnpm --filter @paibot/jobs test
```

## Bekannte Schwächen

- **Avatar-Zustand nur aus der Sitzung:** „Fehler“ und „fertig“ entstehen aus Ereignissen, die diese Seite gesehen hat (`apps/web/src/lib/chat/avatar.ts#AvatarMerker`). Öffnest du eine Unterhaltung, deren letzter Lauf fehlschlug, steht der Avatar auf „ruhig“; der Fehler steht im Verlauf.
- **Schreibstelle ungefähr:** Der Blick des Avatars zum Eingabefeld rechnet mit der Länge der letzten Zeile (`schreibstelle` in `apps/web/src/app/(app)/chat/ChatSeite.tsx`), nicht mit dem echten Cursor.
- **Browser-Tests nicht unter `turbo`:** Die Browser-Tests für Avatar und Startbereich laufen nur mit `pnpm --filter @paibot/ui test:browser`; unter `turbo run test` fehlt Playwright im Pfad.
- **Keine Werkzeuge:** Die Schleife über Werkzeug-Aufrufe ist nur als Stelle vorbereitet; `continueWithTools` gibt immer `false` zurück (`packages/agents/src/run/ausfuehren.ts`).
- **Kein neuer Versuch nach Absturz:** Ein Auftrag, der beim Absturz des Workers lief, wird nicht wiederholt (`packages/jobs/src/vertrag.ts#RUN_QUEUE`); den Lauf beendet `failStaleRuns` beim Start des Workers (`packages/agents/src/run/aufraeumen.ts`).
- **Verlauf in Zeichen geschätzt:** Die Verlaufsgrenze in Token wird mit 4 Zeichen je Token umgerechnet (`CHARS_PER_TOKEN` in `packages/agents/src/run/ausfuehren.ts`).
- **Fäden nur als Vorschau:** Die Bausteine unter `packages/ui/src/faden/` sind nicht an die App angeschlossen; es gibt noch keine Daten und keine Ereignisse eines Teams vom Server. „Ziele abhaken“ und Etappen sind nur Anzeige (`packages/ui/src/faden/typen.ts`).
- **Warnzeichen am Avatar:** Der lebendige Avatar zeichnet im Zustand „wartet“ ein Warnzeichen an die Ecke; in Listen der Fäden wird er deshalb ruhig gezeigt (`ohneEck` in `packages/ui/src/faden/BotAvatar.tsx`).
