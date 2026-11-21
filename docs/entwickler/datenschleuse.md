<!--
PaiBot – Entwickler-Doku: Anbindung der Datenschleuse (Weg, Zustand, Standard, Schalter).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Datenschleuse – für Entwickler

**Anwender-Doku:** [Datenschleuse](../funktion-datenschleuse.md)

## Zweck und Entscheidung

Die Datenschleuse ist ein eigener Dienst; PaiBot enthält nur die Anbindung: den Weg einer Modell-Anfrage über die Datenschleuse (`packages/llm/src/route.ts`, `packages/llm/src/schleuse-zugang.ts`), ihren Zustand (`apps/worker/src/schleuse-meldung.ts`, `packages/db/src/repo/schleuse.ts`) und die Schalter in der Web-App (`apps/web/src/lib/schleuse/schleuse.ts`, `apps/web/src/lib/chat/aktionen.ts`).

Belegte Entscheidungen im Code:

- **Kein Rückfall auf direkt:** G-01 verlangt bei jedem Modus außer ausdrücklich `off` den Weg `schleuse` und eine erreichbare Datenschleuse (`packages/gate/src/limits/index.ts#limitSchleuseGefordert`); die Lauf-Steuerung fällt nie auf den direkten Weg zurück (Kommentar an `packages/agents/src/run/ausfuehren.ts#executeRun`).
- **Die Web-App fragt die Datenschleuse nie selbst:** Sie hängt nicht in deren Netz und liest den Zustand, den der Worker prüft und schreibt (Kopfkommentar in `apps/web/src/lib/schleuse/schleuse.ts`; Kommentar in `packages/db/drizzle/0007_schleuse_zustand.sql`).
- **Zuschaltbar:** Die Dienste `datenschleuse` und `schleuse-analyzer` stehen im Compose-Profil `schleuse` (`deploy/docker-compose.yml`).

## Aufbau

| Datei                                           | Aufgabe                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/llm/src/schleuse.ts`                  | Einstellungen aus der Umgebung (`SCHLEUSE_ENV`: `SCHLEUSE_URL`, `SCHLEUSE_KEY`, `SCHLEUSE_SCHLUESSEL_WEG`), Erreichbarkeit (`probeSchleuse`) |
| `packages/llm/src/route.ts`                     | Modus auflösen (`resolveSchleuseMode`) und Weg bestimmen (`resolveRoute`)                                                                    |
| `packages/llm/src/schleuse-zugang.ts`           | `fetch` des Modell-Zugangs auf dem Weg über die Datenschleuse (`createSchleuseFetch`)                                                        |
| `packages/llm/src/errors.ts`                    | Fehlerantworten der Datenschleuse auf feste Codes (`schleuseFailureCode`)                                                                    |
| `packages/agents/src/run/kontext.ts`            | Weg je Lauf (`chooseRoute`), Zustand lesen (`readSchleuseStatus`)                                                                            |
| `apps/worker/src/schleuse-meldung.ts`           | Zustand beim Start und danach in festen Abständen prüfen und melden                                                                          |
| `packages/db/src/repo/schleuse.ts`              | `report` (Worker), `get` (Web-App)                                                                                                           |
| `apps/web/src/lib/schleuse/schleuse.ts`         | eingerichtet ja/nein, letzte geschützte Anfrage aus den Belegen, Standard umschalten                                                         |
| `apps/web/src/lib/chat/aktionen.ts`             | Schalter je Unterhaltung (`unterhaltungSchleuse`)                                                                                            |
| `apps/web/src/app/(app)/datenschleuse/page.tsx` | Seite „Datenschleuse“                                                                                                                        |
| `scripts/schleuse-config.mjs`                   | `pnpm schleuse:config`: Konfiguration der Datenschleuse erzeugen                                                                             |

Datenfluss einer geschützten Anfrage:

1. Der Modus gilt je Unterhaltung; ist `conversations.schleuse_mode` leer, gilt der Standard aus `settings.schleuse_mode_default` (`packages/db/src/schema/unterhaltungen.ts`, Kommentar an `conversations`).
2. Die Lauf-Steuerung wählt den Weg und bildet die Fakten von `modell.anfragen` (u. a. `requestedMode`, `route`, `schleuseReachable`); G-01 lehnt ab, wenn die Datenschleuse gefordert, aber nicht nutzbar ist. Dann schreibt die Steuerung `schleuse.blockiert` und `run.denied` ohne Abruf beim Anbieter (Kommentar an `executeRun`).
3. Auf dem Weg `schleuse` nimmt `resolveModel` Basis-URL und Schlüssel der Datenschleuse und schickt die ID der Unterhaltung in der Kopfzeile `SCHLEUSE_SESSION_HEADER`; auf dem Weg `anfrage` (Standard) geht der Schlüssel des Anbieters als `api_key` im Körper mit, auf dem Weg `umgebung` nicht (Kommentar an `packages/llm/src/resolve-model.ts#resolveModel`).
4. Fehlerantworten der Datenschleuse werden ohne Text aus der Antwort zu `PaiBotError` mit festem Code, z. B. `schleuse_blockiert` (ebd.).

## Datenmodell und Migrationen

| Tabelle            | Schema                                     | Wofür                                                                 |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------- |
| `schleuse_zustand` | `packages/db/src/schema/schleuse.ts`       | eine Zeile (`schleuse_zustand_nur_eine_zeile`): `state`, `checked_at` |
| `settings`         | `packages/db/src/schema/settings.ts`       | `schleuse_mode_default` (`off` oder `on`)                             |
| `conversations`    | `packages/db/src/schema/unterhaltungen.ts` | `schleuse_mode` je Unterhaltung, leer = Standard                      |

Migration: `packages/db/drizzle/0007_schleuse_zustand.sql`. Eine Meldung, die mehr als `ZUKUNFT_TOLERANZ_SEKUNDEN` (60) in der Zukunft liegt, kürzt `report` auf diese Grenze (`packages/db/src/repo/schleuse.ts#ZUKUNFT_TOLERANZ_SEKUNDEN`).

## Schnittstellen

| Art      | Name                                                                                | Datei                                                        |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Route    | `GET /api/datenschleuse`                                                            | `apps/web/src/app/api/datenschleuse/route.ts`                |
| Route    | `PUT /api/datenschleuse/standard`                                                   | `apps/web/src/app/api/datenschleuse/standard/route.ts`       |
| Route    | `PUT /api/unterhaltungen/:id/schleuse`                                              | `apps/web/src/app/api/unterhaltungen/[id]/schleuse/route.ts` |
| Aktion   | `schleuse.umschalten` (Fakten `scope`, `mode`, `previousMode`, `schleuseInstalled`) | `packages/shared/src/actions.ts`                             |
| Ereignis | `schleuse.blockiert`                                                                | `packages/shared/src/events.ts`                              |
| Befehl   | `pnpm schleuse:config`                                                              | `scripts/schleuse-config.mjs`                                |

## Sicherheit

- **Einschalten nur, wenn eingerichtet:** V-04 verlangt bei `mode: "on"` den Fakt `schleuseInstalled`, sonst `schleuse_nicht_installiert` (`packages/shared/src/gate.ts#PRECONDITIONS`). „Eingerichtet“ heißt: Die Umgebung der Web-App kennt die Datenschleuse oder der Worker meldet etwas anderes als `aus` (`apps/web/src/lib/schleuse/schleuse.ts#eingerichtetAus`).
- **Meldung des Workers:** beim Start und danach alle 30 000 ms (`schleuseIntervalMs` in `apps/worker/src/worker.ts#WORKER_TIMING`); als veraltet gilt sie nach `VERALTET_NACH_MS` (5 Minuten) (`apps/web/src/lib/schleuse/schleuse.ts#VERALTET_NACH_MS`).
- **Schlüssel der Datenschleuse und des Anbieters:** gehen nur an die Adresse der Datenschleuse (`createSchleuseFetch` in `packages/llm/src/schleuse-zugang.ts`).
- **Vertragstest nur mit laufendem Dienst:** Den Test gegen eine laufende Datenschleuse gibt es nur mit `PAIBOT_TEST_SCHLEUSE_URL`, sonst wird er übersprungen (`tools/durchstich/src/schleuse-vertrag.test.ts`).

## Tests

| Test                                             | Prüft                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `apps/web/src/lib/schleuse/schleuse.test.ts`     | Zustand, Standard über das Tor (V-04), letzte geschützte Anfrage          |
| `packages/db/src/repo/schleuse.test.ts`          | Meldung des Workers, Lesen der Web-App, auch mit App-Rolle gegen Postgres |
| `apps/worker/src/schleuse-meldung.test.ts`       | Prüfen beim Start und regelmäßig, Melden in die Datenbank                 |
| `packages/llm/src/schleuse-zugang.test.ts`       | Schlüssel je Anfrage, Abbildung der Fehlerantworten                       |
| `packages/llm/src/route-schleuse-errors.test.ts` | Weg, Datenschleuse, Fehler                                                |
| `tools/durchstich/src/schleuse-vertrag.test.ts`  | gegen eine laufende Datenschleuse (nur mit `PAIBOT_TEST_SCHLEUSE_URL`)    |
| `tools/lint-regeln/src/schleuse-config.test.ts`  | `pnpm schleuse:config` erzeugt eine gültige, geheimnisfreie Konfiguration |

Ausführen:

```bash
pnpm --filter @paibot/web test
pnpm --filter @paibot/llm test
pnpm --filter @paibot/worker test
```

## Bekannte Schwächen

- **Zustand nur so frisch wie die letzte Prüfung des Workers;** läuft der Worker nicht, bleibt der letzte Stand stehen (`apps/worker/src/schleuse-meldung.ts`, `apps/web/src/lib/schleuse/schleuse.ts#VERALTET_NACH_MS`).
- **Block-Antwort nicht gegen den laufenden Dienst geprüft:** Auf dem Weg `schleuse` gilt ein Block als HTTP 500 (`packages/llm/src/errors.ts#schleuseFailureCode`), ohne Weg erkennt `mapProviderError` die Kennung `DatenschleuseBlocked` in den üblichen Feldern (`packages/llm/src/errors.ts#mapProviderError`); ob der Dienst sie so meldet, prüft nur der Vertragstest mit laufender Datenschleuse (`tools/durchstich/src/schleuse-vertrag.test.ts`). Die Anwender-Doku sagt dazu: „noch nicht gegen den laufenden Dienst geprüft“ ([Anbieter und Modelle](../funktion-anbieter-und-modelle.md#grenzen)).
