<!--
PaiBot – Architektur: Aufbau von PaiBot heute und geplante Teile.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-18
-->

# Architektur

**Ergebnis:** Du siehst, aus welchen Teilen PaiBot heute besteht und was erst geplant ist. Diese Seite wächst mit jeder Funktion mit.

## Heutiger Stand

```mermaid
flowchart LR
    U["Du im Browser"] --> W["Web-App<br/>Next.js"]
    W --> DB[("Postgres")]
```

| Teil              | Ort               | Was es heute tut                                                                       |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------- |
| Web-App           | `apps/web`        | Startseite mit Datenbank-Status, Health-Endpunkt `/api/health`, Migrationen beim Start |
| Datenbank-Paket   | `packages/db`     | Verbindung (`createDb`), Schema, Migrationen (`runMigrations`), Erreichbarkeitsprüfung |
| Gemeinsames Paket | `packages/shared` | gemeinsame Verträge aller Pakete (siehe unten), App-Name, Sprachen (`de`, `en`)        |
| Deployment        | `deploy`          | Docker Compose mit `postgres` und `web`                                                |

### Healthcheck

`GET /api/health` fragt die Datenbank ab und antwortet mit JSON, zum Beispiel `{"status":"ok","app":"PaiBot","db":"ok","time":"2026-11-20T10:00:00.000Z","version":"0.3.0"}`. `version` ist die Version von PaiBot ohne den Teil ab `+`.

| `db`             | `status`   | HTTP | Bedeutung                    |
| ---------------- | ---------- | ---- | ---------------------------- |
| `ok`             | `ok`       | 200  | Datenbank erreichbar         |
| `down`           | `degraded` | 503  | Datenbank nicht erreichbar   |
| `not_configured` | `ok`       | 200  | keine `DATABASE_URL` gesetzt |

Das Docker-Image prüft denselben Endpunkt in seinem eigenen Healthcheck.

### Datenbank und Migrationen

- Postgres wird mit Drizzle angesprochen. Das Schema liegt in `packages/db/src/schema/` (eine Datei pro Bereich), die erzeugten Migrationen in `packages/db/drizzle/`.
- Alle Tabellen der Basis sind angelegt (siehe [Datenmodell](#datenmodell)). Die App nutzt bisher nur `settings`, mit genau einer Zeile (`id = "singleton"`), denn PaiBot gehört genau einer Person.
- Beim Start der Web-App (`apps/web/src/instrumentation-node.ts`) werden offene Migrationen angewendet, mit bis zu fünf Versuchen. Gelingt das nicht, startet die App trotzdem, und `/api/health` meldet `degraded`.

## Geplant

Diese Teile gibt es als Ordner oder Platzhalter, aber noch ohne Funktion. Details folgen auf den Doku-Seiten, sobald es sie wirklich gibt.

| Teil             | Ort                   | Stand                     |
| ---------------- | --------------------- | ------------------------- |
| Datenschleuse    | eigener Dienst        | geplant                   |
| KI-Modelle       | `packages/llm`        | Platzhalter, nicht gebaut |
| Bots und Team    | `packages/agents`     | Platzhalter, nicht gebaut |
| Apps per MCP     | `packages/mcp`        | Platzhalter, nicht gebaut |
| Hintergrund-Jobs | `packages/jobs`       | Platzhalter, nicht gebaut |
| UI-Komponenten   | `packages/ui`         | Platzhalter, nicht gebaut |
| Browser-Dienst   | `services/browser`    | geplant                   |
| Krypto           | `packages/crypto`     | Platzhalter, nicht gebaut |
| Tor              | `packages/gate`       | Platzhalter, nicht gebaut |
| Belege           | `packages/receipts`   | Platzhalter, nicht gebaut |
| Worker           | `apps/worker`         | Platzhalter, nicht gebaut |
| Test-Anbieter    | `tools/fake-provider` | Platzhalter, nicht gebaut |

Was die neuen Teile tun werden:

- **Krypto** (`packages/crypto`) verschlüsselt gespeicherte Schlüssel, prüft dein Passwort und signiert die Belege.
- **Tor** (`packages/gate`) prüft jede Aktion mit festen Regeln und Grenzen, ohne KI, und schreibt dazu die Belege.
- **Belege** (`packages/receipts`) hängt Belege an die Kette an, exportiert sie und prüft sie, auch im Browser und mit `pnpm belege:pruefen`.
- **Worker** (`apps/worker`) führt die Läufe aus der Warteschlange im Hintergrund aus.
- **Test-Anbieter** (`tools/fake-provider`) spielt in Tests einen Modell-Anbieter, damit kein echter Schlüssel nötig ist.
- Für Mitwirkende gibt es außerdem `packages/stub` (Kennzeichen für noch nicht gebaute Funktionen) und `tools/lint-regeln` (eigene Prüfregeln für Biome).

## Gemeinsame Verträge (`packages/shared`)

Alle Pakete sprechen über dieselben Typen und Zod-Schemas. Sie liegen in `packages/shared` und haben als einzige Abhängigkeit `zod`. Die Verträge gibt es schon; die Teile, die sie benutzen (Chat, Tor, Belege), sind **im Bau**.

| Unterpfad                   | Inhalt                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `@paibot/shared/ids`        | IDs mit Präfix pro Art, z. B. `unt_06f8k2m9qz3w7x1c4b5n8p0r2t`, zeitlich sortierbar     |
| `@paibot/shared/objekte`    | Unterhaltung, Nachricht, Lauf, Bot, Anbieter, Modell, Einstellungen, Sitzung            |
| `@paibot/shared/eingaben`   | Prüfung aller Eingaben der API (Längen, Formate)                                        |
| `@paibot/shared/ereignisse` | Ereignisse einer Unterhaltung und ihre Übertragung per Server-Sent Events               |
| `@paibot/shared/aktionen`   | alle Aktionen mit Akteur, Ziel und Fakten                                               |
| `@paibot/shared/tor`        | Regeln, Stufen, Grenzen, Entscheidung und Berechtigung des Tors                         |
| `@paibot/shared/belege`     | Format eines Belegs und des Exports                                                     |
| `@paibot/shared/motor`      | Vertrag für den Motor                                                                   |
| `@paibot/shared/fehler`     | Fehlercodes mit HTTP-Status und Fehlerklasse                                            |
| `@paibot/shared/api`        | Antwort-Hülle der API: `{ "ok": true, "daten": … }` oder `{ "ok": false, "fehler": … }` |
| `@paibot/shared/texte`      | alle Texte als Schlüssel mit deutschen Werten, Zugriff mit `t(key)`                     |
| `@paibot/shared/konstanten` | gemeinsame Grenzen und Namen (Cookies, Kopfzeilen, Speicher-Schlüssel)                  |

## Begriffe

Diese Begriffe tauchen in Code und Doku immer wieder auf. Was mit **im Bau** markiert ist, gibt es bisher nur als Vertrag, noch nicht als Funktion.

| Begriff       | Bedeutung                                                                                                                                                      | Stand  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Besitzer      | die eine Person, der die Installation gehört                                                                                                                   | im Bau |
| Bot           | dein Assistent mit Name, Anweisung, Modell und Avatar                                                                                                          | im Bau |
| Unterhaltung  | ein Gespräch mit einem Bot; sie enthält Nachrichten                                                                                                            | im Bau |
| Nachricht     | ein Beitrag in einer Unterhaltung, von dir oder vom Bot                                                                                                        | im Bau |
| Lauf          | die Arbeit an einer Antwort, im Hintergrund; Zustände: wartet, läuft, fertig, fehlgeschlagen, abgebrochen, abgelehnt (später: wartet auf Freigabe)             | im Bau |
| Ereignis      | ein Schritt im Ereignis-Strom einer Unterhaltung (z. B. „Antwort wächst um ein Stück Text“), mit laufender Nummer, damit nach einer Unterbrechung nichts fehlt | im Bau |
| Anbieter      | ein Dienst, der Modelle bereitstellt (zuerst EUrouter); der Schlüssel liegt verschlüsselt in der Datenbank                                                     | im Bau |
| Modell        | das KI-Modell eines Anbieters, das die Antwort schreibt                                                                                                        | im Bau |
| Datenschleuse | eigener Dienst, der persönliche Daten vor dem Modell maskiert; Schalter An/Aus pro Unterhaltung                                                                | im Bau |
| Aktion        | alles, was etwas verändert oder nach außen geht, z. B. `nachricht.senden` oder `modell.anfragen`                                                               | im Bau |
| Akteur        | wer eine Aktion auslöst: `besitzer` oder `bot:<id>`                                                                                                            | im Bau |
| Tor           | der einzige Eintrittspunkt für jede Aktion; prüft feste Regeln und Grenzen, ohne KI                                                                            | im Bau |
| Regel         | sagt dem Tor, was erlaubt ist (z. B. „R-002 Bot darf antworten“); in der ersten Version nur feste Standard-Regeln                                              | im Bau |
| Grenze        | feste Prüfung zusätzlich zu den Regeln, z. B. Länge, Tagesbudget, Not-Aus                                                                                      | im Bau |
| Stufe         | wie weit eine erlaubte Aktion geht: fragen, vorbereiten oder ausführen; in der ersten Version nur „ausführen“                                                  | im Bau |
| Beleg         | Eintrag im Protokoll zu jeder Entscheidung des Tors und ihrem Ergebnis, verkettet über Prüfsummen und signiert mit dem Schlüssel der Installation              | im Bau |
| Motor         | der Teil, der mit dem Modell eine Runde Gespräch erzeugt; er führt nie selbst ein Werkzeug aus                                                                 | im Bau |

## Datenmodell

Das Schema liegt in `packages/db/src/schema/` (eine Datei pro Bereich), die Migrationen in `packages/db/drizzle/`. Alle Tabellen sind angelegt; was mit **im Bau** markiert ist, nutzt noch keine Funktion der App.

| Tabelle               | Wofür                                                                                                                                | Stand        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `settings`            | Einstellungen der Installation, genau eine Zeile (Sprache, Zeitzone, Standard der Datenschleuse, Grenzen, Not-Aus, Installations-ID) | in Benutzung |
| `owner`               | die eine Person, der die Installation gehört (Passwort-Prüfwert); höchstens eine Zeile                                               | im Bau       |
| `sessions`            | angemeldete Sitzungen; gespeichert wird nur die Prüfsumme des Tokens                                                                 | im Bau       |
| `rate_limits`         | Zähler gegen zu viele Versuche (Anmelden, Nachrichten)                                                                               | im Bau       |
| `providers`           | Anbieter von Modellen; der API-Schlüssel liegt nur verschlüsselt                                                                     | im Bau       |
| `models`              | Modelle eines Anbieters                                                                                                              | im Bau       |
| `bots`                | Bot mit Name, Anweisung, Modell und Aussehen                                                                                         | im Bau       |
| `conversations`       | Unterhaltungen mit dem Bot, mit Schalter der Datenschleuse                                                                           | im Bau       |
| `messages`            | Nachrichten einer Unterhaltung                                                                                                       | im Bau       |
| `runs`                | Läufe: die Arbeit an einer Antwort im Hintergrund                                                                                    | im Bau       |
| `conversation_events` | Ereignis-Strom je Unterhaltung, nur anhängend, mit laufender Nummer                                                                  | im Bau       |
| `rules`               | Regeln des Tors; jede Änderung ist eine neue Fassung                                                                                 | im Bau       |
| `installation_keys`   | Signaturschlüssel der Installation für die Belege                                                                                    | im Bau       |
| `belege`              | Protokoll aller Entscheidungen des Tors, verkettet und unveränderlich                                                                | im Bau       |

Was die Datenbank selbst absichert:

- **IDs** haben pro Art ein festes Muster (z. B. `unt_…`), jede Tabelle prüft es. Aufzählungen wie Rolle, Zustand oder Region sind per `CHECK` auf die erlaubten Werte begrenzt.
- **Ein offener Lauf je Unterhaltung:** Läufe im Zustand `queued`, `running` oder `waiting_approval` zählen als offen; ein eindeutiger Index lässt pro Unterhaltung höchstens einen zu. Wird ein wartender Lauf fortgesetzt, ist das ein neuer Lauf, der über `resumes_run_id` auf den alten zeigt.
- **Belege sind unveränderlich:** Trigger weisen `UPDATE`, `DELETE` und `TRUNCATE` auf `belege` ab. Jeder Eintrag zeigt über `prev_hash` auf den vorigen; eindeutige Indizes verhindern, dass die Kette sich verzweigt. Belege enthalten keine Nachrichtentexte und hängen nicht per Fremdschlüssel an Unterhaltungen.
- **Ereignisse werden nur angehängt:** gelöscht werden nur `text.delta`-Ereignisse und alles zusammen mit der Unterhaltung.
- **Installations-ID:** nach dem Setzen nicht mehr änderbar.
- **Standard-Regeln** (`R-001`, `R-002`, `R-999`) legt eine Migration an, wiederholbar ohne Doppelungen.
- **Datenschleuse:** `settings.schleuse_mode_default` kennt `off` und `on`, der Standard ist `off`. Bestehende Installationen mit dem früheren Wert `auto` werden bei der Migration auf `off` gesetzt.

## Hintergrund-Läufe

Die Antwort auf eine Nachricht entsteht im Hintergrund. Die Web-App reiht dafür einen Lauf in eine Warteschlange ein, der Worker holt ihn dort ab. Die Warteschlange liegt in derselben Postgres-Datenbank wie alles andere, in einem eigenen Schema (`pgboss`); es braucht keinen weiteren Dienst. Sie steckt im Paket `packages/jobs` (Bibliothek: pg-boss). Außerhalb dieses Pakets kennt niemand die Bibliothek.

| Frage                                          | Antwort                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wie wird ein Lauf eingereiht?                  | `enqueueRun({ runId, conversationId })`; auf Wunsch in derselben Transaktion wie Nachricht und Lauf, sodass beides zusammen gilt oder zusammen fällt |
| Läuft zu einer Unterhaltung mehr als ein Lauf? | Nein. Pro Unterhaltung läuft ein Lauf nach dem anderen, in der Reihenfolge des Einreihens. Verschiedene Unterhaltungen laufen parallel               |
| Kann ein Lauf doppelt entstehen?               | Nein. Aus der Lauf-ID wird eine feste Auftrags-ID gebildet; ein zweites Einreihen desselben Laufs ändert nichts und liefert dieselbe ID              |
| Wird ein fehlgeschlagener Lauf wiederholt?     | Nein, nie: eine Modell-Antwort soll nicht doppelt entstehen. Die Aufgabe bekommt keinen zweiten Versuch                                              |
| Was, wenn die Aufgabe einen Fehler wirft?      | Der Auftrag gilt als fehlgeschlagen und wird entfernt, damit die Unterhaltung nicht stehen bleibt; der Fehler steht im Log des Workers               |
| Wie lange darf ein Lauf dauern?                | Zehn Minuten. Danach löst die Warteschlange das Abbruch-Signal der Aufgabe aus und gibt den Auftrag auf                                              |
| Wie endet der Worker?                          | `stop` nimmt nichts Neues an und wartet, bis laufende Aufgaben fertig sind. Nach der Wartezeit bekommen sie das Abbruch-Signal                       |

Gut zu wissen:

- **Wecken:** Neue Aufträge wecken den Worker sofort (LISTEN/NOTIFY). Zusätzlich fragt der Worker alle ein bis zwei Sekunden nach, damit ein Auftrag, der hinter einem laufenden derselben Unterhaltung wartet, gleich nach dessen Ende drankommt.
- **Fehlgeschlagene Aufträge stehen nicht im Weg:** Bei dieser Art Warteschlange hält ein fehlgeschlagener Auftrag alle folgenden derselben Unterhaltung zurück. PaiBot räumt solche Aufträge beim Start des Workers und danach alle 30 Sekunden weg, auch wenn der Auftrag nicht durch einen Fehler, sondern durch Zeitablauf fehlgeschlagen ist.
- **Absturz des Workers:** Ein Auftrag, der gerade lief, wird nicht neu gestartet. Er bleibt bis zum Ablauf der zehn Minuten belegt, erst danach (mit etwas Verzögerung) kommt die Unterhaltung wieder dran. Den Zustand des Laufs selbst räumt der Worker beim Start auf.
- **Schema:** pg-boss legt `pgboss` beim ersten `start` selbst an. Die Datenbank-Migrationen von PaiBot fassen es nicht an.

## Zusammenspiel der Pakete

`apps/web` nutzt `@paibot/db` und `@paibot/shared`. Das Monorepo wird mit pnpm und Turborepo gebaut; das Docker-Image baut nur die Web-App und kopiert die Migrationen dazu.
