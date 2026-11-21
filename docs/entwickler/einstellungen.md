<!--
PaiBot – Entwickler-Doku: Einstellungen und Info (Zugang, Geräte, Grenzen, Stand).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Einstellungen und Info – für Entwickler

**Anwender-Doku:** [Einstellungen und Info](../funktion-einstellungen.md)

## Zweck und Entscheidung

Die Seite „Einstellungen“ bündelt die Reiter Zugang (Passwort, Sitzungen, bekannte Geräte), Grenzen (Tagesbudget, Verlaufsgrenze, Zeitzone) und Selbsttest; „Info“ zeigt Stand und Lizenz. Erreichbar sind die Seiten über die Reiter (`apps/web/src/app/(app)/einstellungen/EinstellungenRahmen.tsx#EINSTELLUNGEN_REITER`) und über das Menü „Du“ unten in der Seitenleiste (`apps/web/src/lib/navigation.ts#duEintraege`, Ziele in `apps/web/src/lib/navigation.ts#DU_ADRESSEN`). Die Grenzen stehen in `apps/web/src/lib/einstellungen/grenzen.ts`, der Zugang in `apps/web/src/lib/zugang/anmeldung.ts` (siehe [Einrichtung und Zugang](einrichtung-und-zugang.md)), der Selbsttest auf einer eigenen Seite ([Selbsttest](selbsttest.md)).

Belegte Entscheidungen im Code:

- **Beleg nennt Felder, nicht Werte:** Der Fakt von `einstellung.aendern` ist die Liste der mitgeschickten Felder (`fields`) (`apps/web/src/lib/einstellungen/grenzen.ts#einstellungenAendern`, `packages/shared/src/actions.ts#SETTINGS_FIELDS`).
- **Tagesbudget im Tor:** G-04 prüft bei `modell.anfragen`, dass `tokensToday` kleiner als `dailyTokenBudget` ist; ohne Budget `entfaellt` (`packages/gate/src/limits/index.ts#limitTagesbudget`).
- **Info lädt nichts von fremden Servern:** Alle Adressen sind normale Links (`apps/web/src/lib/einstellungen/info.ts`, Kopfkommentar); ein Test prüft das (`apps/web/src/app/(app)/einstellungen/info.test.ts`).

## Aufbau

| Datei                                                          | Aufgabe                                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/einstellungen/grenzen.ts`                    | `einstellungenLesen` (mit heutigem Verbrauch), `einstellungenAendern`, `tagesbeginn`, `tokenSeit`                                                                    |
| `apps/web/src/lib/einstellungen/anzeige.ts`                    | reine Hilfen ohne Zod: grobe Geräte-Angabe, Prüfliste fürs Passwort, Prüfung der Grenzen                                                                             |
| `apps/web/src/lib/einstellungen/geraete.ts`                    | Ansicht „Bekannte Geräte“ und Hinweis auf neue Anmeldungen                                                                                                           |
| `apps/web/src/lib/einstellungen/info.ts`                       | feste Adressen der Info-Seite und des Menüs „Du“ (`INFO_LINKS`, darunter Roadmap und Änderungsliste)                                                                 |
| `apps/web/src/lib/navigation.ts`                               | Einträge der Seitenleiste (`NAVIGATION`) und des Menüs „Du“ (`duEintraege`); Persönliches steht nur im Menü „Du“                                                     |
| `apps/web/src/app/(app)/AppRahmen.tsx`                         | baut das Menü „Du“ aus `duEintraege` (Komponente `DuMenue`), darin auch „Abmelden“                                                                                   |
| `apps/web/src/app/(app)/einstellungen/EinstellungenRahmen.tsx` | Rahmen mit den Reitern der Einstellungen (`EINSTELLUNGEN_REITER`)                                                                                                    |
| `apps/web/src/lib/zugang/anmeldung.ts`                         | Passwort ändern, Sitzungen, Geräte entfernen, alle abmelden                                                                                                          |
| `apps/web/src/lib/stand.ts`                                    | Stand der Software: `PAIBOT_BUILD` oder `<version>+dev` (`stand`)                                                                                                    |
| `apps/web/src/app/(app)/einstellungen/page.tsx`                | Reiter Zugang; `apps/web/src/app/(app)/einstellungen/Zugang.tsx`, `apps/web/src/app/(app)/einstellungen/Geraete.tsx`                                                 |
| `apps/web/src/app/(app)/einstellungen/grenzen/page.tsx`        | Reiter Grenzen; `apps/web/src/app/(app)/einstellungen/Grenzen.tsx`                                                                                                   |
| `apps/web/src/app/(app)/einstellungen/darstellung/page.tsx`    | Reiter Darstellung; `apps/web/src/app/(app)/einstellungen/Darstellung.tsx` (Wahl der Fassung des Startbereichs, Cookie über `apps/web/src/lib/chat/startbereich.ts`) |
| `apps/web/src/app/(app)/info/page.tsx`                         | Seite „Info“; `apps/web/src/app/(app)/einstellungen/InfoInhalt.tsx`                                                                                                  |

Datenfluss „Grenzen speichern“ (`apps/web/src/lib/einstellungen/grenzen.ts#einstellungenAendern`):

1. `PATCH /api/einstellungen` mit `settingsInput`; mindestens ein Feld muss gesetzt sein (`packages/shared/src/inputs.ts#settingsInput`).
2. Ohne abgeschlossene Einrichtung `einrichtung_offen`.
3. Tor mit `einstellung.aendern` und `{ fields }`; in der Ausführung `repo.settings.update`.
4. Antwort mit den neuen Einstellungen, dem Verbrauch seit Tagesbeginn in der Zeitzone und dem Beleg „Ergebnis“.

## Datenmodell und Migrationen

| Tabelle               | Schema                                     | Wofür                                                                                                          |
| --------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `settings`            | `packages/db/src/schema/settings.ts`       | `timezone` (Standard `Europe/Berlin`), `daily_token_budget`, `history_token_limit` (beide leer = keine Grenze) |
| `messages`            | `packages/db/src/schema/unterhaltungen.ts` | Token je Antwort; daraus der Verbrauch des Tages                                                               |
| `sessions`, `geraete` | `packages/db/src/schema/zugang.ts`         | Sitzungen und bekannte Geräte                                                                                  |

`settings` legt `packages/db/drizzle/0000_init.sql` an. Zugriff über `packages/db/src/repo/einstellungen.ts`.

## Schnittstellen

Routen aus `apps/web/src/lib/routen.ts#API_ROUTEN` (Zugang `besitzer`):

| Route                                    | Aktion                    |
| ---------------------------------------- | ------------------------- |
| `GET /api/einstellungen`                 | – (lesend)                |
| `PATCH /api/einstellungen`               | `einstellung.aendern`     |
| `POST /api/zugang/passwort`              | `zugang.passwort_aendern` |
| `GET /api/zugang/sitzungen`              | – (lesend)                |
| `POST /api/zugang/alle-abmelden`         | `zugang.alle_abmelden`    |
| `GET /api/zugang/geraete`                | – (lesend)                |
| `POST /api/zugang/geraete/:id/entfernen` | `geraet.entfernen`        |
| `POST /api/zugang/geraete/hinweis`       | `geraet.bestaetigen`      |

Route-Datei der Einstellungen: `apps/web/src/app/api/einstellungen/route.ts`.

## Sicherheit

- **Passwort ändern:** Das aktuelle Passwort prüft die Route vor dem Tor und meldet ihm nur, ob es stimmt; das Tor verlangt es über V-06 `passwort_bestaetigt` (`apps/web/src/lib/zugang/anmeldung.ts#passwortAendern`, `packages/shared/src/gate.ts#PRECONDITIONS`). Versuche zählen auf das Limit `passwortAendern`, 5 je 15 Minuten je Sitzung; darüber endet die Sitzung (`apps/web/src/lib/rate-limit.ts#ZUSATZ_LIMITS`, `apps/web/src/lib/rate-limit.ts#limitSchluessel`, `beiLimitAbmelden` in `apps/web/src/lib/routen.ts`).
- **Grenzen der Werte:** Verlaufsgrenze 1 bis `historyTokens` (2 000 000), Tagesbudget 1 bis `dailyTokenBudget` (1 000 000 000) (`packages/shared/src/constants.ts`).
- **Tor:** Jede Änderung geht mit Sitzung durch das Tor (R-001) und hat zwei Belege.

## Tests

| Test                                                   | Prüft                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `apps/web/src/lib/einstellungen/grenzen.test.ts`       | Route `/api/einstellungen`: Sitzung, CSRF, ungültige Werte, Belege, Ablehnung, Verbrauch |
| `apps/web/src/lib/einstellungen/tor-grenzen.test.ts`   | Wirkung im Tor: Not-Aus (G-05) und Tagesbudget                                           |
| `apps/web/src/lib/einstellungen/zugang-ablauf.test.ts` | Reiter „Zugang“ gegen die Routen: Passwort ändern, Sitzungen                             |
| `apps/web/src/lib/einstellungen/anzeige.test.ts`       | reine Hilfen ohne DOM                                                                    |
| `apps/web/src/app/(app)/einstellungen/seiten.test.ts`  | Render der Reiter, Browser-Module nur mit Routen aus dem Vertrag                         |
| `apps/web/src/app/(app)/einstellungen/geraete.test.ts` | Ansicht „Bekannte Geräte“ und Leiste „Neue Anmeldung“                                    |
| `apps/web/src/app/(app)/einstellungen/info.test.ts`    | Info-Seite: Aussagen, Links mit `rel`, nichts von fremden Servern                        |
| `apps/web/src/lib/navigation.test.ts`                  | Seitenleiste und Menü „Du“: Einträge, Reihenfolge, Ziele                                 |
| `packages/db/src/repo/einstellungen.test.ts`           | Einstellungen in der Datenbank                                                           |

Ausführen:

```bash
pnpm --filter @paibot/web test
```

## Bekannte Schwächen

- **Darstellung nur je Browser:** Die Fassung des Startbereichs liegt in einem Cookie (`apps/web/src/lib/chat/startbereich.ts#FASSUNG_COOKIE`), nicht in den Einstellungen auf dem Server; ein anderes Gerät sieht den Standard.
- **Tagesbudget erst bei der nächsten Anfrage:** G-04 prüft vor jeder Anfrage an das Modell; eine laufende Antwort wird nicht beim Erreichen des Budgets abgebrochen (`packages/gate/src/limits/index.ts#limitTagesbudget` betrifft nur `modell.anfragen`; der Wächter eines Laufs prüft Herzschlag, Abbruch-Wunsch, Not-Aus und Zeitgrenzen, `packages/agents/src/run/waechter.ts`).
