<!--
PaiBot – Entwickler-Doku: Datenbank für Bots, Teams, Entwürfe und Fäden (Migration 0017).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-22
-->

# Bots und Teams – für Entwickler

**Anwender-Doku:** [Bots und Teams](../funktion-bots-und-teams.md); dazu [Bot](../funktion-bot.md) für den Haupt-Assistenten und [Tor und Belege](../funktion-tor.md#bots-pausieren-und-teams-fassung-4) für die Grenzen.

> Stand: Bots anlegen, pausieren, löschen und einem Team zuordnen geht über die Oberfläche; Teams anlegen, ändern und löschen auch. Jede dieser Änderungen ist eine Besitzer-Aktion der Tor-Fassung 4 und bekommt zwei Belege. **Noch nicht gebaut:** Fäden (in einem Team antwortet kein Bot), Übergaben zwischen Bots, Teams aus einer Vorlage.

## Zweck und Entscheidung

Bots sollen in Teams arbeiten können, ohne dass ein Team wie mehrere Chats aussieht. Dafür ist ein **Faden** eine Unterhaltung der Art `faden`, die einem Team gehört und keinen eigenen Bot hat (`packages/db/src/schema/unterhaltungen.ts#conversations`). Entscheidungen, wie sie im Code stehen:

- **Eine Unterhaltung hat einen Bot oder ein Team, nie beides und nie keins.** Die CHECK-Regel `conversations_bot_oder_team` verlangt: Art `direkt` oder `entwurf` hat einen Bot und kein Team, Art `faden` hat ein Team und keinen Bot. Ein Direkt-Chat ohne Bot scheitert in der Datenbank (`packages/db/src/teams-update-postgres.test.ts`).
- **Ein Faden nimmt in dieser Fassung keine Nachricht an und startet keinen Lauf.** Senden und „Neu erzeugen“ geben einen festen Hinweis (Code `abgelehnt`, Satz „In einem Faden antwortet noch kein Bot.“, `apps/web/src/lib/chat/aktionen.ts#FADEN_OHNE_LAUF_TEXT`), bevor etwas geändert wird. Ein Lauf, der trotzdem für einen Faden angelegt würde, endet mit `nicht_gefunden`, ohne das Modell zu fragen (`packages/agents/src/run/kontext.ts#loadRunContext`).
- **Die Pause eines Bots wird je Anfrage frisch gelesen**, nie vom Lauf-Start (`packages/agents/src/run/bot-stand.ts#readBotPaused`). Wer die Pause mitten im Lauf setzt, lehnt damit schon den nächsten Schritt und den nächsten Werkzeug-Aufruf ab.
- **Bots, Teams, Entwürfe und Fäden ändert nur der Besitzer-Weg der Web-App.** Die Datenbank trennt das nicht (siehe Sicherheit); ein Quelltext-Test prüft es.

Verworfen wurden ein Faden als weiterer Direkt-Chat (Fäden gehören stattdessen einem Team und haben keinen eigenen Bot) und eine Bedienung über beliebige App- oder Worker-Wege (Änderungen bleiben dem Besitzer-Weg der Web-App vorbehalten). Die verworfenen Alternativen sind damit nicht nur eine UI-Entscheidung, sondern durch Schema, Tor und Quelltext-Test abgesichert.

## Aufbau

| Datei                                             | Aufgabe                                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/teams.ts`                 | Tabellen `teams`, `team_entwuerfe`, `team_anlagen`, `faeden`, `faden_punkte`                                      |
| `packages/db/src/schema/anbieter.ts`              | `bots` mit den neuen Spalten `role`, `paused`, `team_id`, `aus_entwurf_id`                                        |
| `packages/db/src/schema/unterhaltungen.ts`        | `conversations` mit `kind`, `team_id`, nullbarem `bot_id` und der CHECK-Regel; `runs.bot_id` ohne Kaskade         |
| `packages/db/src/schema/settings.ts`              | `stabschef_erlaubt` (Standard `false`), `default_bot_id` ohne `set null`                                          |
| `packages/db/drizzle/0017_teams_a.sql`            | die Migration für alle Tabellen, Spalten, Löschregeln und die Trigger von `team_anlagen`                          |
| `packages/db/drizzle/0018_fassung_4_aktionen.sql` | die dreizehn Aktionen der Tor-Fassung 4 in den Werten der Regeln und Belege                                       |
| `packages/db/src/repo/bots.ts`                    | `setPaused`, `remove` (Bot mit Läufen und Standard-Bot werden mit festem Satz abgelehnt)                          |
| `packages/db/src/rollen.ts`                       | Rechte der neuen Tabellen (`APP_TABLE_RIGHTS`)                                                                    |
| `packages/agents/src/run/bot-stand.ts`            | `readBotPaused`: der Pausen-Stand, frisch gelesen; fehlt die Zeile: `undefined`                                   |
| `packages/shared/src/id.ts`                       | Kennungen `tea_…` (Team) und `ent_…` (Entwurf) in `ID_PREFIX`                                                     |
| `packages/db/src/repo/teams.ts`                   | Zugriff auf Teams: `create`, `get`, `list`, `update`, `remove`, `mitglieder`, `istMitglied`, `entwurfStandSetzen` |
| `apps/web/src/lib/teams/verwaltung.ts`            | die neun Routen; jede Änderung über `k.tor(...)`, alle Fakten vom Server                                          |
| `apps/web/src/lib/teams/seite.ts`                 | `botSeite`, `teamsSeite`, `teamSeite`: was die drei Seiten vom Server brauchen                                    |
| `apps/web/src/lib/teams/ansicht.ts`               | `ordne`: Server-Objekte → Anzeige-Typen der Bausteine (`packages/ui/src/teams/typen.ts`)                          |
| `apps/web/src/lib/teams/laden.ts`                 | `ladeBotsUndTeams`: Einstellungen, Bots und Teams in einem Zug, für die Seitenleiste                              |
| `apps/web/src/lib/teams/pfade.ts`                 | die Pfade der Routen für den Browser, ohne den Routen-Vertrag ins Bündel zu ziehen                                |

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

- **Aktionen im Tor:** dreizehn Aktionen des Besitzers (`packages/shared/src/tor-fassung-4.ts#TEAM_ACTION_SHAPES`). Sieben davon haben jetzt eine Route (Tabelle unten); die übrigen sechs (Entwürfe, Fäden, Stabschef) haben keine, und `apps/web/src/lib/routen.test.ts#OHNE_BEDIENUNG` hält genau diese Liste fest.
- **Objekte:** `Bot` trägt `role`, `paused` und `teamId`; `Conversation` trägt `kind` und `teamId`, `botId` fehlt bei einem Faden (`packages/shared/src/objects.ts#conversationSchema`).
- **Eingaben:** `botCreateInput`, `botPauseInput`, `botTeamInput`, `teamCreateInput`, `teamPatchInput` (`packages/shared/src/inputs.ts`), alle `strictObject`; `teamPatchInput` verlangt über `.refine` mindestens ein Feld. `conversationCreateInput` hat ein optionales `botId`.
- **Grenzen:** `LIMITS.bots = 50`, `LIMITS.teamNameChars = 60`, `LIMITS.botRoleChars = 200` (`packages/shared/src/constants.ts`).

### Die Routen

Alle neun stehen in `apps/web/src/lib/routen.ts` mit `zugang: "besitzer"`; die Ausführung in `apps/web/src/lib/teams/verwaltung.ts`.

| Methode und Pfad          | Aktion der Fassung 4 | Fakten, die der Server liest                                                          |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/bots`           | – (lesend)           | –                                                                                     |
| `POST /api/bots`          | `bot.anlegen`        | `botsAfter` (`repo.bots.count` + 1), `maxBots` (`LIMITS.bots`)                        |
| `PUT /api/bots/:id/pause` | `bot.pausieren`      | `paused`, `wasPaused`                                                                 |
| `DELETE /api/bots/:id`    | `bot.loeschen`       | `isDefaultBot` (aus `repo.settings.get`), `botRunActive` (`repo.runs.hatAktivenLauf`) |
| `PUT /api/bots/:id/team`  | `bot.team_setzen`    | `teamExists` (`repo.teams.get`)                                                       |
| `GET /api/teams`          | – (lesend)           | –                                                                                     |
| `POST /api/teams`         | `team.anlegen`       | –                                                                                     |
| `PUT /api/teams/:id`      | `team.aendern`       | `fields` (aus `TEAM_FIELDS`), `leadInTeam` (`repo.teams.istMitglied`)                 |
| `DELETE /api/teams/:id`   | `team.loeschen`      | –                                                                                     |

`POST /api/bots` hat `koerperBytes: 64 * 1024` wie `botAendern`, weil die Anweisung dieselbe Länge haben darf (`LIMITS.botInstructionsChars = 8000` passt nicht sicher in die Standard-Grenze von 16 KB). Dafür steht `/api/bots` auch im Matcher von `apps/web/src/proxy.ts` und in der Liste von `apps/web/src/lib/api/koerper.test.ts`.

**`leadInTeam` ist jetzt gefüllt:** `teamAendern` liest ihn über `repo.teams.istMitglied` (`packages/db/src/repo/teams.ts#istMitglied`). Setzt man ihn fest auf `true`, wird der Fall „eine Leitung, die nicht zum Team gehört, lehnt das Tor ab“ in `apps/web/src/lib/teams/verwaltung.test.ts` rot.

### Jede Stelle mit `repo.bots.getDefault`, einzeln entschieden

Es gibt genau sechs Stellen im Betrieb (`git grep -n "bots.getDefault" apps/web/src` ohne Tests). Keine ist versehentlich stehen geblieben; an jeder steht die Begründung auch im Code. Eine siebte Stelle war keine Entscheidung, sondern ein Fehler: Die Seite einer bestehenden Unterhaltung (`apps/web/src/app/(app)/chat/[id]/page.tsx`) rief `ladeBereitschaft` ohne `botId` auf und berichtete damit immer über den Standard-Bot – ein pausierter zweiter Bot bekam keinen Hinweis, und über der Eingabe stand das falsche Modell. Gefunden hat es `pnpm e2e`, nicht ein Test; die Behebung steht unten unter „Pause und Oberfläche“.

| Stelle                                            | Entscheidung                    | Warum                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(app)/layout.tsx`               | bleibt Standard-Bot             | Die Zeile „Modelle: …“ in der Seitenleiste nennt die Herkunft des Modells, mit dem der Haupt-Assistent antwortet. Die Bots selbst kommen aus `ladeBotsUndTeams`.    |
| `apps/web/src/lib/modelle/seite.ts`               | bleibt Standard-Bot             | Modell und Anbieter gelten für die ganze Installation; die Seite zeigt sie am Modell des Haupt-Assistenten.                                                         |
| `apps/web/src/lib/bot/bot.ts#standardBot`         | bleibt Standard-Bot             | `GET`/`PUT /api/bot` gehören zum Haupt-Assistenten; die weiteren Bots gehen über `/api/bots/:id`.                                                                   |
| `apps/web/src/lib/bot/bot.ts#botSeitenDaten`      | bleibt Standard-Bot             | Die Seite `/bot` ist der Haupt-Assistent; der Steckbrief eines weiteren Bots kommt aus `apps/web/src/lib/teams/seite.ts#botSeite`.                                  |
| `apps/web/src/lib/chat/laden.ts#ladeBereitschaft` | **Vorgabe**, nicht einzige Wahl | Mit `botId` gilt der gewählte Bot, ohne Angabe der Standard-Bot. Eine **bestehende** Unterhaltung geht nie darüber, sondern über `ladeBereitschaftZurUnterhaltung`. |
| `apps/web/src/lib/teams/verwaltung.ts#botAnlegen` | **Vorgabe**, nicht einzige Wahl | Ohne eigenes Modell übernimmt der neue Bot das Modell des Standard-Bots.                                                                                            |

Weg ist `getDefault` dort, wo früher nur der Standard-Bot geprüft wurde, obwohl jeder Bot gemeint ist:

| Stelle                                                      | Was jetzt gilt                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/modelle/anbieter.ts#schreibtMitAnbieter`  | prüft **jeden** Bot und seinen eigenen Lauf (`repo.runs.hatAktivenLauf`); genannt wird der erste, der schreibt |
| `apps/web/src/lib/modelle/regeln.ts#anbieterRegelEntfernen` | prüft jeden Bot, der die Regel als Modell benutzt, und seinen eigenen Lauf                                     |
| `apps/web/src/lib/chat/laden.ts#ladeUnterhaltungen`         | lädt die Unterhaltungen **aller** Bots mit ihrem `botId` (Fäden eines Teams bleiben draußen)                   |
| `apps/web/src/lib/teams/seite.ts#botSeite`                  | nimmt die Kennung aus der Adresse; der Standard-Bot kommt nur noch als `haupt` vor                             |
| `apps/web/src/app/(app)/chat/[id]/page.tsx`                 | nimmt den Bot der Unterhaltung (`ladeBereitschaftZurUnterhaltung`), nicht den Standard-Bot                     |

Beide Änderungen unter `apps/web/src/lib/modelle/` haben eine eigene Gegenprobe: `eigener-anbieter.test.ts` („schreibt ein zweiter Bot mit einem Modell des Anbieters, bleibt er auch dann“) und `regeln.test.ts` („schreibt ein zweiter Bot mit dieser Regel, bleibt sie – bis sein Lauf fertig ist“) werden rot, sobald wieder nur der Standard-Bot geprüft wird.

### Pause und Oberfläche

- **Pause setzen:** `repo.bots.setPaused`, aufgerufen von `botPausieren` (`apps/web/src/lib/teams/verwaltung.ts`), bedient auf dem Steckbrief (`apps/web/src/app/(app)/bot/[id]/BotSteckbrief.tsx`).
- **Pause anzeigen:** `ladeBereitschaft` liefert `pausiert`; `apps/web/src/app/(app)/chat/ChatSeite.tsx` setzt daraus den Absatz `data-baustein="bot-pausiert"` mit `role="status"` und sperrt die Eingabe. Das Tor lehnt die Antwort über `botPaused` ohnehin ab; die Oberfläche sagt es vorher.
- **Welcher Bot gemeint ist:** Eine neue Unterhaltung geht über `apps/web/src/app/(app)/page.tsx` (`?bot=`), eine bestehende über `apps/web/src/app/(app)/chat/[id]/page.tsx`. Die zweite nimmt `ladeBereitschaftZurUnterhaltung(db, …, verlauf.unterhaltung)` (`apps/web/src/lib/chat/laden.ts`), also `verlauf.unterhaltung.botId`; ohne Bot-Kennung – nur beim Faden eines Teams – bleibt der Standard-Bot die Vorgabe. Tests: `apps/web/src/lib/chat/bereitschaft.test.ts` (Gegenprobe: die Kennung nicht weitergeben → der erste Fall wird rot).
- **Hinweis ohne Tagesbudget:** `teamsSeite`/`teamSeite` liefern `ohneTagesbudget` (leeres `settings.dailyTokenBudget`); `packages/ui/src/teams/Verwaltung.tsx` setzt daraus den Absatz `data-baustein="zusammenarbeit-hinweis"` im `fieldset` „Zusammenarbeit“. Er sperrt nichts.

### Der Weg in die Seiten, und welcher Bot antwortet

- **Menü:** „Bots und Teams“ ist der erste Eintrag der Arbeits-Seiten (`apps/web/src/lib/navigation.ts#NAVIGATION`, Symbol `person`, Text `teams.seite.titel`). Vorher stand `/teams` nur in `WEITERE_SEITEN` – das ist allein für den Kopfzeilen-Titel, die Seite war also nur über die getippte Adresse erreichbar.
- **Neue Unterhaltung mit einem gewählten Bot:** Die Seitenleiste verlinkt `neueUnterhaltungAdresse(botId)` → `/?bot=<Kennung>`. `apps/web/src/app/(app)/page.tsx#gewaehlterBot` liest den Wert, nimmt ihn nur an, wenn er mit `ID_PREFIX.bot` beginnt, und gibt ihn an `ladeBereitschaft`. `apps/web/src/app/(app)/chat/ChatSeite.tsx` schickt `bereitschaft.botId` beim Anlegen mit. Ohne `?bot=` bleibt der Standard-Bot die Vorgabe. Tests: `apps/web/src/app/(app)/startseite.test.ts`.
- **Die Körper der Anfragen** stehen in `apps/web/src/lib/teams/koerper.ts`, nicht verstreut in den Seiten. Der Grund ist ein Fehler, der genau dort entstand: Die Seiten schickten Felder, die der Vertrag nicht kennt (`leadBotId` statt `lead`, `teamId: null`, ein Bot ohne Farbe und Form), und die Routen antworteten mit 400 – während Render-Tests und Routen-Tests grün blieben, weil keiner von beiden den Körper des Browsers prüft. `koerper.test.ts` stellt jetzt jeden Körper gegen sein `strictObject` aus `packages/shared/src/inputs.ts`.
- **Aussehen eines neuen Bots:** Das Formular hat kein Feld dafür. `naechstesAussehen(schon)` nimmt die Farben aus `BOT_COLORS` der Reihe nach und leitet die Form über `formFuer` ab (feste Paare, `packages/ui/src/avatar/formen.ts#FORM_ZU_FARBE`).

### Die Seite „Regeln“ zeigt die Nummern, die man treffen kann

`apps/web/src/lib/belege/regeln.ts#NOCH_NICHT_BEDIENBAR` verbirgt nur noch die Nummern der Entwürfe (`G-32`, `G-34`, `V-27` bis `V-31`, `V-43`). Sichtbar sind seit diesem Paket `G-15` (Pause), `G-33` (Bots insgesamt), `V-25` (Team vorhanden), `V-37` (Standard-Bot bleibt), `V-42` (kein Lauf des Bots), `V-44` (Leitung gehört zum Team); ihre Erklärungen stehen unter `regeln.grenze.*` und `regeln.vorbedingung.*` in `packages/shared/src/i18n/de.ts`. `apps/web/src/lib/belege/regeln.test.ts` prüft die Liste und dass keine sichtbare Zeile einen Textschlüssel statt eines Textes zeigt.

## Sicherheit

- **Rechte der neuen Tabellen** (`packages/db/src/rollen.ts#APP_TABLE_RIGHTS`): `teams` lesen, anlegen, nur Name, Leitung, Zusammenarbeit, Abnahme-Standard und Zeit ändern, löschen; `team_entwuerfe` lesen, anlegen, nur Stand und die beiden Aktionen ändern; `team_anlagen`, `faeden` und `faden_punkte` nur lesen und anlegen. Auf `team_anlagen` kommen Trigger dazu (auch der Besitzer der Tabelle kann nicht ändern oder löschen).
- **Art und Team einer Unterhaltung stehen nach dem Anlegen fest** (Trigger `conversations_festhalten`, Funktion `paibot_unterhaltung_festhalten`): Ein Faden wird nie zum Direkt-Chat und wechselt nie das Team; beim Faden ist `bot_id` durch die Prüfregel `conversations_bot_oder_team` und die feste Art immer leer. Eine Zeile in `faeden` gibt es nur für eine Unterhaltung der Art `faden` (Trigger `faeden_nur_fuer_faden`). Beide Funktionen stehen in der Erlaubnisliste von `deploy/sicherung-db.sh`. Test: `packages/db/src/unterhaltung-festhalten.test.ts`.
- **Web-App und Worker teilen eine Datenbank-Rolle.** Die Datenbank kann deshalb nicht trennen, wer in `bots`, `teams`, `team_entwuerfe` und `faeden` schreibt. Das fängt ein Quelltext-Test ab: `apps/worker` und `packages/agents` rufen keine Schreibfunktion für diese Tabellen und kein Tabellen-Objekt von ihnen auf (`packages/db/src/teams-nur-besitzer-weg.test.ts`). **DB-seitig ist das nicht getrennt**; eine zweite Rolle ist eine eigene Aufgabe.
- **Fehlende Zeile heißt pausiert:** Fehlt die Zeile des Bots, lehnen die Aufrufer ab (`botPaused: true`), nie „nicht pausiert“ aus Mangel an Daten.
- **Zettel und Texte** eines Fadens stehen in dieser Fassung nicht in der Datenbank (nur das Ziel und die Punkte „fertig, wenn“, als Daten, die der Besitzer selbst anlegt).

## Vorschau, noch nicht angeschlossen

Für die Oberfläche der Verwaltung gibt es eine Vorschau-Seite mit erfundenen Beispiel-Daten. Sie ist **nicht** an die Datenbank, das Tor oder einen Server angeschlossen: Pausieren, Löschen, Team wechseln, Anlegen und Stoppen ändern nur den Speicher der Seite (`packages/ui/src/teams/Ansicht.tsx`). Die Seite gibt es nur mit dem Entwicklungs-Server (`/_komponenten/teams`, in Produktion 404, `apps/web/src/app/%5Fkomponenten/teams/page.tsx`).

| Szene (`?szene=…`) | Was sie zeigt                                                                                                                                                               | Baustein                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `seitenleiste`     | Kopf mit Logo, Not-Aus („Alle Bots laufen“), Haupt-Assistent, aufklappbare Teams mit Leitung, Bots ohne Team, Menü je Bot (pausieren, Team wechseln, löschen mit Rückfrage) | `Seitenleiste.tsx`, `BotMenue.tsx` |
| `bot`              | Steckbrief: Rolle, Team, Modell, „Darf / Fragt vorher / Darf nie“, Hinweis bei Pause (`&bot=zahlen` ist pausiert)                                                           | `Steckbrief.tsx`                   |
| `team`             | Name, Leitung, Zusammenarbeit (Aus / Leitung führt), Abnahme-Standard, Mitglieder, Hinweis ohne Tagesbudget                                                                 | `Verwaltung.tsx`                   |
| `entwurf`          | Teile mit Häkchen, voller Wortlaut der Anweisungen, Kosten-Hinweis, Anlegen und Rückgängig, Verfall nach 7 Tagen                                                            | `Entwurf.tsx`                      |
| `uebersicht`       | Fäden aller Teams nach „Läuft“, „Wartet auf dich“, „Fertig“; nur „Faden öffnen“ und „Stoppen“                                                                               | `Uebersicht.tsx`                   |

Weitere Parameter: `thema=hell` und `bot=<name in Kleinbuchstaben>`.

- **Daten:** Das Team „Content“ und der Wortlaut seiner Anweisungen kommen aus `vorlagen/teams/content-team.json`; die Seite liest die Datei beim Laden (`apps/web/src/app/%5Fkomponenten/teams/vorlage.ts`), der Wortlaut steht kein zweites Mal im Code. Das Team „Recherche“ und Pai sind erfunden (`packages/ui/src/teams/beispiel.ts`).
- **Typen:** Die Bausteine haben eigene Anzeige-Typen (`packages/ui/src/teams/typen.ts`); es gibt keine Vertragsdatei und keinen Import vom Server. Ein Test prüft, dass im Quelltext der Bausteine kein `fetch`, kein `WebSocket` und kein Import von `next`, `db`, `jobs`, `agents` oder `gate` steht.
- **Entwurf:** Das Team der Vorlage gibt es in der Seitenleiste erst nach „Team anlegen“; „Rückgängig“ nimmt es wieder weg. Die Leitung lässt sich nicht abwählen. Was die Fassung noch nicht kann (Automationen, Merkzettel, App-Zugriffe, Regel-Vorschläge), steht grau mit „kommt mit …“. Mit Not-Aus ist „Team anlegen“ gesperrt; Ändern und Verwerfen gehen weiter.
- **Wortwahl:** „Leitung“, nie „Ansprechpartner“; „abgenommen“, nie „freigegeben“. Die Texte stehen unter `teams.*` in `packages/shared/src/i18n/de.ts`.
- **Handy:** Unter 960 Pixel Breite ist die Seitenleiste ein Blatt von unten mit Griffzeile; die Rückfrage vor dem Löschen liegt über der ganzen Seite. Es gibt nirgends einen sichtbaren Scrollbalken.
- **Tests:** `packages/ui/src/teams/teams.test.ts` (Bausteine mit eigener Beispiel-Vorlage: Szenen, Pflichten, Wortwahl) und `apps/web/src/app/%5Fkomponenten/teams.test.ts` (Seite rendert auch wenn `fetch` wirft, Quelltext ohne Abruf, Wortlaut der echten Vorlage). Im Browser prüft `scripts/teams-browser.mjs` (`pnpm teams:browser`, Entwicklungs-Server unter `localhost`, Adresse in `TEAMS_URL`): Menü mit der Tastatur, Rückfrage beim Löschen, Not-Aus im Entwurf, Blatt am Handy, kein Scrollbalken, hell/dunkel.
- **Bilder:** Die Aufnahmen `teams-*` stehen in `docs/screenshots.json` (Feld „modus“: „entwicklung“) und entstehen mit `pnpm doku:screenshots teams-seitenleiste …`; je Szene dunkel und hell, 1440 und 390 Pixel breit.

Die Vorschau ist freigegeben und die Verwaltung daraus gebaut: `Seitenleiste.tsx` steckt jetzt in `packages/ui/src/shell/AppShell.tsx`, `Steckbrief.tsx` in `apps/web/src/app/(app)/bot/[id]/`, `Verwaltung.tsx` in `apps/web/src/app/(app)/teams/[id]/`. Die Vorschau-Seite bleibt daneben stehen, weil sie Szenen zeigt, die es in echten Daten noch nicht gibt (Entwurf, Übersicht der Fäden). „Team aus Vorlage“ ist noch nicht gebaut.

## Tests

| Datei                                                                                                                          | Prüft                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/teams-update-postgres.test.ts`                                                                                | Update von 0016 mit Bestandsdaten, CHECK-Regel, Löschregeln, Rechte der App-Rolle, die dreizehn Aktionen (echtes Postgres)               |
| `packages/db/src/repo/bots-loeschen.test.ts`                                                                                   | Löschen von Bots: Läufe, Standard-Bot, Team, Leitung, Team mit Faden                                                                     |
| `packages/db/src/teams-nur-besitzer-weg.test.ts`                                                                               | Worker und Lauf-Steuerung schreiben nicht in die Tabellen für Teams                                                                      |
| `packages/agents/src/run/bot-stand.test.ts`                                                                                    | `readBotPaused` liest frisch und gibt bei fehlender Zeile `undefined`                                                                    |
| `packages/agents/src/run/bot-pausiert.test.ts`                                                                                 | Füllwert im Direkt-Chat, Pause vor dem Lauf, Pause mitten im Lauf                                                                        |
| `apps/web/src/lib/chat/aktionen.test.ts`, `apps/web/src/lib/chat/neu-erzeugen.test.ts`, `apps/web/src/lib/chat/export.test.ts` | Faden: fester Hinweis, keine Nachricht, kein Lauf; Export ohne Bot; pausierter Bot beim Senden                                           |
| `apps/web/src/bot-pause-aufrufer.test.ts`                                                                                      | alle Aufrufer des Tors füllen `botPaused`                                                                                                |
| `packages/db/src/repo/teams.test.ts`                                                                                           | Teams anlegen (doppelter Name), lesen, ändern, löschen (Team mit Faden), Mitglieder, erlaubte Stände eines Entwurfs                      |
| `apps/web/src/lib/teams/verwaltung.test.ts`                                                                                    | die neun Routen: ohne Sitzung 401, ohne Prüfzeichen 403, Grenze der Bots, Standard-Bot, Belege bleiben nach dem Löschen, Leitung im Team |
| `apps/web/src/gate-pflicht.test.ts`                                                                                            | je Route genau ein Beleg „Entscheidung“ und einer „Ergebnis“, Änderung an Daten dazwischen; lesende Routen schreiben nichts              |
| `apps/web/src/lib/teams/seite.test.ts`                                                                                         | Bot aus der Adresse statt Standard-Bot, Haupt-Assistent, Team mit Leitung, `ohneTagesbudget`                                             |
| `apps/web/src/lib/teams/ansicht.test.ts`, `pfade.test.ts`                                                                      | Abbildung auf die Anzeige-Typen; die Browser-Pfade gegen den Routen-Vertrag                                                              |
| `apps/web/src/app/(app)/teams/seiten.test.ts`                                                                                  | die drei Seiten: Listen, Formulare, Weg zum Steckbrief, Hinweis am Schalter, Rückfrage beim Löschen                                      |
| `apps/web/src/lib/modelle/eigener-anbieter.test.ts`, `regeln.test.ts`                                                          | ein zweiter Bot schreibt: Anbieter und Regel bleiben, bis sein Lauf fertig ist                                                           |
| `apps/web/src/app/(app)/startseite.test.ts`                                                                                    | `?bot=` wählt den Bot einer neuen Unterhaltung; nur echte Bot-Kennungen zählen, sonst der Standard-Bot                                   |
| `apps/web/src/lib/chat/bereitschaft.test.ts`                                                                                   | eine bestehende Unterhaltung berichtet über ihren eigenen Bot: Pause und Modell gehören ihm, nicht dem Standard-Bot                      |

## Bekannte Schwächen

- **In einem Faden antwortet noch kein Bot.** Entwürfe und Fäden lassen sich nur über das Tor und die Datenbank anlegen, nicht über eine Seite; die sechs Aktionen dafür haben keine Route (`apps/web/src/lib/routen.test.ts#OHNE_BEDIENUNG`). Die Zählfakten der Entwürfe füllt noch niemand, siehe „Für kommende Pakete“ in [Tor und Belege](tor.md#für-kommende-pakete).
- **Eine Rolle für Web-App und Worker:** siehe Sicherheit.
- **Die Anweisung eines weiteren Bots ändert die Oberfläche nicht.** `PUT /api/bot` gehört dem Haupt-Assistenten; für die weiteren Bots gibt es nur den Steckbrief, Pause, Team und Löschen.
- **Die Reihenfolge der Entwurf-Stände prüft die Zugriffsschicht, nicht die Datenbank** (`packages/db/src/repo/teams.ts#ENTWURF_WECHSEL`). Ein Trigger hätte eine weitere Migration gebraucht; wer die Tabelle direkt beschreibt, umgeht die Prüfung.
- **Die Seite „Regeln“ zeigt die Nummern der Entwurf- und Faden-Aktionen nicht** (`apps/web/src/lib/belege/regeln.ts#NOCH_NICHT_BEDIENBAR`), weil man sie noch nicht benutzen kann.
- **Die Herkunft `datei`** eines Entwurfs ist in der Datenbank erlaubt, im Tor aber noch nicht (Fassung 4 kennt nur `vorlage`).
- **„Zusammenarbeit“ und „Abnahme-Standard“ sind heute gespeicherte Angaben.** Sie wirken erst mit den Fäden; nichts im Lauf liest sie.
