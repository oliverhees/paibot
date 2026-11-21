<!--
PaiBot – Entwickler-Doku: Anbieter und Modelle (Anbieter-Schicht, Modell-Zugang, Ausgangs-Liste).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Anbieter und Modelle – für Entwickler

**Anwender-Doku:** [Anbieter und Modelle](../funktion-anbieter-und-modelle.md)

## Zweck und Entscheidung

Die Anbieter-Schicht (`packages/llm/`) holt Modell-Listen, testet Verbindungen, prüft Basis-URLs, bestimmt den Weg zum Modell (direkt oder über die Datenschleuse) und baut den Modell-Zugang eines Laufs. Die Web-App verwaltet Anbieter und Modelle in `apps/web/src/lib/modelle/anbieter.ts`.

Belegte Entscheidungen im Code:

- **Modell-Zugang nur mit Berechtigung des Tors:** `resolveModel` prüft `isGatePermit(permit, "modell.anfragen")` und gibt sonst `abgelehnt` (`packages/llm/src/resolve-model.ts#resolveModel`).
- **Web-App baut nie einen Modell-Zugang:** Der Unterpfad `@paibot/llm/modell` ist der Web-App per Lint-Regel verwehrt: „Die Web-App baut nie einen Modell-Zugang; Modelle ruft nur der Worker über das Tor auf.“ (`biome.json`, `noRestrictedImports`; `packages/llm/src/index.ts`, Kopfkommentar).
- **Schlüssel an das Ziel gebunden:** Der Schlüssel wird mit `providerSecretBinding(id, baseUrl)` entschlüsselt; für eine andere Adresse lässt er sich nicht entschlüsseln (Kommentar an `resolveModel`). Bei neuer Adresse wird bewusst umgebunden (`packages/llm/src/schluessel.ts#rebindProviderSecret`).
- **Schlüssel nie zurück an den Browser:** Kopfkommentar in `apps/web/src/lib/modelle/anbieter.ts`; die Seite bekommt nur „Schlüssel gesetzt“ (`apps/web/src/lib/modelle/seite.ts`, Kopfkommentar).
- **Adresse festgenagelt:** Verbunden wird genau mit den vorher geprüften Adressen (`packages/llm/src/pinned-fetch.ts`, Kopfkommentar); `fetch` erreicht nur das erlaubte Ziel (`packages/llm/src/egress.ts#createEgressFetch`).

## Aufbau

| Datei                                     | Aufgabe                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `packages/llm/src/models.ts`              | `fetchModels`, `testConnection`; Grenzen `MODEL_LIST_LIMITS`                                                       |
| `packages/llm/src/egress.ts`              | Ausgangs-Liste `createEgressFetch`, Prüfung `checkProviderBaseUrl`, gesperrte Dienstnamen `INTERNAL_SERVICE_HOSTS` |
| `packages/llm/src/address.ts`             | Adressen einordnen: öffentlich, privat, Link-Local/Metadaten (`classifyIpAddress`)                                 |
| `packages/llm/src/pinned-fetch.ts`        | Anfrage an festgenagelte Adressen mit Grenzen für Größe, Entpacken, Zeilen, Kopfzeilen                             |
| `packages/llm/src/resolve-model.ts`       | `resolveModel`; Grenzen der Chat-Antwort `CHAT_RESPONSE_LIMITS`                                                    |
| `packages/llm/src/route.ts`               | Modus der Datenschleuse und Weg zum Modell (`resolveSchleuseMode`, `resolveRoute`)                                 |
| `packages/llm/src/target.ts`              | Ziel der Modell-Anfrage: Origin und Abdruck (`providerTargetDigest`)                                               |
| `packages/llm/src/errors.ts`              | Fehler auf feste Codes abbilden (`mapProviderError`)                                                               |
| `packages/llm/src/schluessel.ts`          | Anbieter-Schlüssel verschlüsseln und umbinden                                                                      |
| `packages/llm/src/templates.ts`           | Vorlagen `PROVIDER_TEMPLATES` (EUrouter) und `CUSTOM_PROVIDER_TEMPLATE`                                            |
| `apps/web/src/lib/modelle/anbieter.ts`    | Routen: Liste, Anlegen, Ändern, Entfernen, Verbindungstest, Modell-Liste                                           |
| `apps/web/src/lib/modelle/eigen.ts`       | Eingabe für einen eigenen oder lokalen Anbieter (auch im Browser)                                                  |
| `apps/web/src/lib/modelle/seite.ts`       | Daten der Seite „Modell und Anbieter“                                                                              |
| `apps/web/src/app/(app)/modelle/page.tsx` | Seite                                                                                                              |

Datenfluss einer Modell-Anfrage (Worker):

1. Die Lauf-Steuerung bildet die Fakten von `modell.anfragen` aus der Datenbank (`packages/agents/src/run/kontext.ts#modelFacts`) und ruft das Tor.
2. In der Ausführung baut sie mit der Berechtigung `resolveModel(permit, choice, …)` (`packages/agents/src/run/ausfuehren.ts`).
3. `resolveModel` prüft Berechtigung, Ziel-Abdruck und Origin, entschlüsselt den Schlüssel mit Bindung und gibt einen Zugang mit eigenem `fetch` zurück, der `authorization` selbst setzt (Kommentar an `resolveModel`).
4. Nach dem Ende von `execute` scheitert jeder Abruf mit `abgelehnt`, weil die Berechtigung zurückgezogen ist (`stillAllowed` in `packages/llm/src/resolve-model.ts`).

## Datenmodell und Migrationen

| Tabelle     | Schema                               | Wofür                                                                            |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| `providers` | `packages/db/src/schema/anbieter.ts` | Anbieter mit Vorlage, Basis-URL, Region, verschlüsseltem Schlüssel, letztem Test |
| `models`    | `packages/db/src/schema/anbieter.ts` | Modelle eines Anbieters; `models_provider_slug_eindeutig`                        |

Eindeutig ist auch die Basis-URL (`providers_base_url_eindeutig`); die App prüft zusätzlich mit normalisierter Adresse (ein `/` am Ende zählt nicht) und meldet `modelle.eigen.adresse_doppelt` (`apps/web/src/lib/modelle/anbieter.ts#adresseNormal`).

Migrationen: `packages/db/drizzle/0001_basis.sql` (Tabellen), `packages/db/drizzle/0005_haertung.sql` (`template_key`, CHECKs `providers_api_key_format` und `providers_template_key_werte`). Zugriff: `packages/db/src/repo/anbieter.ts` (`getWithKey` liest den verschlüsselten Schlüssel) und `packages/db/src/repo/modelle.ts`.

## Schnittstellen

Routen aus `apps/web/src/lib/routen.ts#API_ROUTEN` (Zugang `besitzer`):

| Route                                | Aktion                                 |
| ------------------------------------ | -------------------------------------- |
| `GET /api/anbieter`                  | – (lesend)                             |
| `POST /api/anbieter`                 | `anbieter.speichern`                   |
| `PUT /api/anbieter/:id`              | `anbieter.speichern`                   |
| `DELETE /api/anbieter/:id`           | `anbieter.loeschen`                    |
| `POST /api/anbieter/verbindungstest` | – (nicht verändernd, speichert nichts) |
| `POST /api/anbieter/:id/modelle`     | `anbieter.speichern`                   |
| `PUT /api/bot/modell`                | `modell.waehlen` (siehe [Bot](bot.md)) |

Route-Dateien unter `apps/web/src/app/api/anbieter/`. Die Aktion `modell.anfragen` des Bots beschreibt [Chat](chat.md).

## Sicherheit

- **Basis-URL-Prüfung:** beim Eintragen und bei jeder Nutzung (`packages/llm/src/egress.ts#checkProviderBaseUrl`); Namen der eigenen Dienste (`postgres`, `datenschleuse`, `web`, `worker`) sind immer gesperrt (`packages/llm/src/egress.ts#INTERNAL_SERVICE_HOSTS`).
- **Grenzen der Antwort:** Chat-Antwort bis 64 MiB (`packages/llm/src/resolve-model.ts#CHAT_RESPONSE_LIMITS`), Modell-Liste bis 5 000 000 Byte (`MAX_BODY_BYTES` in `packages/llm/src/models.ts`), Fehlerkörper bis 64 KiB, Entpacken höchstens 500-fach ab 1 MiB, Zeile bis 1 MiB, Kopfzeilen bis 16 KiB (`packages/llm/src/pinned-fetch.ts#PINNED_MAX_ERROR_BODY_BYTES`, `packages/llm/src/pinned-fetch.ts#PINNED_MAX_DECODE_RATIO`, `packages/llm/src/pinned-fetch.ts#PINNED_MAX_LINE_BYTES`, `packages/llm/src/pinned-fetch.ts#PINNED_MAX_HEADER_BYTES`).
- **Region:** G-02 prüft bei `modell.anfragen`, dass der Anbieter aktiv ist und die Region passt (`packages/gate/src/limits/index.ts#limitAnbieterRegion`).
- **Rate-Limit:** Verbindungstest nach der Einrichtung `verbindungstest` 10 je Minute (`packages/shared/src/constants.ts#RATE_LIMITS`).
- **Fehler ohne Schlüssel:** Fehler werden auf feste Codes abgebildet (`packages/llm/src/errors.ts#mapProviderError`); `JSON.stringify`, `console.log` und `util.inspect` zeigen vom Zugang nur eine Zusammenfassung (Kommentar an `resolveModel`).

## Tests

| Test                                                                                    | Prüft                                                                      |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/llm/src/egress.test.ts`                                                       | Basis-URL-Prüfung und Ausgangs-Liste                                       |
| `packages/llm/src/pinned-fetch.test.ts`, `packages/llm/src/pinned-grenzen.test.ts`      | Strom, Abbruch, Entpacken, TLS, Proxy; Grenzen und `Host`                  |
| `packages/llm/src/resolve-model.test.ts`, `packages/llm/src/resolve-model-ziel.test.ts` | Zugang gegen Berechtigung; Ziel-Bindung, verborgener Schlüssel, Lebenszeit |
| `packages/llm/src/models.test.ts`                                                       | Modell-Liste und Verbindungstest                                           |
| `packages/llm/src/schluessel.test.ts`                                                   | Schlüssel verschlüsseln und umbinden                                       |
| `packages/llm/src/route-schleuse-errors.test.ts`                                        | Weg, Datenschleuse, Fehler-Abbildung                                       |
| `apps/web/src/lib/modelle/anbieter.test.ts`                                             | Routen: Sitzung, Prüfzeichen, Tor, Belege; Schlüssel in keiner Antwort     |
| `apps/web/src/lib/modelle/eigener-anbieter.test.ts`                                     | eigene und lokale Anbieter, Sperre der eigenen Dienste                     |
| `packages/agents/src/motor-netz.test.ts`                                                | Motor erreicht nur das Ziel aus dem Modell-Zugang                          |

Ausführen:

```bash
pnpm --filter @paibot/llm test
pnpm --filter @paibot/web test
```

## Bekannte Schwächen

- **Prüfung „Bot schreibt“ vor dem Tor:** `anbieterLoeschen` prüft vor dem Aufruf des Tors, ob gerade ein Lauf mit dem Anbieter schreibt, und wirft dann `lauf_aktiv` ohne Beleg; ein Lauf, der danach beginnt, ist nicht abgefangen (`apps/web/src/lib/modelle/anbieter.ts#anbieterLoeschen`; Anwender-Doku, Abschnitt „Grenzen“).
- **Nur eine Vorlage:** `PROVIDER_TEMPLATES` kennt nur EUrouter; alles andere ist ein eigener Anbieter (`packages/llm/src/templates.ts#PROVIDER_TEMPLATES`).
