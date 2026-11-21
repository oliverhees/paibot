<!--
PaiBot – Entwickler-Doku: Selbsttest (Prüfungen der Installation von innen).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Selbsttest – für Entwickler

**Anwender-Doku:** [Selbsttest](../funktion-selbsttest.md)

## Zweck und Entscheidung

Der Selbsttest sammelt, was die Web-App von innen sehen kann (Umgebung, beobachtete Anfrage, Datenbank, Meldung des Workers), und gibt nur Ergebnisse und Sätze zurück (`apps/web/src/lib/selbsttest/selbsttest.ts`, Kopfkommentar).

Belegte Entscheidungen im Code:

- **Reine Prüfungen:** Jede Prüfung ist eine reine Funktion, bekommt nur, was sie braucht, und liefert Ergebnis, Satz und Ausweg (`apps/web/src/lib/selbsttest/pruefungen.ts`, Kopfkommentar).
- **Keine Adressen, Rollen oder Geheimnisse in der Antwort:** Kopfkommentar in `apps/web/src/lib/selbsttest/selbsttest.ts`; Rechte der Rolle kommen nur als Ergebnis und lesbare Gründe zurück (`RollenBefund`).
- **Zwei Prüfungen im Browser:** `verbindung` und `kopfzeilen`, weil nur der Browser seine Verbindung und die ankommenden Kopfzeilen sieht (`apps/web/src/lib/selbsttest/pruefungen.ts#BROWSER_PRUEFUNGEN`).
- **Dieselben Prüfungen wie beim Start:** Rolle und Migrationen prüft der Selbsttest mit `checkAppRole` und `checkMigrationState` aus `packages/db/src/rollen.ts` über die Verbindung des Prozesses.

## Aufbau

| Datei                                                      | Aufgabe                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/selbsttest/pruefungen.ts`                | die Prüfungen (`pruefeAdresse`, `pruefeProxy`, `pruefeVerbindung`, `pruefeKopfzeilen`, `pruefeRolle`, `pruefeSchalter`, `pruefeMigrationen`, `pruefeWorker`, `pruefeSchleuse`, `pruefeEinrichtung`, `pruefeNotAus`, `pruefeZugang`, `pruefeVersion`), `zusammenfassung`, `geordnet` |
| `apps/web/src/lib/selbsttest/selbsttest.ts`                | `selbsttestLesen`: Quellen lesen (`SelbsttestQuellen`) und Prüfungen ausführen                                                                                                                                                                                                      |
| `packages/db/src/rollen.ts`                                | `checkAppRole`, `checkMigrationState`                                                                                                                                                                                                                                               |
| `apps/web/src/app/api/selbsttest/route.ts`                 | `GET /api/selbsttest`                                                                                                                                                                                                                                                               |
| `apps/web/src/app/(app)/einstellungen/selbsttest/page.tsx` | Reiter „Selbsttest“; Oberfläche in `apps/web/src/app/(app)/einstellungen/selbsttest/Selbsttest.tsx`                                                                                                                                                                                 |
| `apps/web/src/lib/navigation.ts`                           | Weg dorthin: Eintrag „Selbsttest“ im Menü „Du“ unter „Hilfe“ (`duEintraege`, `DU_ADRESSEN.selbsttest`)                                                                                                                                                                              |

Prüfungen in fester Reihenfolge: `adresse`, `proxy`, `verbindung`, `kopfzeilen`, `rolle`, `schalter`, `migrationen`, `worker`, `schleuse`, `einrichtung`, `notaus`, `zugang`, `version` (`apps/web/src/lib/selbsttest/pruefungen.ts#PRUEF_IDS`).

Datenfluss:

1. Der Browser ruft `GET /api/selbsttest`; der Rahmen prüft die Sitzung (`apps/web/src/lib/api/route.ts`).
2. `selbsttestLesen` liest Rolle und Migrationen über die Verbindung des Prozesses, ohne `DATABASE_URL` oder bei Fehler „unbekannt“ (`PROZESS_QUELLEN` in `apps/web/src/lib/selbsttest/selbsttest.ts`), dazu die Meldung des Workers (`workerMeldungAus`).
3. Die Oberfläche ergänzt `verbindung` und `kopfzeilen` (Pflicht-Kopfzeilen `PFLICHT_KOPFZEILEN`: `content-security-policy`, `x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy`).

## Datenmodell und Migrationen

Keine eigenen Tabellen. Gelesen werden `settings`, `schleuse_zustand` (Meldung des Workers), `geraete` und `sessions` des Besitzers über `repo` (`apps/web/src/lib/selbsttest/selbsttest.ts`); die Migrationen werden gegen den Ordner `MIGRATIONS_DIR` bzw. `packages/db/drizzle/` verglichen (`migrationsOrdner` in `apps/web/src/lib/selbsttest/selbsttest.ts`).

## Schnittstellen

| Art   | Name                        | Datei                                                      |
| ----- | --------------------------- | ---------------------------------------------------------- |
| Route | `GET /api/selbsttest`       | `apps/web/src/app/api/selbsttest/route.ts`                 |
| Seite | `/einstellungen/selbsttest` | `apps/web/src/app/(app)/einstellungen/selbsttest/page.tsx` |

Keine Aktion des Tors: Die Route ist lesend (`veraendernd: false` in `apps/web/src/lib/routen.ts#API_ROUTEN`).

## Sicherheit

- **Nur mit Sitzung:** Zugang `besitzer` (`apps/web/src/lib/routen.ts#API_ROUTEN`).
- **Liest nur, kein Beleg:** lesende Route ohne Tor; ein Test prüft, dass sie nichts schreibt und weder Adressen noch Geheimnisse noch Namen von Rollen nennt (`apps/web/src/lib/selbsttest/selbsttest.test.ts`).
- **Rechte der App-Rolle:** Die Prüfung nutzt dieselbe Verbindung wie die App; zu viele Rechte meldet sie als `zu_viele_rechte` (`apps/web/src/lib/selbsttest/selbsttest.ts#RollenBefund`). Die Ausnahme `PAIBOT_ALLOW_PRIVILEGED_DB` steht in `packages/db/src/rollen-start.ts#ALLOW_PRIVILEGED_DB_ENV`.

## Tests

| Test                                                                 | Prüft                                                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web/src/lib/selbsttest/pruefungen.test.ts`                     | jede Prüfung mit gutem und schlechtem Fall, jeder Hinweis mit Ausweg       |
| `apps/web/src/lib/selbsttest/selbsttest.test.ts`                     | Route: nur angemeldet, liest nur, keine Adressen, Geheimnisse, Rollennamen |
| `apps/web/src/app/(app)/einstellungen/selbsttest/selbsttest.test.ts` | Render des Reiters, Ladezustand, „Bitte selbst prüfen“                     |

Ausführen:

```bash
pnpm --filter @paibot/web test
```

## Bekannte Schwächen

- **Nur Sicht von innen:** Grenzen im Reverse-Proxy, Sicherung, Updates und Herkunft der Images kann der Selbsttest nicht prüfen; die Oberfläche listet sie unter „Bitte selbst prüfen“ (Anwender-Doku, Abschnitt „Grenzen“; Render-Test `apps/web/src/app/(app)/einstellungen/selbsttest/selbsttest.test.ts`).
- **Proxy nur an Nebenzeichen erkennbar:** Next.js setzt `X-Forwarded-For` bei jeder Anfrage selbst, falls sie fehlt (in Next.js 16.4.6, Datei „base-server.js“ im Paket `next`: `req.headers["x-forwarded-for"] ??= …remoteAddress`); die Kopfzeile beweist also keinen Proxy. `proxyErkennbar` wertet nur `Forwarded`, `X-Real-Ip`, `X-Forwarded-Server`, `Via` und mehrere Adressen in `X-Forwarded-For` aus; ein Proxy ohne diese Zeichen bleibt unsichtbar, `TRUST_PROXY=1` ergibt dann „nicht feststellbar“ (Hinweis). Anwender-Doku, Abschnitt „Grenzen“; Tests in `apps/web/src/lib/selbsttest/pruefungen.test.ts` und `selbsttest.test.ts`.
