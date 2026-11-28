<!--
PaiBot – Entwickler-Seite: Datenbank für Aufträge (Migration 0020).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-28
-->

# Datenbank für Aufträge – für Entwickler

**Anwender-Doku:** keine eigene Seite. Die Datenbank ist da, aber noch kein Lauf legt Aufträge an; das kommt mit den Übergaben zwischen Bots. Was das Tor zu Aufträgen entscheidet, steht in [Tor und Belege](tor.md).

## Zweck und Entscheidung

Aufträge verbinden die Läufe der Bots zu einem Baum: Deine Nachricht beginnt eine Wurzel, jede Übergabe eines Bots an einen anderen ist ein Kind. Für den Baum gelten Grenzen (Tiefe, Anzahl, Token, Zeit), und je Baum läuft höchstens ein Lauf zur selben Zeit. Die Migration `packages/db/drizzle/0020_auftraege.sql` legt dafür drei Tabellen an und ergänzt Fäden, Nachrichten, Läufe und Einstellungen.

Die Regeln stehen in der Datenbank selbst (Trigger), nicht nur im Code: Ein Fehler im Server oder ein Zugriff an den Zugriffsfunktionen vorbei kann keinen Auftrag ohne Entscheidung des Tors anlegen, keinen Zettel ändern und „belastet“ nicht zurücknehmen.

**Entscheidung: `runs.untrusted_input` zusätzlich zu `messages.untrusted`.** Ein Lauf hält beim Anlegen fest, ob seine Eingabe fremde Inhalte enthielt (`packages/db/src/schema/unterhaltungen.ts#untrustedInput`); danach ist der Wert unveränderlich (Trigger `paibot_runs_auftrag` in `packages/db/drizzle/0020_auftraege.sql`), bei Läufen mit Auftrag ist er Pflicht (Prüfregel `runs_auftrag_mit_kennzeichen`). Gründe:

- `messages.untrusted` kennzeichnet die Ausgaben eines Laufs und wird erst während des Laufs gesetzt (`packages/db/src/repo/nachrichten.ts#markRunUntrusted`). Eine Entscheidung des Tors, die ein Bot am Ende seines Laufs auslöst (Übergabe, Meldung), braucht aber den Stand der **Eingabe**, und zwar so, wie er beim Start war.
- Aus den Nachrichten neu gerechnet, hinge der Wert davon ab, welche Nachrichten der Lauf gerade sieht. Fällt eine belastete Nachricht aus dem Verlaufsfenster, würde ein belasteter Lauf als sauber gelten. Der gespeicherte Wert ändert sich dadurch nicht.
- `faeden.belastet` deckt nur Fäden ab, nicht den Chat mit Pai. Der Server verknüpft deshalb drei Werte: den gespeicherten Wert des Laufs, „belastet“ der Wurzel und „belastet“ des Fadens. Fehlt der Wert, gilt der Lauf als belastet.

Verworfen: **nur `messages.untrusted`** (bei jeder Entscheidung neu rechnen, aus den genannten Gründen) und **eine Spalte am Auftrag statt am Lauf** (ein Auftrag hat mehrere Läufe, etwa nach einer Rückfrage; jeder sieht eine andere Eingabe). Ältere Läufe behalten den leeren Wert (nicht erfasst).

**Entscheidung: keine Spalte für Rückgaben.** Wie oft die Leitung einem Mitglied in einem Baum Arbeit gibt, zählt der Server aus den Zeilen (`packages/db/src/repo/auftraege.ts#auftraegeAnMitglied`, Arten `uebergabe` und `rueckgabe`). Ein Zähler am Auftrag ließe sich umgehen, etwa mit einer neuen Übergabe statt einer Rückgabe.

**Entscheidung: `auftraege` ist Abgleich-Klasse A** wie `faeden` (Begründung im Eintrag `auftraege` in `packages/db/src/schema/abgleich-klassen.ts`): Zettel, Entscheidung und Baum stehen fest, nur der Stand geht feste, einseitige Wege.

## Aufbau

| Datei                                        | Aufgabe                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/auftraege.ts`        | Tabellen `auftraege`, `auftrag_ereignisse`, `auftrag_zuschlaege` mit Prüfregeln                                      |
| `packages/db/src/schema/werte.ts`            | Wertelisten: `AUFTRAG_ARTEN_DB`, `AUFTRAG_STATUS`, `AUFTRAG_EREIGNIS_TYPEN`, `FADEN_STAENDE`, `NACHRICHT_HERKUENFTE` |
| `packages/db/src/schema/unterhaltungen.ts`   | neue Spalten an `messages` und `runs`, Teil-Index `runs_ein_aktiver_lauf_je_auftragsbaum`                            |
| `packages/db/src/schema/teams.ts`            | neue Spalten an `faeden` (`stand`, `stab_bei`, `belastet`)                                                           |
| `packages/db/src/schema/settings.ts`         | Grenzen der Aufträge und `notaus_epoche`                                                                             |
| `packages/db/drizzle/0020_auftraege.sql`     | Migration mit allen Triggern (von Hand ergänzter Teil nach dem letzten erzeugten Befehl)                             |
| `packages/db/src/repo/auftraege.ts`          | Zugriffsfunktionen: anlegen, Stand setzen, Zähler, „belastet“, Zuschläge, Zählungen für die Grenzen                  |
| `packages/db/src/repo/laeufe.ts`             | `create` nimmt einen Auftrag mit Wurzel und Kennzeichen an (`RunCreate.auftrag`)                                     |
| `packages/db/src/repo/nachrichten.ts`        | `insert` nimmt Autor, Auftrag und Bezug an (`MessageCreate.botId`, `auftragId`, `frageBezug`)                        |
| `packages/db/src/repo/abbildung.ts`          | `herkunftImVertrag`: `rueckmeldung` erscheint im Vertrag als `fest`, `vorschlag` ohne Herkunft                       |
| `packages/db/src/rollen.ts`                  | Rechte der App-Rolle auf den neuen Tabellen und Spalten                                                              |
| `packages/db/src/schema/abgleich-klassen.ts` | Klasse A für die drei neuen Tabellen                                                                                 |
| `deploy/sicherung-db.sh`                     | Erlaubnisliste der Funktionen beim Zurückspielen (neue Trigger-Funktionen)                                           |

Ablauf, wie ihn die Datenbank erzwingt:

1. Deine Nachricht ist im Tor erlaubt (`nachricht.senden`). Der Server legt mit derselben Kennung der Aktion die Wurzel an (`packages/db/src/repo/auftraege.ts#anlegen`). Der Trigger `auftraege_regeln` sucht dafür die erlaubte Entscheidung in `belege`.
2. Ein Lauf unter dem Auftrag entsteht mit Auftrag, Wurzel und Kennzeichen (`packages/db/src/repo/laeufe.ts#create`). Der Trigger `runs_auftrag` prüft, dass Unterhaltung, Bot und Wurzel zum Auftrag passen und der Not-Aus aus ist, in der Epoche des Auftrags.
3. Erst mit einem aktiven Lauf wechselt der Auftrag nach `arbeitet` (`packages/db/src/repo/auftraege.ts#statusSetzen`). Jeder Wechsel schreibt ein Ereignis in `auftrag_ereignisse` (Trigger `auftraege_ereignisse`).
4. Eine Übergabe eines Bots (`auftrag.uebergeben`, erlaubt, an genau diesen Empfänger) legt ein Kind an. Das Kind erbt „belastet“ vom Eltern-Auftrag.

## Datenmodell und Migrationen

| Tabelle              | Schema                                | Klasse | Wofür                                                                                                                         |
| -------------------- | ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `auftraege`          | `packages/db/src/schema/auftraege.ts` | A      | Auftrag mit Art, Eltern, Wurzel, Unterhaltung, Empfänger, Geber, Zettel, „fertig, wenn“, Stand, Entscheidung, Epoche, Zählern |
| `auftrag_ereignisse` | `packages/db/src/schema/auftraege.ts` | A      | Anlegen und jeder Wechsel des Stands, ohne Texte; nur anhängen                                                                |
| `auftrag_zuschlaege` | `packages/db/src/schema/auftraege.ts` | A      | Zuschläge „+10.000 Token“ je Wurzel, höchstens 5; nur anhängen                                                                |

Neue Spalten an bestehenden Tabellen (alle mit Startwert oder leer, bestehende Zeilen bleiben, wie sie sind):

| Tabelle    | Spalten                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `faeden`   | `stand` (Start `laufend`), `stab_bei` (`besitzer` oder `bot:…`), `belastet`                                                                                                                                                                                                                 |
| `messages` | `bot_id` (Autor einer Antwort), `auftrag_id`, `frage_bezug`; `origin` kennt zusätzlich `rueckmeldung` und `vorschlag`                                                                                                                                                                       |
| `runs`     | `auftrag_id`, `auftrag_root_id`, `untrusted_input`, `finish_reason`                                                                                                                                                                                                                         |
| `settings` | `auftrag_max_tiefe` 3, `auftrag_max_anzahl` 20, `auftrag_max_tokens` 200 000, `auftrag_max_minuten` 30, `auftrag_max_breite` 6, `auftraege_je_mitglied` 3, `rueckfragen_je_faden` 3, `bitten_je_auftrag` 1, `zuschlaege_je_baum` 5 (fest), `erwaehnungen_je_nachricht` 6, `notaus_epoche` 0 |

Die Grenzen in `settings` entsprechen den Grenzen des Tors: Tiefe G-09, Anzahl G-10, Token G-11, Minuten G-12, Breite G-41, Aufträge je Mitglied G-43, Rückfragen G-44, Bitten G-45, Zuschläge G-46, Erwähnungen G-38. Jede hat eine Prüfregel für ihren Bereich (`settings_*_bereich` in `packages/db/src/schema/settings.ts`).

Trigger der Migration (`packages/db/drizzle/0020_auftraege.sql`):

| Trigger                                                                                   | Regel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auftraege_regeln`                                                                        | beginnt als `gefragt` ohne Zähler; Not-Aus aus und aktuelle Epoche; passende erlaubte Entscheidung in `belege`; Kind nur an offenem Eltern-Auftrag derselben Wurzel und Epoche, erbt „belastet“; `rueckkehr` erst nach dem Ende des Kinds, `sammeln` erst nach dem Ende aller Fächer-Kinder, `rueckmeldung` nur im Chat mit Pai; danach fest: alles außer Stand, Zählern, „belastet“, Grund und Zeiten; Zähler nie kleiner; „belastet“ nie zurück; Stand nur auf festen Wegen; `arbeitet` nur mit aktivem Lauf |
| `auftraege_ereignisse`                                                                    | schreibt `auftrag.created` und `auftrag.status`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `auftrag_ereignisse_nur_anhaengen`, `auftrag_zuschlaege_nur_anhaengen`, `…_kein_truncate` | kein Ändern, kein Löschen, kein Leeren, auch nicht für den Besitzer der Tabelle; gelöscht wird nur mit dem Auftrag                                                                                                                                                                                                                                                                                                                                                                                             |
| `auftrag_zuschlaege_regeln`                                                               | nur für die Wurzel eines offenen Baums, nur mit deiner erlaubten Entscheidung `auftrag.budget_erhoehen`; vergibt die Nummer 1 bis 5                                                                                                                                                                                                                                                                                                                                                                            |
| `faeden_regeln`                                                                           | Ziel, Abnahme, Herkunft und Entscheidung fest; „belastet“ nie zurück                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `messages_unveraenderlich` (Funktion ersetzt)                                             | wie bisher, dazu: Autor, Auftrag und Bezug fest; Inhalt und Zustand nach dem Abschluss fest                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `messages_bezuege`                                                                        | neue Antwort in einem Faden nennt ihren Autor; Autor = Bot des Laufs; Auftrag in derselben Unterhaltung; Bezug auf eine Antwort eines Bots derselben Unterhaltung                                                                                                                                                                                                                                                                                                                                              |
| `messages_faden_belasten`                                                                 | eine Nachricht mit fremdem Inhalt setzt `faeden.belastet`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `runs_auftrag`                                                                            | Auftrag, Wurzel und Kennzeichen fest; Abschluss-Grund einmal; Lauf passt zu Auftrag (Wurzel, Unterhaltung, Bot); Auftrag offen oder fertige Wurzel (Zurückgeben); kein Start nach dem Not-Aus in einer älteren Epoche                                                                                                                                                                                                                                                                                          |
| `settings_epoche`                                                                         | `notaus_epoche` steigt genau um 1 beim Einschalten des Not-Aus (fehlt die Erhöhung, setzt der Trigger sie), sonst nie                                                                                                                                                                                                                                                                                                                                                                                          |

Wege des Stands (auch `packages/db/src/repo/auftraege.ts#AUFTRAG_TRANSITIONS`): `gefragt` → `arbeitet`, `abgelehnt`, `abgebrochen`, `gescheitert`; `arbeitet` → `wartet_auf_dich`, `fertig`, `gescheitert`, `abgebrochen`; `wartet_auf_dich` → `arbeitet`, `fertig`, `gescheitert`, `abgebrochen`; `fertig` → `arbeitet` nur für die Wurzel.

Bestand beim Update: Die Migration setzt `faeden.belastet` für jeden Faden, in dem schon eine Nachricht mit `untrusted = true` steht (`packages/db/drizzle/0020_auftraege.sql`, Anweisung nach dem Trigger `messages_faden_belasten`); der Trigger allein sähe nur neue Schreibvorgänge. Test: `packages/db/src/auftraege-postgres.test.ts` „alte Fäden mit fremdem Inhalt …“.

Kein Weg zurück auf eine ältere Version nach dieser Migration: Die Herkunft `rueckmeldung` und `vorschlag` kennt der alte Stand nicht (Kopf der Migration).

## Schnittstellen

| Art       | Name                                                                                                                                                                | Datei                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Funktion  | `anlegen`, `get`, `baum`, `statusSetzen`, `rueckfrageZaehlen`, `bitteZaehlen`, `belasten`, `zuschlagAnhaengen`, `zuschlaege`, `auftraegeAnMitglied`, `offeneKinder` | `packages/db/src/repo/auftraege.ts`   |
| Konstante | `AUFTRAG_TRANSITIONS`, Funktion `canTransition`                                                                                                                     | `packages/db/src/repo/auftraege.ts`   |
| Konstante | `AKTIVER_LAUF_JE_BAUM_INDEX` (wird zu `lauf_aktiv`)                                                                                                                 | `packages/db/src/repo/fehler.ts`      |
| Typ       | `Auftrag`, `AuftragId`, `AuftragEreignis`, `AuftragZuschlag`                                                                                                        | `packages/db/src/schema/auftraege.ts` |

Im Index von `@paibot/db` als `repo.auftraege` (`packages/db/src/repo/index.ts`). Die Aktionen des Tors stehen in der Tor-Fassung 5 (`packages/shared/src/tor-fassung-5.ts#AUFTRAG_ACTION_SHAPES`); es gibt noch keine Route.

## Sicherheit

- **Jeder Auftrag hat eine Entscheidung:** `action_id` ist Pflicht. Der Trigger `auftraege_regeln` verlangt den Beleg einer erlaubten Entscheidung: deine Nachricht in derselben Unterhaltung, eine Übergabe des Gebers an genau diesen Empfänger oder dein Zurückgeben an diesen Empfänger. Die Arten des Servers (`rueckkehr`, `sammeln`, `rueckmeldung`) tragen die Entscheidung, die den Zweig geöffnet hat.
- **Rechte der App-Rolle** (`packages/db/src/rollen.ts#APP_TABLE_RIGHTS`): `auftraege` lesen und anlegen, ändern nur Stand, Zähler, „belastet“, Grund und Zeiten, nie löschen; `auftrag_ereignisse` und `auftrag_zuschlaege` nur lesen und anhängen (`APPEND_ONLY_TABLES`); `faeden` ändern nur Stand, Staffelstab, „belastet“ und Zeit; an `messages` ändert die App Autor, Auftrag und Bezug nie.
- **Not-Aus-Epoche:** Ein Auftrag speichert die Epoche beim Anlegen. Nach dem Einschalten und Ausschalten des Not-Aus startet kein Lauf eines vorher angelegten Auftrags mehr, und kein neuer Auftrag entsteht mit der alten Epoche.
- **Ein aktiver Lauf je Auftragsbaum:** Teil-Index `runs_ein_aktiver_lauf_je_auftragsbaum` über `auftrag_root_id`, auch über Unterhaltungen hinweg; zwei gleichzeitige Verbindungen bekommen nur einen Lauf.
- **Zettel:** höchstens 2 000 Zeichen, ohne Steuer-, unsichtbare oder richtungsdrehende Zeichen (Prüfregel mit `UNBEREINIGT_MUSTER`, `packages/db/src/schema/auftraege.ts`), unveränderlich.
- **Bewusst nicht in der Datenbank:** Ob ein Weg der Übergabe erlaubt ist (Rollen, Team, Schalter) und die Grenzen des Baums prüft das Tor; die Datenbank prüft nur, dass es die erlaubte Entscheidung gibt.

## Tests

| Test                                         | Prüft                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/db/src/auftraege.test.ts`          | jede Regel der Trigger und Prüfregeln (PGlite, frische Datenbank); über jedem Test steht als Kommentar die Gegenprobe                                                                                              |
| `packages/db/src/repo/auftraege.test.ts`     | Zugriffsfunktionen: Anlegen mit Wurzel und Epoche, Fehler `abgelehnt` und `eingabe_ungueltig`, Wege des Stands, Zähler, Zuschläge bis `limit_erreicht`, Zählung je Mitglied, `lauf_aktiv` je Baum, Autor und Bezug |
| `packages/db/src/auftraege-postgres.test.ts` | Update ab Stand 0019 mit Bestandsdaten (Unterhaltungen, Nachrichten, Lauf, Faden unverändert), Rechte der App-Rolle, Teil-Index mit zwei Verbindungen (echtes Postgres)                                            |
| `packages/db/src/abgleich-klassen.test.ts`   | Klasse A für die drei Tabellen; Nur-Anhängen-Tabellen sind A                                                                                                                                                       |
| `tools/durchstich/src/sicherung.test.ts`     | Erlaubnisliste der Funktionen in `deploy/sicherung-db.sh` passt zu den Migrationen                                                                                                                                 |

Ausführen:

```bash
pnpm --filter @paibot/db exec vitest run src/auftraege.test.ts src/repo/auftraege.test.ts
PAIBOT_TEST_DATABASE_URL=postgres://… pnpm --filter @paibot/db exec vitest run src/auftraege-postgres.test.ts
```

## Bekannte Schwächen

- **Noch kein Aufrufer:** Kein Lauf legt heute Aufträge an; Worker und Web-App nutzen die neuen Spalten noch nicht. Bis dahin bleiben alle neuen Spalten der bestehenden Zeilen leer.
- **Zurückgeben einer fertigen Wurzel:** Die Datenbank erlaubt `fertig` → `arbeitet` für jede Wurzel mit einem neuen Lauf, ohne die Entscheidung `auftrag.zurueckgeben` selbst zu prüfen. Das prüft der Server, bevor er den Lauf anlegt.
- **Herkunft im Vertrag:** `vorschlag` hat im Vertrag noch kein eigenes Wort und erscheint ohne Herkunft (`packages/db/src/repo/abbildung.ts#herkunftImVertrag`).
- **Faden-Antworten ohne Autor:** Ältere Antworten in Fäden haben keinen Autor; die Pflicht gilt nur für neue Zeilen.
