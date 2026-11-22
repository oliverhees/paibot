<!--
PaiBot – Entwickler-Seite: Doku der eigenen Version als durchsuchbarer Index im Image.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# Doku-Index – für Entwickler

**Anwender-Doku:** keine eigene Seite, denn es gibt noch keine Funktion für die Person; der Index ist eine Grundlage im Image. Der Satz zur Doku-Prüfung steht in der [Übersicht der Doku](../README.md#screenshots).

## Zweck und Entscheidung

Das Image enthält die Doku der eigenen Version, damit der Bot in ihr nachschlagen kann, ohne Internet. Diese Seite beschreibt den Index selbst: einen bereinigten Text-Index im Image. Lader, Suche und das Werkzeug „In der Doku nachschlagen“ beschreibt [In der Doku nachschlagen](doku-nachschlagen.md); das Werkzeug ist gebaut, aber noch nicht eingeschaltet, und zur Laufzeit liest noch nichts den Index.

Welche Seiten hinein kommen, legen zwei feste Listen fest (`scripts/doku-umfang.mjs#IN_DEN_INDEX` und `scripts/doku-umfang.mjs#NICHT_IN_DEN_INDEX`). In den Index kommt die Anwender-Doku. Entwickler-Seiten, die Vorlage, die Beitragsvereinbarung und die Lizenzpolitik bleiben draußen: Sie helfen der Person nicht bei der Bedienung, und Vertrags- und Lizenztexte sollen nicht aus dem Zusammenhang gerissen zitiert werden. Eine Seite unter `docs/`, die in keiner der Listen steht, ist ein Fehler von `pnpm doku:check`; so muss jede neue Seite bewusst eingeordnet werden.

## Aufbau

| Datei                           | Aufgabe                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/doku-umfang.mjs`       | die beiden Listen und der Mustervergleich (`passtAuf`), von Index und Prüfung gemeinsam benutzt                                          |
| `scripts/doku-index.mjs`        | Befehl `pnpm doku:index`: wählt die Seiten, baut den Index (`baueIndex`), schreibt die Datei                                             |
| `scripts/doku-index/hilfen.mjs` | Bereinigung und Zerlegung (`zerlege`), Erkennung unsichtbarer Zeichen, Formen für die Prüfung                                            |
| `scripts/doku-check.mjs`        | die Prüfungen j bis l (versteckte Teile, Listen, eingeschleuste Anweisungen)                                                             |
| `apps/web/Dockerfile`           | Bau-Stufe: `RUN pnpm doku:index`; Laufzeit-Stufe: `ENV PAIBOT_DOKU_INDEX` und eine Kopier-Zeile (root-eigen, nur lesbar, `--chmod=0444`) |
| `.dockerignore`                 | lässt die Seiten der Liste „in den Index“ in den Build, Bilder und alle anderen Seiten bleiben draußen                                   |
| `scripts/doku-index/testdaten/` | Testseiten und Mini-Projekte nur für die Tests, nie unter `docs/`                                                                        |

Datenfluss:

1. Beim Bau des Images läuft in der Bau-Stufe `pnpm doku:index` (`apps/web/Dockerfile`). Dafür enthält der Build-Kontext nur die Seiten der Liste (`.dockerignore`).
2. `baueIndex` (`scripts/doku-index.mjs#baueIndex`) löst die Liste auf. Fehlt eine Seite oder passt ein Muster auf keine Datei, bricht der Bau ab.
3. `zerlege` (`scripts/doku-index/hilfen.mjs#zerlege`) bereinigt jede Seite und schneidet sie je Überschrift (`##`, `###`) in Abschnitte. Der Text unter der Überschrift erster Ebene bildet einen eigenen Abschnitt; Abschnitte ohne Text entfallen. Jeder Abschnitt bekommt den Pfad der Überschriften über sich (`pfad`), auch wenn eine Überschrift darüber selbst keinen Text hat.
4. Der Index wird als `doku-index.json` im Ordner `doku-index` des Projektstamms geschrieben. Die Datei ist erzeugt und steht in `.gitignore`.
5. Die Laufzeit-Stufe kopiert die Datei nach `/app/doku-index/doku-index.json`; die Umgebungsvariable `PAIBOT_DOKU_INDEX` zeigt dorthin. Web und Worker nutzen dasselbe Image, also dieselbe Kopie.

Bereinigung: entfernt zuerst unsichtbare und Bidi-Zeichen (damit ein dadurch zerteilter Kommentar nicht übrig bleibt), dann alle HTML-Kommentare (auch den Urheber-Kopf), HTML-Tags und Bilder außerhalb von Code; entfernte Zeichen sind (U+200B bis U+200F, U+FEFF, U+202A bis U+202E, U+2066 bis U+2069) sowie Steuerzeichen außer Zeilenumbruch und Tabulator. Links werden zu ihrem Text. Codeblöcke und Code in Backticks bleiben unverändert, auch wenn darin etwas wie ein Tag oder Link aussieht.

## Datenmodell und Migrationen

Keine eigenen Tabellen, keine Migration. Das Format der Datei:

```ts
interface DokuIndex {
  format: "pb-doku-index";
  v: 2; // scripts/doku-index.mjs#FASSUNG
  stand: { version: string; pruefsumme: string }; // "sha256:" + Hex
  abschnitte: Array<{
    id: string; // "<seite>#<anker>", eindeutig
    seite: string; // relativ zu docs/, z. B. "funktion-belege.md"
    anker: string; // im Stil von GitHub aus der Überschrift
    titel: string;
    pfad: string[]; // Titel der Überschriften von der Seite abwärts, die eigene zuletzt
    text: string; // bereinigt, bis zur nächsten ##/###-Überschrift
  }>;
}
```

- `version` ist die Version aus der `package.json` im Projektstamm. Ein Commit steht nicht im Stand, weil `.git` nicht im Build-Kontext ist (`.dockerignore`).
- `pruefsumme` ist der SHA-256 über die JSON-Form von `abschnitte` (`scripts/doku-index.mjs#pruefsumme`). Sie ändert sich, wenn sich ein Abschnitt ändert; der Urheber-Kopf und andere Kommentare zählen nicht, weil sie vorher entfernt werden.
- `pfad` enthält die Titel der Überschriften erster bis dritter Ebene, die über dem Abschnitt offen sind, von oben nach unten, zuletzt den eigenen Titel; bereinigt wie der Titel. Beispiel: „Auf dem iPhone und iPad (Safari)“ in `installation.md` hat den Pfad „Installation“ › „Als Web-App installieren“ › „Auf dem iPhone und iPad (Safari)“. Fassung 1 hatte das Feld nicht; seit Fassung 2 steht es in jedem Abschnitt und zählt zur Prüfsumme.
- Die Datei enthält keinen Zeitstempel und nichts Zufälliges: zweimal bauen ergibt dieselben Bytes.
- Doppelte Anker auf einer Seite brechen den Bau ab (zwei gleiche Überschriften); eine der beiden muss anders heißen.

## Schnittstellen

| Art               | Name                | Datei                    |
| ----------------- | ------------------- | ------------------------ |
| Befehl            | `pnpm doku:index`   | `package.json`           |
| Umgebungsvariable | `PAIBOT_DOKU_INDEX` | `apps/web/Dockerfile`    |
| Befehl (Prüfung)  | `pnpm doku:check`   | `scripts/doku-check.mjs` |

Keine Route, keine Aktion, kein Ereignis. Gelesen wird der Index nur vom Lader des Werkzeugs (`packages/agents/src/werkzeuge/doku/index-laden.ts#ladeDokuIndex`), der nur die Fassung 2 annimmt und zur Laufzeit noch nicht aufgerufen wird. Der Bau bricht mit Ausgang 1 und einer Meldung ab, wenn eine Seite der Liste fehlt, ein Muster auf keine Datei passt, der Index keinen Abschnitt hat, größer als 4 MB ist oder eine Kennung doppelt vorkommt (`scripts/doku-index.mjs#GRENZE_BYTES`).

## Suche

Gesucht wird im Worker, im Speicher, mit einer festen Regel ohne Netz: Normalisieren, Stoppwörter, gleiche Wörter, jeder Begriff muss vorkommen, Titel und Pfad der Überschriften zählen mehr als der Text. Die Regel steht wörtlich in [In der Doku nachschlagen](doku-nachschlagen.md#suche) (`packages/agents/src/werkzeuge/doku/suche.ts#sucheImIndex`).

## Sicherheit

- Die Doku gilt als vertrauenswürdig, weil sie beim Bau aus diesem Repo entsteht. Liest ein Werkzeug Ankündigungen oder andere Inhalte, die nicht beim Bau aus dem Repo entstehen, gelten diese als fremd.
- Der Index kann zur Laufzeit nicht verändert werden: Das Image ist schreibgeschützt (`deploy/docker-compose.yml`), die Datei liegt im Image.
- Die Bereinigung nimmt versteckte Teile (Kommentare, unsichtbare und Bidi-Zeichen) heraus, bevor etwas im Index landet.
- `pnpm doku:check` lehnt in allen Seiten unter `docs/` HTML-Kommentare außer dem Urheber-Kopf am Anfang sowie unsichtbare und Bidi-Zeichen ab. Ebenso lehnt es rohes HTML im Fließtext ab (`scripts/doku-index/hilfen.mjs#findeRohesHtml`, aufgerufen in `scripts/doku-check.mjs#checkVersteckt`): jedes `<` vor Buchstabe, `/`, `!` oder `?` außerhalb von Codeblöcken, Code in Backticks und dem Urheber-Kopf, also auch `<!x …>`, `<?x …?>`, CDATA und Tags wie ein ausgeblendetes `span`; ausgenommen sind Adress-Verweise in spitzen Klammern und die Vorlagen. Erlaubte Tags stehen in `hilfen.mjs#ERLAUBTE_TAGS` (heute keine, weil keine Seite eines braucht); auch ein erlaubtes Tag darf kein Attribut `hidden` oder `style` tragen. Für Seiten der Liste „in den Index“ prüft es außerdem, dass Überschriften, ihre Pfade und Anker keine Zeichen enthalten, die der Index-Bau ablehnt (`hilfen.mjs#findeUnerlaubtImTitel`, dieselbe Funktion wie beim Bau; `scripts/doku-check.mjs#checkUeberschriften`). In den Seiten der Liste „in den Index“ lehnt es zusätzlich typische Formulierungen eingeschleuster Anweisungen ab (`scripts/doku-index/hilfen.mjs#EINSCHLEUSE_FORMEN`). Das ist eine Stichprobe, kein Schutz: Sie erkennt nur bekannte Formen, und eine andere Formulierung geht durch.
- Testseiten mit eingeschleusten Sätzen liegen nur unter `scripts/doku-index/testdaten/`, nie unter `docs/`; in echten Doku-Seiten wird so etwas beschrieben, nie wörtlich zitiert. Ein Test stellt sicher, dass kein Text aus den Testdaten im echten Index steht.
- Der Index enthält nur Dateien aus dem Repo.

## Tests

| Test                                         | Prüft                                                                                                                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/lint-regeln/src/doku-index.test.ts`   | Bereinigung, Zerlegung, Pfad der Überschriften, Auswahl der Seiten, Abbruch beim Bau (fehlende Seite, Muster ohne Treffer, leer, über 4 MB, doppelte Kennung), Wiederholbarkeit, keine Testdaten im echten Index             |
| `tools/lint-regeln/src/doku-check.test.ts`   | versteckte Teile, die beiden Listen, jede Form eingeschleuster Anweisungen mit Beispiel und Gegenbeispiel                                                                                                                    |
| `tools/lint-regeln/src/dockerignore.test.ts` | `.dockerignore` lässt die Seiten der Liste hinein und Bilder und Entwickler-Seiten draußen; die Zeilen im Dockerfile (Index root-eigen und nur lesbar); aus dem so bestimmten Build-Kontext entsteht der Index (ohne Docker) |
| `.github/workflows/ci.yml`                   | Schritt „Doku-Index im Image prüfen“: der Index im Web- und im Worker-Container ist byte-gleich zu einem frisch gebauten                                                                                                     |

Ausführen:

```bash
pnpm --filter @paibot/lint-regeln test
pnpm doku:index
pnpm doku:check --streng
```

## Bekannte Schwächen

- Im Stand steht kein Commit, nur Version und Prüfsumme (`scripts/doku-index.mjs#baueIndex`).
- Die Wildcard `docs/funktion-*.md` in `scripts/doku-umfang.mjs#IN_DEN_INDEX` nimmt jede neue Funktionsseite automatisch auf.
- Die Prüfung auf eingeschleuste Anweisungen ist eine Stichprobe; sie ersetzt keine Durchsicht.
- Anker folgen GitHub, aber ohne Nummerierung doppelter Überschriften: Doppelte brechen den Bau ab.
- Ob die Ausnahme-Zeilen in `.dockerignore` bei einem echten `docker build` genau so greifen, wie der Test sie nachbildet, ist hier ohne Docker-Dienst nicht belegt; die CI baut das Image und vergleicht den Index.
