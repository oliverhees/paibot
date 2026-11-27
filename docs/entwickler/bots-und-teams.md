<!--
PaiBot – Entwickler-Doku: Datenbank für Bots, Teams, Entwürfe und Fäden (Migration 0017).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-22
-->

# Bots und Teams – für Entwickler

**Anwender-Doku:** folgt mit der Oberfläche (es gibt noch keine Seite, keine Route und keinen Knopf zum Anlegen oder Ändern von Teams). Was der Anwender schon merkt, steht bei den Grenzen in [Tor und Belege](../funktion-tor.md#bots-pausieren-und-teams-fassung-4) und bei [Bot](../funktion-bot.md).

> Stand: Die Datenbank kennt Bots mit Pause, Aufgabe und Team, Teams, Entwürfe für Teams, die Anlagen eines Entwurfs und die Köpfe von Fäden. Das Tor entscheidet mit Fassung 4 (siehe [Tor und Belege](tor.md)). Es gibt **keine** Funktion, die Teams anlegt: Die Aktionen gibt es im Tor und in der Datenbank, die Bedienung kommt später.

## Zweck und Entscheidung

Bots sollen in Teams arbeiten können, ohne dass ein Team wie mehrere Chats aussieht. Dafür ist ein **Faden** eine Unterhaltung der Art `faden`, die einem Team gehört und keinen eigenen Bot hat (`packages/db/src/schema/unterhaltungen.ts#conversations`). Entscheidungen, wie sie im Code stehen:

- **Eine Unterhaltung hat einen Bot oder ein Team, nie beides und nie keins.** Die CHECK-Regel `conversations_bot_oder_team` verlangt: Art `direkt` oder `entwurf` hat einen Bot und kein Team, Art `faden` hat ein Team und keinen Bot. Ein Direkt-Chat ohne Bot scheitert in der Datenbank (`packages/db/src/teams-update-postgres.test.ts`).
- **Ein Faden nimmt in dieser Fassung keine Nachricht an und startet keinen Lauf.** Senden und „Neu erzeugen“ geben einen festen Hinweis (Code `abgelehnt`, Satz „In einem Faden antwortet noch kein Bot.“, `apps/web/src/lib/chat/aktionen.ts#FADEN_OHNE_LAUF_TEXT`), bevor etwas geändert wird. Ein Lauf, der trotzdem für einen Faden angelegt würde, endet mit `nicht_gefunden`, ohne das Modell zu fragen (`packages/agents/src/run/kontext.ts#loadRunContext`).
- **Die Pause eines Bots wird je Anfrage frisch gelesen**, nie vom Lauf-Start (`packages/agents/src/run/bot-stand.ts#readBotPaused`). Wer die Pause mitten im Lauf setzt, lehnt damit schon den nächsten Schritt und den nächsten Werkzeug-Aufruf ab.
- **Bots, Teams, Entwürfe und Fäden ändert nur der Besitzer-Weg der Web-App.** Die Datenbank trennt das nicht (siehe Sicherheit); ein Quelltext-Test prüft es.

## Aufbau

| Datei                                             | Aufgabe                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/teams.ts`                 | Tabellen `teams`, `team_entwuerfe`, `team_anlagen`, `faeden`, `faden_punkte`                              |
| `packages/db/src/schema/anbieter.ts`              | `bots` mit den neuen Spalten `role`, `paused`, `team_id`, `aus_entwurf_id`                                |
| `packages/db/src/schema/unterhaltungen.ts`        | `conversations` mit `kind`, `team_id`, nullbarem `bot_id` und der CHECK-Regel; `runs.bot_id` ohne Kaskade |
| `packages/db/src/schema/settings.ts`              | `stabschef_erlaubt` (Standard `false`), `default_bot_id` ohne `set null`                                  |
| `packages/db/drizzle/0017_teams_a.sql`            | die Migration für alle Tabellen, Spalten, Löschregeln und die Trigger von `team_anlagen`                  |
| `packages/db/drizzle/0018_fassung_4_aktionen.sql` | die dreizehn Aktionen der Tor-Fassung 4 in den Werten der Regeln und Belege                               |
| `packages/db/src/repo/bots.ts`                    | `setPaused`, `remove` (Bot mit Läufen und Standard-Bot werden mit festem Satz abgelehnt)                  |
| `packages/db/src/rollen.ts`                       | Rechte der neuen Tabellen (`APP_TABLE_RIGHTS`)                                                            |
| `packages/agents/src/run/bot-stand.ts`            | `readBotPaused`: der Pausen-Stand, frisch gelesen; fehlt die Zeile: `undefined`                           |
| `packages/shared/src/id.ts`                       | Kennungen `tea_…` (Team) und `ent_…` (Entwurf) in `ID_PREFIX`                                             |

## Datenmodell und Migrationen

Zwei Migrationen, getrennt, weil die zweite mit dem Tor zusammen in Kraft tritt (Begründung in [Tor und Belege](tor.md#fassung-4-ist-angeschlossen)):

| Tabelle oder Spalte                                                                  | Wofür                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `teams`                                                                              | Name (eindeutig, 1 bis 60 Zeichen), `lead_bot_id` (Leitung, leer möglich), `zusammenarbeit` (`aus` oder `leitung_fuehrt`, Standard `aus`), `abnahme_standard`                                                                                                                                 |
| `team_entwuerfe`                                                                     | Entwurf mit Stand, Herkunft (`vorlage` oder `datei`), geprüftem Inhalt und dessen Abdruck; Inhalt und Abdruck ändert die App nie                                                                                                                                                              |
| `team_anlagen`                                                                       | was ein Entwurf angelegt hat (Bot oder Team); nur anhängen, Trigger lehnen Ändern und Löschen ab                                                                                                                                                                                              |
| `faeden`                                                                             | Kopf eines Fadens: Ziel, Abnahme, Herkunft (`besitzer`), Entscheidung `faden.anlegen`                                                                                                                                                                                                         |
| `faden_punkte`                                                                       | die Punkte „fertig, wenn“ eines Fadens: eine Zeile je Punkt, Stelle 0 bis 11 (also höchstens zwölf), Text 1 bis 200 Zeichen; nur anlegen. Eine Zeile je Punkt statt einer Liste in einer Spalte, weil die Sicherung in Prüfregeln keine eigenen Funktionen zulässt (`deploy/sicherung-db.sh`) |
| `bots.role`, `bots.paused`, `bots.team_id`, `bots.aus_entwurf_id`                    | Aufgabe im Team (höchstens 200 Zeichen), Pause, Team, Entwurf, aus dem der Bot kam                                                                                                                                                                                                            |
| `conversations.kind`, `conversations.team_id`, `conversations.bot_id` (leer möglich) | Art der Unterhaltung, Team eines Fadens                                                                                                                                                                                                                                                       |
| `settings.stabschef_erlaubt`                                                         | ob Pai Teams Aufträge geben darf (ausgeschaltet; es gibt noch keine Funktion dafür)                                                                                                                                                                                                           |

**Abgleich-Klassen der neuen Tabellen** (`packages/db/src/schema/abgleich-klassen.ts#ABGLEICH_KLASSEN`, geprüft in `packages/db/src/abgleich-klassen.test.ts`): Die Klasse sagt, wie eine Tabelle später zwischen zwei Orten einer Installation abgeglichen würde. Keine der fünf Tabellen enthält ein Geheimnis.

| Tabelle          | Klasse            | Warum                                                                   |
| ---------------- | ----------------- | ----------------------------------------------------------------------- |
| `teams`          | B (letzter Stand) | Name, Leitung und Zusammenarbeit werden geändert                        |
| `team_entwuerfe` | B (letzter Stand) | der Stand des Entwurfs wird fortgeschrieben (angelegt, rückgängig)      |
| `team_anlagen`   | A (nur anhängen)  | Trigger weisen Ändern und Löschen ab                                    |
| `faeden`         | A (nur anhängen)  | der Kopf wird einmal mit der Unterhaltung angelegt und geht nur mit ihr |
| `faden_punkte`   | A (nur anhängen)  | die Punkte werden nur angelegt und ändern sich nicht                    |

**Was beim Entfernen passiert** (`packages/db/src/teams-update-postgres.test.ts`, `packages/db/src/repo/bots-loeschen.test.ts`):

| Was wird entfernt               | Folge                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ein Bot mit Läufen              | nicht möglich (`runs.bot_id` ohne Kaskade); `bots.remove` meldet „Dieser Bot hat schon gearbeitet und lässt sich nicht löschen.“                          |
| der Standard-Bot                | nicht möglich (`settings.default_bot_id` ohne `set null`); `bots.remove` meldet „Das ist dein Standard-Bot und lässt sich nicht löschen.“                 |
| ein Bot ohne Läufe              | geht, mit seinen Direkt-Chats (Kaskade wie bisher); war er Leitung, hat das Team keine Leitung mehr; war er in einem Team, verschwindet nur die Zuordnung |
| ein Team mit Fäden              | nicht möglich (`conversations.team_id` ohne Kaskade); erst die Fäden, dann das Team                                                                       |
| ein Team ohne Fäden             | geht; die Bots bleiben, ohne Team                                                                                                                         |
| eine Unterhaltung der Art Faden | geht; ihr Kopf in `faeden` geht mit                                                                                                                       |

**Kein Weg zurück:** Beide Migrationen sind Einbahnstraßen. Nach dem Update kennt der alte Stand Unterhaltungen ohne Bot und die neuen Aktionen in den Belegen nicht. Vor dem Update eine Sicherung anlegen ([Aktualisieren](../aktualisieren.md)). Der Update-Test geht von einer bestehenden Installation aus: Stand 0016 mit Bots, Unterhaltungen, Nachrichten und Läufen, dann beide Migrationen (`packages/db/src/teams-update-postgres.test.ts`, nur mit `PAIBOT_TEST_DATABASE_URL`).

## Schnittstellen

- **Aktionen im Tor:** dreizehn Aktionen des Besitzers (`packages/shared/src/tor-fassung-4.ts#TEAM_ACTION_SHAPES`); keine ist über eine Route erreichbar (`apps/web/src/lib/routen.test.ts` hält das fest).
- **Objekte:** `Bot` trägt `role`, `paused` und `teamId`; `Conversation` trägt `kind` und `teamId`, `botId` fehlt bei einem Faden (`packages/shared/src/objects.ts#conversationSchema`).
- **Pause setzen:** `repo.bots.setPaused` (`packages/db/src/repo/bots.ts#setPaused`); noch ohne Aufrufer außerhalb der Tests.

## Sicherheit

- **Rechte der neuen Tabellen** (`packages/db/src/rollen.ts#APP_TABLE_RIGHTS`): `teams` lesen, anlegen, nur Name, Leitung, Zusammenarbeit, Abnahme-Standard und Zeit ändern, löschen; `team_entwuerfe` lesen, anlegen, nur Stand und die beiden Aktionen ändern; `team_anlagen`, `faeden` und `faden_punkte` nur lesen und anlegen. Auf `team_anlagen` kommen Trigger dazu (auch der Besitzer der Tabelle kann nicht ändern oder löschen).
- **Art und Team einer Unterhaltung stehen nach dem Anlegen fest** (Trigger `conversations_festhalten`, Funktion `paibot_unterhaltung_festhalten`): Ein Faden wird nie zum Direkt-Chat und wechselt nie das Team; beim Faden ist `bot_id` durch die Prüfregel `conversations_bot_oder_team` und die feste Art immer leer. Eine Zeile in `faeden` gibt es nur für eine Unterhaltung der Art `faden` (Trigger `faeden_nur_fuer_faden`). Beide Funktionen stehen in der Erlaubnisliste von `deploy/sicherung-db.sh`. Test: `packages/db/src/unterhaltung-festhalten.test.ts`.
- **Web-App und Worker teilen eine Datenbank-Rolle.** Die Datenbank kann deshalb nicht trennen, wer in `bots`, `teams`, `team_entwuerfe` und `faeden` schreibt. Das fängt ein Quelltext-Test ab: `apps/worker` und `packages/agents` rufen keine Schreibfunktion für diese Tabellen und kein Tabellen-Objekt von ihnen auf (`packages/db/src/teams-nur-besitzer-weg.test.ts`). **DB-seitig ist das nicht getrennt**; eine zweite Rolle ist eine eigene Aufgabe.
- **Fehlende Zeile heißt pausiert:** Fehlt die Zeile des Bots, lehnen die Aufrufer ab (`botPaused: true`), nie „nicht pausiert“ aus Mangel an Daten.
- **Zettel und Texte** eines Fadens stehen in dieser Fassung nicht in der Datenbank (nur das Ziel und die Punkte „fertig, wenn“, als Daten, die der Besitzer selbst anlegt).

## Vorschau, noch nicht angeschlossen

Für die Oberfläche der Verwaltung gibt es eine Vorschau-Seite mit erfundenen Beispiel-Daten. Sie ist **nicht** an die Datenbank, das Tor oder einen Server angeschlossen: Pausieren, Löschen, Team wechseln, Anlegen und Stoppen ändern nur den Speicher der Seite (`packages/ui/src/teams/Ansicht.tsx`). Die Seite gibt es nur mit dem Entwicklungs-Server (`/_komponenten/teams`, in Produktion 404, `apps/web/src/app/%5Fkomponenten/teams/page.tsx`).

| Szene (`?szene=…`) | Was sie zeigt                                                                                                     | Baustein                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `seitenleiste`     | Bots nach Teams gruppiert, Menü je Bot (pausieren, Team wechseln, löschen mit Rückfrage), Not-Aus                 | `Seitenleiste.tsx`, `BotMenue.tsx` |
| `bot`              | Steckbrief: Rolle, Team, Modell, „Darf / Fragt vorher / Darf nie“, Hinweis bei Pause (`&bot=zahlen` ist pausiert) | `Steckbrief.tsx`                   |
| `team`             | Name, Leitung, Zusammenarbeit (Aus / Leitung führt), Abnahme-Standard, Mitglieder, Hinweis ohne Tagesbudget       | `Verwaltung.tsx`                   |
| `entwurf`          | Teile mit Häkchen, voller Wortlaut der Anweisungen, Kosten-Hinweis, Anlegen und Rückgängig, Verfall nach 7 Tagen  | `Entwurf.tsx`                      |
| `uebersicht`       | Fäden aller Teams nach „Läuft“, „Wartet auf dich“, „Fertig“; nur „Faden öffnen“ und „Stoppen“                     | `Uebersicht.tsx`                   |

Weitere Parameter: `thema=hell` und `bot=<name in Kleinbuchstaben>`.

- **Daten:** Das Team „Content“ und der Wortlaut seiner Anweisungen kommen aus `vorlagen/teams/content-team.json`; die Seite liest die Datei beim Laden (`apps/web/src/app/%5Fkomponenten/teams/vorlage.ts`), der Wortlaut steht kein zweites Mal im Code. Das Team „Recherche“ und Pai sind erfunden (`packages/ui/src/teams/beispiel.ts`).
- **Typen:** Die Bausteine haben eigene Anzeige-Typen (`packages/ui/src/teams/typen.ts`); es gibt keine Vertragsdatei und keinen Import vom Server. Ein Test prüft, dass im Quelltext der Bausteine kein `fetch`, kein `WebSocket` und kein Import von `next`, `db`, `jobs`, `agents` oder `gate` steht.
- **Entwurf:** Das Team der Vorlage gibt es in der Seitenleiste erst nach „Team anlegen“; „Rückgängig“ nimmt es wieder weg. Die Leitung lässt sich nicht abwählen. Was die Fassung noch nicht kann (Automationen, Merkzettel, App-Zugriffe, Regel-Vorschläge), steht grau mit „kommt mit …“. Mit Not-Aus ist „Team anlegen“ gesperrt; Ändern und Verwerfen gehen weiter.
- **Wortwahl:** „Leitung“, nie „Ansprechpartner“; „abgenommen“, nie „freigegeben“. Die Texte stehen unter `teams.*` in `packages/shared/src/i18n/de.ts`.
- **Handy:** Unter 960 Pixel Breite ist die Seitenleiste ein Blatt von unten mit Griffzeile; die Rückfrage vor dem Löschen liegt über der ganzen Seite. Es gibt nirgends einen sichtbaren Scrollbalken.
- **Tests:** `packages/ui/src/teams/teams.test.ts` (Bausteine mit eigener Beispiel-Vorlage: Szenen, Pflichten, Wortwahl) und `apps/web/src/app/%5Fkomponenten/teams.test.ts` (Seite rendert auch wenn `fetch` wirft, Quelltext ohne Abruf, Wortlaut der echten Vorlage). Im Browser prüft `scripts/teams-browser.mjs` (`pnpm teams:browser`, Entwicklungs-Server unter `localhost`, Adresse in `TEAMS_URL`): Menü mit der Tastatur, Rückfrage beim Löschen, Not-Aus im Entwurf, Blatt am Handy, kein Scrollbalken, hell/dunkel.
- **Bilder:** Die Aufnahmen `teams-*` stehen in `docs/screenshots.json` (Art „entwicklung“) und entstehen mit `pnpm doku:screenshots teams-seitenleiste …`; je Szene dunkel und hell, 1440 und 390 Pixel breit.

Verwaltung und „Team aus Vorlage“ werden erst gebaut, wenn diese Vorschau freigegeben ist.

## Tests

| Datei                                                                                                                          | Prüft                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/teams-update-postgres.test.ts`                                                                                | Update von 0016 mit Bestandsdaten, CHECK-Regel, Löschregeln, Rechte der App-Rolle, die dreizehn Aktionen (echtes Postgres) |
| `packages/db/src/repo/bots-loeschen.test.ts`                                                                                   | Löschen von Bots: Läufe, Standard-Bot, Team, Leitung, Team mit Faden                                                       |
| `packages/db/src/teams-nur-besitzer-weg.test.ts`                                                                               | Worker und Lauf-Steuerung schreiben nicht in die Tabellen für Teams                                                        |
| `packages/agents/src/run/bot-stand.test.ts`                                                                                    | `readBotPaused` liest frisch und gibt bei fehlender Zeile `undefined`                                                      |
| `packages/agents/src/run/bot-pausiert.test.ts`                                                                                 | Füllwert im Direkt-Chat, Pause vor dem Lauf, Pause mitten im Lauf                                                          |
| `apps/web/src/lib/chat/aktionen.test.ts`, `apps/web/src/lib/chat/neu-erzeugen.test.ts`, `apps/web/src/lib/chat/export.test.ts` | Faden: fester Hinweis, keine Nachricht, kein Lauf; Export ohne Bot; pausierter Bot beim Senden                             |
| `apps/web/src/bot-pause-aufrufer.test.ts`                                                                                      | alle Aufrufer des Tors füllen `botPaused`                                                                                  |

## Bekannte Schwächen

- **Keine Bedienung:** Teams, Entwürfe und Fäden lassen sich nur über das Tor und die Datenbank anlegen, nicht über eine Seite. `leadInTeam` und die Zählfakten der Entwürfe füllt noch niemand (es gibt keinen Aufrufer), siehe „Für kommende Pakete“ in [Tor und Belege](tor.md#für-kommende-pakete).
- **Eine Rolle für Web-App und Worker:** siehe Sicherheit.
- **`bots.remove` ist nirgends im Betrieb aufgerufen:** Es gibt noch keine Funktion zum Löschen eines Bots; die Regeln gelten für die Zugriffsfunktion und die Datenbank.
- **Die Seite „Regeln“ zeigt die neuen Nummern nicht** (`apps/web/src/lib/belege/regeln.ts#NOCH_NICHT_BEDIENBAR`), weil man sie noch nicht benutzen kann.
- **Die Herkunft `datei`** eines Entwurfs ist in der Datenbank erlaubt, im Tor aber noch nicht (Fassung 4 kennt nur `vorlage`).
