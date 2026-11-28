<!--
PaiBot – Entwickler-Doku: Format des Team-Entwurfs und die Vorlage „Content-Team“.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Team-Entwurf – für Entwickler

> Stand: Der Weg über einen Entwurf ist **gebaut**, aber nur aus einer **Vorlage**: Seite `/team-entwurf`, sieben Routen (`apps/web/src/lib/routen.ts`), die vier Aktionen `team.entwurf_erstellen`, `team.entwurf_verwerfen`, `team.entwurf_anlegen`, `team.entwurf_zuruecknehmen` der Fassung 4 (`packages/shared/src/tor-fassung-4.ts`) und die Tabellen `team_entwuerfe` und `team_anlagen` (`packages/db/src/schema/teams.ts`). Entwürfe aus einer hochgeladenen Datei und aus einem Zuruf an den Assistenten gibt es noch nicht: `verwaltung.ts` schreibt immer `herkunft: "vorlage"` (`apps/web/src/lib/team/entwurf/verwaltung.ts#HERKUNFT`). Nichts führt Zusammenarbeit oder Abnahme aus: Beide halten die Wahl nur fest, hier im Entwurf und dort am Team. Siehe auch [Bots und Teams](bots-und-teams.md).

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

Entscheidungen zum Weg vom Entwurf zum Team:

- **Nur über die vier Aktionen wird geschrieben.** `bots` und `teams` werden aus diesem Bereich allein in `packages/db/src/repo/entwuerfe.ts#anwenden` und `#zuruecknehmen` angefasst, und die rufen nur die Routen in einem `k.tor(…)`-Block. Zwei Tests führen darüber Listen und meckern jede neue Stelle an: `packages/db/src/teams-nur-besitzer-weg.test.ts` und `apps/web/src/gate-pflicht-quelltext.test.ts`.
- **Die Vorschau darf ändern, aber nicht am Tor vorbei.** Der Vertrag verlangt mit der Vorbedingung „Entwurf-Fassung passt“, dass der mitgeschickte Abdruck zum angelegten Inhalt passt. Darum schickt die Seite beim Klick den geänderten Inhalt mit (`content`), der Server prüft ihn mit demselben Format und rechnet den Abdruck selbst (`apps/web/src/lib/team/entwurf/verwaltung.ts#teamEntwurfAnlegen`). Verworfen: den geänderten Inhalt vorher in die Zeile schreiben – das wäre ein Schreibzugriff auf `team_entwuerfe` außerhalb des Tors.
- **Der Verfall braucht keinen Aufräum-Auftrag.** Jede Stelle, die einen Entwurf zum Anlegen oder Anzeigen liest, ruft `packages/db/src/repo/entwuerfe.ts#mitVerfall`: Ist `gilt_bis` vorbei, wird der Stand auf `verfallen` gesetzt und dieser zurückgegeben. So sieht der Leser denselben Stand, mit dem das Anlegen rechnet.
- **Die Fassung einer Vorlage ist ihr Abdruck.** `quelle` ist `content-team@<12 Hex-Stellen>` (`apps/web/src/lib/team/entwurf/vorlagen.ts`). Die Vorlagen tragen kein Feld `fassung`; ein eigenes Feld hätte den Schlüsselsatz-Test der Datei gebrochen, ein Zähler in einer zweiten Datei wäre eine zweite Wahrheit.
- **„Rückgängig“ ist alles oder nichts.** Es prüft vor und in der Transaktion erneut, dass kein neuer Bot gelaufen ist, keine Nachricht hat, kein Faden im neuen Team steht und kein Teil geändert wurde (`packages/db/src/repo/entwuerfe.ts#nutzung`). Trifft etwas davon zu, lehnt das Tor ab; einzeln löschen geht weiter über die Seite des Bots.
- **Der Not-Aus sperrt nur das Anlegen.** Er ist Fakt der Aktion `team.entwurf_anlegen`, nicht der drei anderen: Lesen, Verwerfen und Zurücknehmen nehmen nichts in Betrieb.

## Aufbau

| Datei                                            | Aufgabe                                                                                                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/team/entwurf/format.ts`        | Schema beider Fassungen, `leseEntwurf`, `leseEntwurfV1`, `leseEntwurfV2`, `ueberfuehreV1`, `ordneModelleZu`, `entwurfAbdruck`, `entwurfAbdruckV1`, `pruefeEntwurf`, `pruefeEntwurfText` |
| `apps/web/src/lib/team/entwurf/format.test.ts`   | Tests des Formats                                                                                                                                                                       |
| `apps/web/src/lib/team/entwurf/vorlagen.test.ts` | prüft jede Datei in `vorlagen/teams/` gegen das Format und die festen Zeilen in den Anweisungen der Vorlage                                                                             |
| `vorlagen/teams/content-team.json`               | Vorlage „Content-Team“: Leitung Redaktion, dazu Ideen, Entwurf, Lektorat; „Leitung führt“ vorausgewählt, Abnahme durch die Leitung                                                      |
| `apps/web/src/lib/team/entwurf/vorlagen.ts`      | lädt die Vorlagen als Dateien aus dem Image (`ladeVorlagen`, `ladeVorlage`), prüft jede streng, bildet `quelle`                                                                         |
| `apps/web/src/lib/team/entwurf/verwaltung.ts`    | die Logik der sieben Routen: Fakten sammeln, Tor rufen, Ergebnis zurückgeben                                                                                                            |
| `apps/web/src/lib/team/entwurf/seite.ts`         | das Lesen für die Seite: Vorlagen, Entwürfe, Not-Aus; bildet `verfallen` auf `verworfen` ab                                                                                             |
| `apps/web/src/lib/team/entwurf/vorschau.ts`      | `inhaltMitAuswahl` und `geprueftMitAbdruck` – was der Browser vor dem Klick rechnet                                                                                                     |
| `packages/db/src/repo/entwuerfe.ts`              | Zugriff auf `team_entwuerfe` und `team_anlagen`: anlegen, lesen, zählen, `mitVerfall`, `nutzung`, `anwenden`, `zuruecknehmen`, `verwerfen`                                              |
| `packages/ui/src/teams/Entwurf.tsx`              | die Vorschau: Teile mit Häkchen, voller Wortlaut zum Ändern, Kosten-Hinweis, Anlegen und Rückgängig                                                                                     |
| `apps/web/src/app/(app)/team-entwurf/`           | die Seite `/team-entwurf` (Server-Teil, Browser-Teil, Gestaltung)                                                                                                                       |

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

**Keine Migration in diesem Paket**: Beide Tabellen lagen schon vorher auf `main`.

| Tabelle          | Rolle                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `team_entwuerfe` | ein Entwurf je Zeile: `origin`, `source`, `title`, `content` (JSON), `digest`, `format_version`, `valid_until`, `status`, `action_id` (`packages/db/src/schema/teams.ts`) |
| `team_anlagen`   | je angelegtes Objekt eine Zeile, nur angehängt: welcher Entwurf hat welches Team und welchen Bot erzeugt. Sie bleibt auch nach „Rückgängig“ stehen                        |

Der Stand eines Entwurfs wechselt nur über `packages/db/src/repo/teams.ts#entwurfStandSetzen`; erlaubt sind allein die Wechsel aus `ENTWURF_WECHSEL`. Jeder neue Bot trägt seinen Entwurf in `bots.from_draft_id` (`packages/db/src/repo/bots.ts`), damit nachprüfbar bleibt, woher er kommt.

Gelesen werden außerdem die Grenzen der Tabelle `bots` (`packages/db/src/schema/anbieter.ts#bots`) über `LIMITS` aus `packages/shared/src/constants.ts` und die Listen `AVATAR_SHAPES` und `BOT_COLORS` aus `packages/shared/src/objects.ts`. Die Zahlen des Weges stehen je einmal: `botsMax` (6 Bots je Entwurf) in `ENTWURF_GRENZEN` des Formats, `bots` (50 insgesamt), `teamDraftsOpen` (5 offen), `teamDraftsPerDay` (20 am Tag) und `teamDraftValidDays` (7 Tage) in `LIMITS`.

## Schnittstellen

| Art      | Name                                                             | Datei                                         |
| -------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Funktion | `leseEntwurf`, `leseEntwurfV1`, `leseEntwurfV2`, `ueberfuehreV1` | `apps/web/src/lib/team/entwurf/format.ts`     |
| Funktion | `pruefeEntwurf`, `pruefeEntwurfText`                             | `apps/web/src/lib/team/entwurf/format.ts`     |
| Funktion | `ordneModelleZu`, `entwurfAbdruck`, `entwurfAbdruckV1`           | `apps/web/src/lib/team/entwurf/format.ts`     |
| Daten    | Vorlage `content-team.json`                                      | `vorlagen/teams/content-team.json`            |
| Funktion | `ladeVorlagen`, `ladeVorlage`                                    | `apps/web/src/lib/team/entwurf/vorlagen.ts`   |
| Funktion | `entwurfAnsicht`, `entwurfModelle`, `teamVorlagenAnsichten`      | `apps/web/src/lib/team/entwurf/verwaltung.ts` |
| Funktion | `inhaltMitAuswahl`, `geprueftMitAbdruck`                         | `apps/web/src/lib/team/entwurf/vorschau.ts`   |

Routen (Vertrag in `apps/web/src/lib/routen.ts`, Dateien unter `apps/web/src/app/api/team-vorlagen/` und `apps/web/src/app/api/team-entwuerfe/`):

| Methode, Pfad                                | Name                       | Aktion                       |
| -------------------------------------------- | -------------------------- | ---------------------------- |
| `GET /api/team-vorlagen`                     | `teamVorlagenListe`        | – (liest)                    |
| `GET /api/team-entwuerfe`                    | `teamEntwuerfeListe`       | – (liest)                    |
| `POST /api/team-entwuerfe`                   | `teamEntwurfErstellen`     | `team.entwurf_erstellen`     |
| `GET /api/team-entwuerfe/:id`                | `teamEntwurfLesen`         | – (liest)                    |
| `DELETE /api/team-entwuerfe/:id`             | `teamEntwurfVerwerfen`     | `team.entwurf_verwerfen`     |
| `POST /api/team-entwuerfe/:id/anlegen`       | `teamEntwurfAnlegen`       | `team.entwurf_anlegen`       |
| `POST /api/team-entwuerfe/:id/zuruecknehmen` | `teamEntwurfZuruecknehmen` | `team.entwurf_zuruecknehmen` |

`teamEntwurfAnlegen` hat `koerperBytes: 256 * 1024` (Standard sind 16 KiB, `apps/web/src/lib/api/koerper.ts`), weil der Körper den Inhalt der Vorschau trägt: bis zu sechs Anweisungen à 8 000 Zeichen. Derselbe Pfad ist im Matcher von `apps/web/src/proxy.ts` ausgenommen, wie schon die Pfade für Bots und Nachrichten.

Fakten, die der Server je Aktion ans Tor gibt – alle aus der Datenbank, keiner aus dem Browser:

| Aktion                       | Fakten                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `team.entwurf_erstellen`     | `herkunft`, `offeneEntwuerfe`, `maxOffeneEntwuerfe`, `entwuerfeHeute`, `maxEntwuerfeProTag`, `killSwitch`                                                                 |
| `team.entwurf_verwerfen`     | `entwurfOffen`                                                                                                                                                            |
| `team.entwurf_anlegen`       | `entwurfOffen`, `entwurfDigest`, `seenEntwurfDigest`, `namesFree`, `modelsAvailable`, `contactInDraft`, `draftBots`, `maxDraftBots`, `botsAfter`, `maxBots`, `killSwitch` |
| `team.entwurf_zuruecknehmen` | `allUnused`, `allUnchanged`                                                                                                                                               |

`seenEntwurfDigest` ist das Einzige, was aus der Anfrage kommt – es ist ja gerade die Frage, was der Browser gesehen hat. `namesFree` prüft die Namen aller Bots des Entwurfs **und** den des Teams (`teams.name` ist eindeutig): Sonst scheiterte erst die Transaktion, statt dass das Tor mit einem Beleg und einem Ausweg ablehnt.

Kein neues Ereignis.

## Sicherheit

- Das Format legt nichts an und hat keinen Zugriff auf Datenbank, Dateien oder Netz; ein Test prüft die Importe der Quelle (`apps/web/src/lib/team/entwurf/format.test.ts`).
- Text wird nur bis 512 KiB gelesen (`ENTWURF_GRENZEN`), alles andere als JSON wird abgewiesen; Schlüssel wie `__proto__` sind unbekannte Felder und verändern keine Prototypen.
- Höchstens 50 Fehler werden gemeldet; Pfade in Fehlern sind auf 120 Zeichen gekürzt.
- Zusammenarbeit und Abnahme sind nur Auswahlwerte; sie geben kein Recht und lösen nichts aus. Ein Entwurf des Assistenten kann „Leitung führt“ nicht selbst einschalten (`apps/web/src/lib/team/entwurf/format.test.ts`).
- Die Vorlage nennt kein Recht und jede Anweisung sagt, dass sie keine Rechte gibt (`apps/web/src/lib/team/entwurf/vorlagen.test.ts`).
- Die Vorlagen kommen **aus dem Image, nicht aus dem Netz**: `apps/web/src/lib/team/entwurf/vorlagen.ts` importiert nur `node:fs/promises`, `node:path`, das Format und `@paibot/shared`. Zwei Tests halten das fest – einer prüft die Import-Liste der Quelle, einer ruft alle Vorlagen mit einem werfenden `fetch` ab und erwartet, dass `fetch` nie angefasst wurde (`apps/web/src/lib/team/entwurf/vorlagen-laden.test.ts`).
- Eine Vorlagen-Kennung aus einer Anfrage kann nicht aus dem Ordner führen: Sie muss auf `TEAM_TEMPLATE_KEY_PATTERN` passen (`packages/shared/src/inputs.ts`), also kleine Buchstaben, Ziffern und Bindestrich – weder Punkt noch Schrägstrich. `../content-team`, `/etc/passwd` und `content-team.json` werden abgewiesen, ohne dass etwas gelesen wird.
- Der Lader der Vorlagen und die Logik der Routen dürfen nicht ins Browser-Bündel geraten; `apps/web/src/lib/routen-browser-buendel.test.ts` führt sie als verbotene Dateien und hat je eine Gegenprobe. Die Vorschau im Browser darf das Format mitbringen (es nutzt nur Web Crypto), aber nichts, was Dateien oder die Datenbank anfasst.
- Im Image liegen die Vorlagen schreibgeschützt (`apps/web/Dockerfile`: Ordner `0555`, Dateien `0444`, Pfad in `PAIBOT_TEAM_VORLAGEN`); die App liest sie und kann sie zur Laufzeit nicht ändern.
- Eine ungültige Vorlage **wirft** beim Laden (`TeamVorlagenFehler`), statt still zu fehlen: Sie ist ein Fehler im Image, keine Eingabe eines Menschen, und soll beim Bau auffallen.

### Wer schreibt Bots und Teams

Jede Stelle, die in `bots` oder `teams` schreibt, steht in dieser Tabelle und in `ERWARTET` in
`tools/lint-regeln/src/schreiber-bots-teams.test.ts`. Eine neue Stelle macht den Test rot; wer sie
ergänzt, entscheidet damit, dass auch sie durch das Tor geht und einen Beleg schreibt.

| Datei                                    | Weg                                                               |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `apps/web/src/lib/bot/bot.ts`            | ein Bot von Hand: anlegen, ändern, Modell, Pause, löschen         |
| `apps/web/src/lib/teams/verwaltung.ts`   | Teams von Hand: anlegen, umbenennen, Leitung, Mitglieder, löschen |
| `apps/web/src/lib/zugang/einrichtung.ts` | der erste Bot bei der Einrichtung                                 |
| `packages/db/src/repo/entwuerfe.ts`      | Team aus einer Vorlage: eine Transaktion, Rückgängig als Ganzes   |
| `packages/db/src/repo/bots.ts`           | die Zugriffsfunktionen selbst (hier liegen die Tabellen)          |
| `packages/db/src/repo/teams.ts`          | die Zugriffsfunktionen selbst (hier liegen die Tabellen)          |

## Tests

| Test                                                                                            | Prüft                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/team/entwurf/format.test.ts`                                                  | unbekannte Felder, Grenzen, Codepoints, Texte, Namen, Leitung, Zusammenarbeit und Abnahme, Modelle, Abdruck und Bindung an die Fassung, Fassung 1 lesen und überführen, Entwurf des Assistenten, Text-Eingabe, keine Rechte, Reinheit                                                                       |
| `apps/web/src/lib/team/entwurf/vorlagen.test.ts`                                                | jede Vorlage ist gültig; Inhalt der Vorlage „Content-Team“; Beispiel-Zeilen der Anweisungen gegen die feste Form; kein „freigeben“; keine Versprechen über Fähigkeiten, die PaiBot nicht hat                                                                                                                |
| `apps/web/src/lib/team/entwurf/vorlagen-laden.test.ts`                                          | Laden aus dem Image ohne Netz (werfendes `fetch`, Import-Liste der Quelle); ungültige Vorlage wirft und nennt die Stelle; falscher Dateiname, fehlender Ordner, zu viele Dateien; Kennungen, die aus dem Ordner führen wollen                                                                               |
| `apps/web/src/lib/team/entwurf/verwaltung.test.ts`                                              | die sieben Routen: Abdruck bindet (mit Gegenprobe), Not-Aus sperrt nur das Anlegen, Frist um → abgelehnt und `verfallen` (mit Gegenprobe), Name mit „Team “, vergebener Team- und Bot-Name, zweimal anlegen, Rückgängig als Ganzes, nach einer Nachricht abgelehnt; jede Ablehnung mit Beleg und ohne Zeile |
| `packages/db/src/repo/entwuerfe.test.ts`                                                        | die Transaktion: Fehler mitten drin → keine Zeile in `bots`, `teams`, `team_anlagen`; `nutzung` nach Nachricht, Änderung und Löschen; Wechsel der Stände                                                                                                                                                    |
| `apps/web/src/lib/team/entwurf/vorschau.test.ts`                                                | `inhaltMitAuswahl` und `geprueftMitAbdruck`: Reihenfolge des Entwurfs gewinnt gegen die der Auswahl, gleicher Abdruck                                                                                                                                                                                       |
| `apps/web/src/lib/team/entwurf/seite.test.ts`                                                   | das Lesen für die Seite: Frist um → `verworfen` und Zeile auf `verfallen` (Gegenprobe mit Frist in der Zukunft), Modelle nur einmal gelesen                                                                                                                                                                 |
| `apps/web/src/app/(app)/team-entwurf/seite.test.ts`                                             | die Seite: ohne Entwurf die Vorlagen, mit offenem Entwurf die Vorschau mit Feld, nach dem Anlegen „Rückgängig“ ohne Feld, Not-Aus sperrt den Knopf (mit Gegenprobe)                                                                                                                                         |
| `apps/web/src/gate-pflicht.test.ts`                                                             | jede der sieben Routen geht durchs Tor (401 ohne Sitzung, 403 ohne Prüfzeichen, Beleg je Aktion)                                                                                                                                                                                                            |
| `apps/web/src/gate-pflicht-quelltext.test.ts`, `packages/db/src/teams-nur-besitzer-weg.test.ts` | kein anderer Weg schreibt in `bots` oder `teams`: Beide führen Listen und melden jede Schreibstelle, die nicht darin steht – und jeden Eintrag ohne Schreibstelle                                                                                                                                           |
| `tools/lint-regeln/src/schreiber-bots-teams.test.ts`                                            | die Bestandsliste aller schreibenden Stellen über `apps`, `packages`, `tools`, `scripts` und `deploy`: eine Stelle, die nicht in `ERWARTET` steht, macht den Test rot (Gegenprobe belegt), ebenso ein Eintrag ohne Stelle                                                                                   |
| `tools/e2e/src/e2e.mjs`                                                                         | der ganze Weg im Browser: Vorlage öffnen, Wortlaut ändern, Bot abwählen, anlegen, rückgängig – am Schirm (1440) und am Handy (390), dort zusätzlich ohne seitliches Hinausragen                                                                                                                             |

Ausführen:

```bash
pnpm --filter @paibot/web exec vitest run src/lib/team "src/app/(app)/team-entwurf"
pnpm --filter @paibot/db exec vitest run src/repo/entwuerfe.test.ts
pnpm e2e
```

## Bekannte Schwächen

- Das Format prüft nicht, ob Namen schon vergeben sind – es kennt die Datenbank nicht. Das tut der Fakt `namesFree` der Route; zwischen seiner Erhebung und dem Einfügen liegt die Sperre der Transaktion, nicht mehr.
- Entwürfe entstehen nur aus einer Vorlage. Eine hochgeladene Datei und ein Zuruf an den Assistenten sind im Format vorgesehen (`herkunft`), aber nicht gebaut.
- In der Vorschau lassen sich nur Häkchen und Anweisungen ändern. Namen von Team und Bots stehen fest; Umbenennen geht erst nach dem Anlegen.
- Der Abdruck bindet den Inhalt, nicht die Sitzung: Wer denselben Inhalt und denselben Abdruck schickt, legt an. Dass die Anfrage vom Besitzer kommt, hält der Zugang mit Sitzung und Prüfzeichen fest, nicht der Abdruck.
- `team_anlagen` wird nur angehängt. Nach „Rückgängig“ zeigen ihre Zeilen auf Bots und ein Team, die es nicht mehr gibt – das ist Absicht (Belegspur), aber wer sie liest, muss damit rechnen.
- Das Image wurde für diese Änderung nicht gebaut; die Zeilen im `Dockerfile` folgen dem Muster des Doku-Index, das dort schon läuft.
- Zusammenarbeit „Leitung führt“ und Abnahme sind bisher nur gespeicherte Wahl: Nichts im Programm führt sie aus. Abnahme „leitung“ bei Zusammenarbeit „aus“ ist erlaubt und wirkt dann nicht.
- Ob Modelle den Entwurf als JSON zuverlässig liefern und ob sie die festen Zeilen der Vorlage einhalten, ist nicht geprüft.
- Das feste Muster im Test bildet die Zeilen-Form nach; es ist von der späteren Erkennung unabhängig und muss mit ihr abgeglichen werden, wenn sie sich ändert.
- Doppelte Schlüssel im JSON werden von `JSON.parse` nicht gemeldet; der letzte gilt.
- Ob ein Name einem bestehenden Bot sehr ähnlich sieht, wird nicht geprüft.
- Datei-Format YAML ist nicht vorgesehen; es gilt JSON.
