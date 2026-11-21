<!--
PaiBot – Entwickler-Doku: Format des Team-Entwurfs und die Vorlage „Content-Team“.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Team-Entwurf – für Entwickler

> Stand: Es gibt bisher nur das **Format** (Fassung 2) und eine **Vorlage** als reine Funktionen und Daten. Es gibt noch keine Seite, keine Route, keine Tabelle und keine Aktion zum Anlegen eines Teams, und nichts, das Zusammenarbeit oder Abnahme ausführt: Das Format hält die Wahl nur fest. Eine Anwender-Seite folgt mit der Oberfläche.

## Zweck und Entscheidung

Ein Team ist hier ein Team aus Bots **einer Person**. Der Entwurf beschreibt es als Text (JSON): Team mit einer Leitung, Zusammenarbeit und Abnahme sowie bis zu sechs Bots mit Name, Aufgabe, Anweisung, Modell, Aussehen und Ausgabegrenze. Dasselbe Format dient Vorlagen, Dateien und später dem Assistenten. Alles wird in `apps/web/src/lib/team/entwurf/format.ts` geprüft, bevor etwas angelegt werden könnte.

Entscheidungen, wie sie im Code stehen:

- Streng: Jedes Objekt ist ein `strictObject`, unbekannte Felder werden abgelehnt, nicht ignoriert (`apps/web/src/lib/team/entwurf/format.ts#entwurfSchema`). Auswahlwerte sind feste Listen; ein unbekannter Wert ist ein Fehler, kein Standard (`apps/web/src/lib/team/entwurf/format.ts#ZUSAMMENARBEIT_WERTE`, `apps/web/src/lib/team/entwurf/format.ts#ABNAHME_WERTE`).
- Die Leitung ist ein eigener Bot des Teams, nie Pai: Das Feld `team.leitung.name` muss den Namen eines Bots des Entwurfs tragen, sonst ist der Entwurf ungültig (`apps/web/src/lib/team/entwurf/format.ts#leseEntwurfV2`). Weil die Leitung Pflicht ist, gibt es keinen gültigen Entwurf mit „Leitung führt“ ohne Leitung.
- Rechte, Regeln für Übergaben und App-Zugriffe stehen nie im Entwurf. Das Format hat kein Feld dafür; eine Anweisung ist nur Text und gibt kein Recht.
- Entwürfe, die ein Modell schreibt, haben keine Zusammenarbeit: Mit `quelle: "assistent"` wird „Leitung führt“ zu „aus“, mit Hinweis (`apps/web/src/lib/team/entwurf/format.ts#pruefeEntwurf`). Vorlagen und Dateien behalten ihren Wert; die Oberfläche soll ihn immer zeigen.
- Ein Bot-Name, der mit „Team “ beginnt, wird abgelehnt, damit er sich nie wie die Anrede eines ganzen Teams liest (`apps/web/src/lib/team/entwurf/format.ts#NAME_WIE_TEAM`).
- Nichts wird gekürzt oder still repariert. Zu lange Texte sind Fehler (`apps/web/src/lib/team/entwurf/format.ts#mehrzeilig`).
- Modelle nur aus der eigenen Liste: Eine Kennung bleibt nur, wenn genau ein eingeschaltetes Modell sie trägt, sonst gilt „wie Pai“ mit Hinweis (`apps/web/src/lib/team/entwurf/format.ts#ordneModelleZu`).

## Aufbau

| Datei                                            | Aufgabe                                                                                                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/team/entwurf/format.ts`        | Schema beider Fassungen, `leseEntwurf`, `leseEntwurfV1`, `leseEntwurfV2`, `ueberfuehreV1`, `ordneModelleZu`, `entwurfAbdruck`, `entwurfAbdruckV1`, `pruefeEntwurf`, `pruefeEntwurfText` |
| `apps/web/src/lib/team/entwurf/format.test.ts`   | Tests des Formats                                                                                                                                                                       |
| `apps/web/src/lib/team/entwurf/vorlagen.test.ts` | prüft jede Datei in `vorlagen/teams/` gegen das Format und die festen Zeilen in den Anweisungen der Vorlage                                                                             |
| `vorlagen/teams/content-team.json`               | Vorlage „Content-Team“: Leitung Redaktion, dazu Ideen, Entwurf, Lektorat; „Leitung führt“ vorausgewählt, Abnahme durch die Leitung                                                      |

Datenfluss: Text → Größengrenze und JSON (`pruefeEntwurfText`) → Fassung aus dem Feld `format` (`leseEntwurf`): Fassung 2 wird geprüft (`leseEntwurfV2`), Fassung 1 geprüft und überführt (`leseEntwurfV1`, `ueberfuehreV1`) → eindeutige Namen, Leitung prüfen, Form und Farbe der Reihe nach vergeben → optional Entwurf des Assistenten auf „aus“ setzen → optional Modelle zuordnen (`ordneModelleZu`) → Abdruck (`entwurfAbdruck`).

Format (Fassung `pb-teamentwurf/v2`):

| Feld                    | Regel                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `format`                | genau `pb-teamentwurf/v2`                                                                                  |
| `titel`                 | 1 bis 100 Zeichen, eine Zeile                                                                              |
| `beschreibung`          | optional, bis 300 Zeichen, eine Zeile                                                                      |
| `team.name`             | 1 bis 60 Zeichen                                                                                           |
| `team.leitung`          | `{ "name": … }` mit dem Namen genau eines Bots des Entwurfs; wird zur Schreibweise des Bots                |
| `team.zusammenarbeit`   | Pflicht: `"aus"` oder `"leitung_fuehrt"`                                                                   |
| `team.abnahme`          | Pflicht: `"leitung"`, `"besitzer"` oder `"ohne"`                                                           |
| `bots`                  | 1 bis 6 Einträge, Namen ohne Rücksicht auf Groß- und Kleinschreibung eindeutig, keiner beginnt mit „Team “ |
| `bots[].name`           | 1 bis 60 Zeichen (Grenze der Tabelle `bots`)                                                               |
| `bots[].aufgabe`        | 1 bis 200 Zeichen, eine kurze Beschreibung der Aufgabe; kein Recht                                         |
| `bots[].anweisung`      | nicht leer, bis 8 000 Zeichen im vollen Wortlaut                                                           |
| `bots[].modell`         | `"wie_pai"` (Standard) oder `{ "slug": … }`                                                                |
| `bots[].form`, `.farbe` | aus den festen Listen; fehlt eine Angabe, wird sie der Reihe nach vergeben                                 |
| `bots[].antwortLaenge`  | ganze Zahl von 1 bis 200 000, Standard 4 096                                                               |

Länge zählt in Zeichen (Codepoints) wie `char_length` der Datenbank, nicht in UTF-16-Einheiten. Texte sind in NFC; Namen ohne Leerraum an den Enden. Namen, Titel, Aufgabe und Kennungen sind eine Zeile ohne Steuer- und Formatzeichen. In Anweisungen sind Steuerzeichen außer Zeilenumbruch und Tabulator, Schreibrichtungs- und Null-Breite-Zeichen (außer Verbindern für Schrift und Emoji), Tag-Zeichen und einzelne Ersatz-Hälften verboten.

Fehlercodes neu in Fassung 2: `leitung_unbekannt` (Name ist kein Bot des Entwurfs, Pfad `team.leitung.name`), `name_reserviert` („Team “ am Anfang), `leitung_fehlt` (nur bei der Überführung, siehe unten). Ein fehlendes oder unbekanntes `zusammenarbeit` oder `abnahme` meldet `ungueltiger_wert` am Pfad des Feldes (`apps/web/src/lib/team/entwurf/format.ts#EntwurfFehlerCode`).

Abdruck: `sha256:` + Hex von SHA-256 über `pb-teamentwurf/v2` + Zeilenumbruch + kanonisches JSON des geprüften Entwurfs (Schlüssel sortiert, ohne Leerzeichen). Er gilt für den Entwurf nach der Zuordnung der Modelle (`apps/web/src/lib/team/entwurf/format.ts#entwurfAbdruck`). Der Vorsatz bindet die Fassung: Derselbe Inhalt hat in Fassung 1 (`entwurfAbdruckV1`, Vorsatz `pb-teamentwurf/v1`) und in Fassung 2 verschiedene Abdrücke.

### Fassung 1 lesen und überführen

Fassung `pb-teamentwurf/v1` wird weiter gelesen (`leseEntwurfV1`), aber nicht mehr geschrieben. `leseEntwurf` und `pruefeEntwurf` überführen sie in Fassung 2 (`apps/web/src/lib/team/entwurf/format.ts#ueberfuehreV1`); das Ergebnis trägt `herkunft: "v1"`:

| Fassung 1                                | Fassung 2                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Titel, Beschreibung, Teamname, alle Bots | unverändert                                                                                       |
| Ansprechpartner: ein Bot                 | `team.leitung` mit demselben Bot                                                                  |
| Ansprechpartner: Pai                     | keine Leitung ableitbar: Fehler `leitung_fehlt`, außer die Person nennt den Bot (`leitungFuerV1`) |
| (kein Feld)                              | `zusammenarbeit` = `aus`, `abnahme` = `besitzer`                                                  |

Es wird nie ein Bot als Leitung erraten, und Fassung 1 kannte keine Übergaben zwischen Bots; darum „aus“ und die Abnahme bei der Person. Das Ergebnis wird wie jeder Entwurf der Fassung 2 geprüft (zum Beispiel der Name „Team …“).

### Vorlage „Content-Team“

Die Vorlage ist in Fassung 2 geschrieben: Team „Content“, Leitung „Redaktion“, Zusammenarbeit „Leitung führt“ (ausdrücklich vorausgewählt, die Oberfläche zeigt den Wert), Abnahme durch die Leitung, vier Bots (`vorlagen/teams/content-team.json`). Die Anweisungen lehren die festen Zeilen, an denen später erkannt werden kann, was ein Bot will:

| Wer      | Zeile                                                                     | Bedeutung                          |
| -------- | ------------------------------------------------------------------------- | ---------------------------------- |
| Leitung  | `@Name: Auftrag … Fertig, wenn: …`                                        | Arbeit an ein Mitglied weitergeben |
| Leitung  | `Zurück an @Name: Grund`                                                  | Arbeit zurückgeben                 |
| Leitung  | `Fertig: Kurzfassung`                                                     | Arbeit abnehmen                    |
| Mitglied | `Frage an dich: …`, direkt darunter optional `Möglichkeiten: a \| b \| c` | eine Frage an die Person stellen   |

Alle Zeilen stehen in Spalte 0, mit ASCII-`@` und ASCII-`:`. Ein Test zieht die Beispiel-Zeilen aus den Anweisungen und gleicht sie mit einem festen Muster ab (`apps/web/src/lib/team/entwurf/vorlagen.test.ts`). Die Erkennung selbst gehört nicht zu diesem Paket. Die Anweisungen sagen „abnehmen“, nie „freigeben“, und versprechen nichts, was PaiBot nicht kann: kein Internet, keine Werkzeuge, keine Bilder.

## Datenmodell und Migrationen

Keine eigenen Tabellen. Gelesen werden nur die Grenzen der Tabelle `bots` (`packages/db/src/schema/anbieter.ts#bots`) über `LIMITS` aus `packages/shared/src/constants.ts` und die Listen `AVATAR_SHAPES` und `BOT_COLORS` aus `packages/shared/src/objects.ts`. Keine Migration.

## Schnittstellen

| Art      | Name                                                             | Datei                                     |
| -------- | ---------------------------------------------------------------- | ----------------------------------------- |
| Funktion | `leseEntwurf`, `leseEntwurfV1`, `leseEntwurfV2`, `ueberfuehreV1` | `apps/web/src/lib/team/entwurf/format.ts` |
| Funktion | `pruefeEntwurf`, `pruefeEntwurfText`                             | `apps/web/src/lib/team/entwurf/format.ts` |
| Funktion | `ordneModelleZu`, `entwurfAbdruck`, `entwurfAbdruckV1`           | `apps/web/src/lib/team/entwurf/format.ts` |
| Daten    | Vorlage `content-team.json`                                      | `vorlagen/teams/content-team.json`        |

Keine Route, keine Aktion, kein Ereignis.

## Sicherheit

- Das Format legt nichts an und hat keinen Zugriff auf Datenbank, Dateien oder Netz; ein Test prüft die Importe der Quelle (`apps/web/src/lib/team/entwurf/format.test.ts`).
- Text wird nur bis 512 KiB gelesen (`ENTWURF_GRENZEN`), alles andere als JSON wird abgewiesen; Schlüssel wie `__proto__` sind unbekannte Felder und verändern keine Prototypen.
- Höchstens 50 Fehler werden gemeldet; Pfade in Fehlern sind auf 120 Zeichen gekürzt.
- Zusammenarbeit und Abnahme sind nur Auswahlwerte; sie geben kein Recht und lösen nichts aus. Ein Entwurf des Assistenten kann „Leitung führt“ nicht selbst einschalten (`apps/web/src/lib/team/entwurf/format.test.ts`).
- Die Vorlage nennt kein Recht und jede Anweisung sagt, dass sie keine Rechte gibt (`apps/web/src/lib/team/entwurf/vorlagen.test.ts`).

## Tests

| Test                                             | Prüft                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/team/entwurf/format.test.ts`   | unbekannte Felder, Grenzen, Codepoints, Texte, Namen, Leitung, Zusammenarbeit und Abnahme, Modelle, Abdruck und Bindung an die Fassung, Fassung 1 lesen und überführen, Entwurf des Assistenten, Text-Eingabe, keine Rechte, Reinheit |
| `apps/web/src/lib/team/entwurf/vorlagen.test.ts` | jede Vorlage ist gültig; Inhalt der Vorlage „Content-Team“; Beispiel-Zeilen der Anweisungen gegen die feste Form; kein „freigeben“; keine Versprechen über Fähigkeiten, die PaiBot nicht hat                                          |

Ausführen:

```bash
pnpm --filter @paibot/web exec vitest run src/lib/team
```

## Bekannte Schwächen

- Es gibt noch keinen Weg, einen Entwurf anzulegen; ob Namen schon vergeben sind, prüft das Format nicht (es kennt die Datenbank nicht).
- Zusammenarbeit „Leitung führt“ und Abnahme sind bisher nur gespeicherte Wahl: Nichts im Programm führt sie aus. Abnahme „leitung“ bei Zusammenarbeit „aus“ ist erlaubt und wirkt dann nicht.
- Ob Modelle den Entwurf als JSON zuverlässig liefern und ob sie die festen Zeilen der Vorlage einhalten, ist nicht geprüft.
- Das feste Muster im Test bildet die Zeilen-Form nach; es ist von der späteren Erkennung unabhängig und muss mit ihr abgeglichen werden, wenn sie sich ändert.
- Doppelte Schlüssel im JSON werden von `JSON.parse` nicht gemeldet; der letzte gilt.
- Ob ein Name einem bestehenden Bot sehr ähnlich sieht, wird nicht geprüft.
- Datei-Format YAML ist nicht vorgesehen; es gilt JSON.
