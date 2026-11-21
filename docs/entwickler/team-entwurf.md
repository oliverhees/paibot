<!--
PaiBot – Entwickler-Doku: Format des Team-Entwurfs und die Vorlage „Content-Team“.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Team-Entwurf – für Entwickler

> Stand: Es gibt bisher nur das **Format** und eine **Vorlage** als reine Funktionen und Daten. Es gibt noch keine Seite, keine Route, keine Tabelle und keine Aktion zum Anlegen eines Teams. Eine Anwender-Seite folgt mit der Oberfläche.

## Zweck und Entscheidung

Ein Team ist hier ein Team aus Bots **einer Person**. Der Entwurf beschreibt es als Text (JSON): Team, Ansprechpartner und bis zu sechs Bots mit Name, Aufgabe, Anweisung, Modell, Aussehen und Ausgabegrenze. Dasselbe Format dient Vorlagen, Dateien und später dem Assistenten. Alles wird in `apps/web/src/lib/team/entwurf/format.ts` geprüft, bevor etwas angelegt werden könnte.

Entscheidungen, wie sie im Code stehen:

- Streng: Jedes Objekt ist ein `strictObject`, unbekannte Felder werden abgelehnt, nicht ignoriert (`apps/web/src/lib/team/entwurf/format.ts#entwurfSchema`).
- Rechte stehen nie im Entwurf. Das Format hat kein Feld dafür; eine Anweisung ist nur Text und gibt kein Recht. Fassung 1 hat auch keinen Teil für Übergaben zwischen Bots: Ein solcher Teil kann nur mit einer neuen Fassung des Formats kommen (`ENTWURF_FORMAT` ist ein Literal im Feld `format`).
- Nichts wird gekürzt oder still repariert. Zu lange Texte sind Fehler (`apps/web/src/lib/team/entwurf/format.ts#mehrzeilig`).
- Modelle nur aus der eigenen Liste: Eine Kennung bleibt nur, wenn genau ein eingeschaltetes Modell sie trägt, sonst gilt „wie Pai“ mit Hinweis (`apps/web/src/lib/team/entwurf/format.ts#ordneModelleZu`).

## Aufbau

| Datei                                            | Aufgabe                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/team/entwurf/format.ts`        | Schema, `leseEntwurf`, `ordneModelleZu`, `entwurfAbdruck`, `pruefeEntwurf`, `pruefeEntwurfText` |
| `apps/web/src/lib/team/entwurf/format.test.ts`   | Tests des Formats                                                                               |
| `apps/web/src/lib/team/entwurf/vorlagen.test.ts` | prüft jede Datei in `vorlagen/teams/` gegen das Format                                          |
| `vorlagen/teams/content-team.json`               | Vorlage „Content-Team“: Ideen, Entwurf, Lektorat; Ansprechpartner Pai                           |

Datenfluss: Text → Größengrenze und JSON (`pruefeEntwurfText`) → Schema mit Vereinheitlichen der Texte (`leseEntwurf`) → eindeutige Namen, Ansprechpartner prüfen, Form und Farbe der Reihe nach vergeben → optional Modelle zuordnen (`ordneModelleZu`) → Abdruck (`entwurfAbdruck`).

Format (Fassung `pb-teamentwurf/v1`):

| Feld                    | Regel                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `format`                | genau `pb-teamentwurf/v1`                                                                   |
| `titel`                 | 1 bis 100 Zeichen, eine Zeile                                                               |
| `beschreibung`          | optional, bis 300 Zeichen, eine Zeile                                                       |
| `team.name`             | 1 bis 60 Zeichen                                                                            |
| `team.ansprechpartner`  | `{ "art": "pai" }` oder `{ "art": "bot", "name": … }` mit dem Namen eines Bots des Entwurfs |
| `bots`                  | 1 bis 6 Einträge, Namen ohne Rücksicht auf Groß- und Kleinschreibung eindeutig              |
| `bots[].name`           | 1 bis 60 Zeichen (Grenze der Tabelle `bots`)                                                |
| `bots[].aufgabe`        | 1 bis 200 Zeichen                                                                           |
| `bots[].anweisung`      | nicht leer, bis 8 000 Zeichen im vollen Wortlaut                                            |
| `bots[].modell`         | `"wie_pai"` (Standard) oder `{ "slug": … }`                                                 |
| `bots[].form`, `.farbe` | aus den festen Listen; fehlt eine Angabe, wird sie der Reihe nach vergeben                  |
| `bots[].antwortLaenge`  | ganze Zahl von 1 bis 200 000, Standard 4 096                                                |

Länge zählt in Zeichen (Codepoints) wie `char_length` der Datenbank, nicht in UTF-16-Einheiten. Texte sind in NFC; Namen ohne Leerraum an den Enden. Namen, Titel, Aufgabe und Kennungen sind eine Zeile ohne Steuer- und Formatzeichen. In Anweisungen sind Steuerzeichen außer Zeilenumbruch und Tabulator, Schreibrichtungs- und Null-Breite-Zeichen (außer Verbindern für Schrift und Emoji), Tag-Zeichen und einzelne Ersatz-Hälften verboten.

Abdruck: `sha256:` + Hex von SHA-256 über `pb-teamentwurf/v1` + Zeilenumbruch + kanonisches JSON des geprüften Entwurfs (Schlüssel sortiert, ohne Leerzeichen). Er gilt für den Entwurf nach der Zuordnung der Modelle (`apps/web/src/lib/team/entwurf/format.ts#entwurfAbdruck`).

## Datenmodell und Migrationen

Keine eigenen Tabellen. Gelesen werden nur die Grenzen der Tabelle `bots` (`packages/db/src/schema/anbieter.ts#bots`) über `LIMITS` aus `packages/shared/src/constants.ts` und die Listen `AVATAR_SHAPES` und `BOT_COLORS` aus `packages/shared/src/objects.ts`. Keine Migration.

## Schnittstellen

| Art      | Name                                                | Datei                                     |
| -------- | --------------------------------------------------- | ----------------------------------------- |
| Funktion | `leseEntwurf`, `pruefeEntwurf`, `pruefeEntwurfText` | `apps/web/src/lib/team/entwurf/format.ts` |
| Funktion | `ordneModelleZu`, `entwurfAbdruck`                  | `apps/web/src/lib/team/entwurf/format.ts` |
| Daten    | Vorlage `content-team.json`                         | `vorlagen/teams/content-team.json`        |

Keine Route, keine Aktion, kein Ereignis.

## Sicherheit

- Das Format legt nichts an und hat keinen Zugriff auf Datenbank, Dateien oder Netz; ein Test prüft die Importe der Quelle (`apps/web/src/lib/team/entwurf/format.test.ts`).
- Text wird nur bis 512 KiB gelesen (`ENTWURF_GRENZEN`), alles andere als JSON wird abgewiesen; Schlüssel wie `__proto__` sind unbekannte Felder und verändern keine Prototypen.
- Höchstens 50 Fehler werden gemeldet; Pfade in Fehlern sind auf 120 Zeichen gekürzt.
- Die Vorlage nennt kein Recht und jede Anweisung sagt, dass sie keine Rechte gibt (`apps/web/src/lib/team/entwurf/vorlagen.test.ts`).

## Tests

| Test                                             | Prüft                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/team/entwurf/format.test.ts`   | unbekannte Felder, Grenzen, Codepoints, Texte, Namen, Ansprechpartner, Modelle, Abdruck, Text-Eingabe, keine Übergabe-Teile, Reinheit |
| `apps/web/src/lib/team/entwurf/vorlagen.test.ts` | jede Vorlage ist gültig; Inhalt der Vorlage „Content-Team“                                                                            |

Ausführen:

```bash
pnpm --filter @paibot/web exec vitest run src/lib/team
```

## Bekannte Schwächen

- Es gibt noch keinen Weg, einen Entwurf anzulegen; ob Namen schon vergeben sind, prüft das Format nicht (es kennt die Datenbank nicht).
- Ob Modelle den Entwurf als JSON zuverlässig liefern, ist nicht geprüft.
- Doppelte Schlüssel im JSON werden von `JSON.parse` nicht gemeldet; der letzte gilt.
- Ob ein Name einem bestehenden Bot sehr ähnlich sieht, wird nicht geprüft.
- Datei-Format YAML ist nicht vorgesehen; es gilt JSON.
