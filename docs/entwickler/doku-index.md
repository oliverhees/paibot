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

| Datei                             | Aufgabe                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/doku-umfang.mjs`         | die beiden Listen und der Mustervergleich (`passtAuf`), von Index und Prüfung gemeinsam benutzt                                                        |
| `scripts/doku-index.mjs`          | Befehl `pnpm doku:index`: wählt die Seiten, baut den Index (`baueIndex`), schreibt die Datei                                                           |
| `scripts/doku-index/markdown.mjs` | liest eine Seite mit dem Markdown-Parser (`leseSeite`): findet Verborgenes (`findeVerborgenes`), schneidet Abschnitte, prüft die Worte (`pruefeWorte`) |
| `scripts/doku-index/hilfen.mjs`   | Zeichenmengen (unsichtbar, in Titeln verboten), Anker, Formen für die Prüfung auf eingeschleuste Anweisungen; ohne Pakete                              |
| `scripts/doku-check.mjs`          | die Prüfungen j bis l (versteckte Teile, Listen, eingeschleuste Anweisungen)                                                                           |
| `package.json`                    | die Pakete des Parsers als `devDependencies` der Wurzel, fest gepinnt: `mdast-util-from-markdown`, `mdast-util-gfm`, `micromark-extension-gfm`         |
| `apps/web/Dockerfile`             | Bau-Stufe: `RUN pnpm doku:index`; Laufzeit-Stufe: `ENV PAIBOT_DOKU_INDEX` und eine Kopier-Zeile (root-eigen, nur lesbar, `--chmod=0444`)               |
| `.dockerignore`                   | lässt die Seiten der Liste „in den Index“ in den Build, Bilder und alle anderen Seiten bleiben draußen                                                 |
| `scripts/doku-index/testdaten/`   | Testseiten und Mini-Projekte nur für die Tests, nie unter `docs/`                                                                                      |

Datenfluss:

1. Beim Bau des Images läuft in der Bau-Stufe `pnpm doku:index` (`apps/web/Dockerfile`). Dafür enthält der Build-Kontext nur die Seiten der Liste (`.dockerignore`).
2. `baueIndex` (`scripts/doku-index.mjs#baueIndex`) löst die Liste auf. Fehlt eine Seite oder passt ein Muster auf keine Datei, bricht der Bau ab.
3. `leseSeite` (`scripts/doku-index/markdown.mjs#leseSeite`) liest jede Seite einmal mit dem Parser. Gibt es Verborgenes, bricht der Bau ab. Sonst schneidet es die Seite je Überschrift der Ebenen 1 bis 3 in Abschnitte. Der Text unter der Überschrift erster Ebene bildet einen eigenen Abschnitt; Abschnitte ohne Text entfallen. Jeder Abschnitt bekommt den Pfad der Überschriften über sich (`pfad`), auch wenn eine Überschrift darüber selbst keinen Text hat. Danach prüft `pruefeWorte` (`scripts/doku-index/markdown.mjs#pruefeWorte`) die Worte (siehe unten).
4. Der Index wird als `doku-index.json` im Ordner `doku-index` des Projektstamms geschrieben. Die Datei ist erzeugt und steht in `.gitignore`.
5. Die Laufzeit-Stufe kopiert die Datei nach `/app/doku-index/doku-index.json`; die Umgebungsvariable `PAIBOT_DOKU_INDEX` zeigt dorthin. Web und Worker nutzen dasselbe Image, also dieselbe Kopie.

Lesen: Was Code, Link, Bild oder HTML ist, sagt allein der Parser (`mdast-util-from-markdown` mit GFM, gebaut auf `micromark`; Fassungen in `package.json`). Es gibt keine eigenen Muster dafür. Der Text geht unverändert an den Parser (nur die Zeilenenden werden vereinheitlicht); nichts wird vorher still entfernt.

Schneiden (`scripts/doku-index/markdown.mjs#zerlege`): Eine Überschrift der Ebenen 1 bis 3 direkt unter der Wurzel schneidet die Seite; das gilt auch für Überschriften mit Unterstrich und mit bis zu drei Leerzeichen Einzug. Eine Überschrift in einer Liste oder einem Zitat schneidet nicht, ein `#` im Codeblock ebenso nicht. Im Text eines Abschnitts gilt: Ein Bild fällt als Ganzes weg (Alt-Text und Titel auch). Ein Link steht als sein Text, ein Adress-Verweis in spitzen Klammern als seine Adresse. Der Urheber-Kopf fehlt, ebenso ein Diagramm-Block (`mermaid`) samt Zaun-Zeilen. Alles andere bleibt Zeichen für Zeichen, auch Code, in dem etwas wie ein Tag oder Link aussieht.

Wort-Gegenprobe (`scripts/doku-index/markdown.mjs#pruefeWorte`): Aus demselben Baum entsteht der sichtbare Text der Seite (Werte von Text, Code in Backticks und Codeblöcken ohne Diagramme, dazu die Nummern geordneter Listen; nicht dazu gehören HTML, Alt-Texte, Titel, Link-Ziele und Definitionen). Jedes Wort mit drei oder mehr Buchstaben oder Ziffern im Text eines Abschnitts muss dort oder in `scripts/doku-index/markdown.mjs#ERLAUBTE_SPRACHEN` vorkommen (die Sprache steht in der Zaun-Zeile). Sonst bricht der Bau mit einem Hinweis auf einen Fehler beim Schneiden ab. Das prüft nur das Schneiden, nicht den Parser selbst.

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
    text: string; // wie oben beschrieben geschnitten, bis zur nächsten Überschrift der Ebenen 1 bis 3
  }>;
}
```

- `version` ist die Version aus der `package.json` im Projektstamm. Ein Commit steht nicht im Stand, weil `.git` nicht im Build-Kontext ist (`.dockerignore`).
- `pruefsumme` ist der SHA-256 über die JSON-Form von `abschnitte` (`scripts/doku-index.mjs#pruefsumme`). Sie ändert sich, wenn sich ein Abschnitt ändert; der Urheber-Kopf zählt nicht, weil er nicht im Text eines Abschnitts steht; andere Kommentare gibt es nicht, weil sie den Bau abbrechen.
- `pfad` enthält die Titel der Überschriften erster bis dritter Ebene, die über dem Abschnitt offen sind, von oben nach unten, zuletzt den eigenen Titel; bereinigt wie der Titel. Beispiel: „Auf dem iPhone und iPad (Safari)“ in `installation.md` hat den Pfad „Installation“ › „Als Web-App installieren“ › „Auf dem iPhone und iPad (Safari)“. Fassung 1 hatte das Feld nicht; seit Fassung 2 steht es in jedem Abschnitt und zählt zur Prüfsumme.
- Die Datei enthält keinen Zeitstempel und nichts Zufälliges: zweimal bauen ergibt dieselben Bytes.
- Doppelte Anker auf einer Seite brechen den Bau ab (zwei gleiche Überschriften); eine der beiden muss anders heißen.

## Schnittstellen

| Art               | Name                | Datei                    |
| ----------------- | ------------------- | ------------------------ |
| Befehl            | `pnpm doku:index`   | `package.json`           |
| Umgebungsvariable | `PAIBOT_DOKU_INDEX` | `apps/web/Dockerfile`    |
| Befehl (Prüfung)  | `pnpm doku:check`   | `scripts/doku-check.mjs` |

Keine Route, keine Aktion, kein Ereignis. Gelesen wird der Index nur vom Lader des Werkzeugs (`packages/agents/src/werkzeuge/doku/index-laden.ts#ladeDokuIndex`), der nur die Fassung 2 annimmt und zur Laufzeit noch nicht aufgerufen wird. Der Bau bricht mit Ausgang 1 und einer Meldung ab, wenn eine Seite der Liste fehlt, ein Muster auf keine Datei passt, der Index keinen Abschnitt hat, größer als 4 MB ist (`scripts/doku-index.mjs#GRENZE_BYTES`), eine Kennung doppelt vorkommt, ein Titel ein unerlaubtes Zeichen trägt, die Wort-Gegenprobe ein Wort findet oder eine Seite Verborgenes enthält (`scripts/doku-index.mjs#baueIndex`; die Meldung nennt Seite und Zeile und verweist auf `pnpm doku:check --streng` für alle Stellen).

## Suche

Gesucht wird im Worker, im Speicher, mit einer festen Regel ohne Netz: Normalisieren, Stoppwörter, gleiche Wörter, jeder Begriff muss vorkommen, Titel und Pfad der Überschriften zählen mehr als der Text. Die Regel steht wörtlich in [In der Doku nachschlagen](doku-nachschlagen.md#suche) (`packages/agents/src/werkzeuge/doku/suche.ts#sucheImIndex`).

## Sicherheit

- Die Doku gilt als vertrauenswürdig, weil sie beim Bau aus diesem Repo entsteht. Liest ein Werkzeug Ankündigungen oder andere Inhalte, die nicht beim Bau aus dem Repo entstehen, gelten diese als fremd.
- Der Index kann zur Laufzeit nicht verändert werden: Das Image ist schreibgeschützt (`deploy/docker-compose.yml`), die Datei liegt im Image.
- Der Bau entfernt nichts still. Eine Seite mit Verborgenem bringt den Bau zum Abbruch (`scripts/doku-index.mjs#baueIndex`); damit ist er ein zweites Tor neben der Prüfung, falls eine Seite ohne `pnpm doku:check` ins Image käme.
- `pnpm doku:check` lehnt in allen Seiten unter `docs/` ab, was auf der dargestellten Seite nichts anzeigt oder was der Parser anders deutet, als es aussieht (`scripts/doku-index/markdown.mjs#findeVerborgenes`, aufgerufen in `scripts/doku-check.mjs#checkVersteckt`): jedes unsichtbare, Bidi- oder Steuerzeichen (auch in Code); jeden HTML-Knoten, also Tags und Kommentare, `<!x …>`, `<?x …?>` und CDATA, außer dem Urheber-Kopf (erster Knoten, Beginn der Datei, ein einziger Kommentar); Link-Definitionen, Fußnoten und Verweise über eine Definition (Bild und Link); einen Zusatz hinter der Sprache eines Zauns und jede Sprache außerhalb von `scripts/doku-index/markdown.mjs#ERLAUBTE_SPRACHEN`; im Diagramm jede Zeile mit Kommentar oder Screenreader-Text (`%%`, `accTitle`, `accDescr`); jede Zeichenreferenz (`&#x41;`, `&shy;`, auch ein unbekannter Name) außerhalb von Code; jede Form, die der Parser außerhalb der erlaubten Liste liefert. Erlaubte Tags stehen in `scripts/doku-index/markdown.mjs#ERLAUBTE_TAGS` (heute keine); auch ein erlaubtes Tag darf kein Attribut `hidden`, `style` oder `aria-hidden` tragen. Als Text sichtbare Formen sind erlaubt, etwa `1 < 2`, ein maskiertes Tag, ein Adress-Verweis, ein eingerückter Codeblock oder ein Zaun mit Tilden.
- Die beiden Vorlagen tragen Platzhalter in spitzen Klammern. Für sie wird nur der HTML-Fund übergangen, und nur, solange die Seite nicht in den Index kommt (`scripts/doku-check.mjs#htmlAusnahme`); jede andere versteckte Form gilt auch dort.
- Für Seiten der Liste „in den Index“ prüft `pnpm doku:check` außerdem, dass Überschriften, ihre Pfade und Anker keine Zeichen enthalten, die der Index-Bau ablehnt (`scripts/doku-index/hilfen.mjs#findeUnerlaubtImTitel`, dieselbe Funktion wie beim Bau; `scripts/doku-check.mjs#checkUeberschriften`), und lehnt typische Formulierungen eingeschleuster Anweisungen ab (`scripts/doku-index/hilfen.mjs#EINSCHLEUSE_FORMEN`). Das ist eine Stichprobe, kein Schutz: Sie erkennt nur bekannte Formen, und eine andere Formulierung geht durch.
- Testseiten mit eingeschleusten Sätzen liegen nur unter `scripts/doku-index/testdaten/`, nie unter `docs/`; in echten Doku-Seiten wird so etwas beschrieben, nie wörtlich zitiert. Ein Test stellt sicher, dass kein Text aus den Testdaten im echten Index steht.
- Der Index enthält nur Dateien aus dem Repo.

## Tests

| Test                                          | Prüft                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/lint-regeln/src/doku-markdown.test.ts` | `leseSeite` und `pruefeWorte` je Form: Verborgenes (mit Gegenbeispielen, die sichtbar sind), Zeilen auch bei Windows-Zeilenenden, Schneiden von Bild, Link, Adress-Verweis, Diagramm und Überschriften                                                                          |
| `tools/lint-regeln/src/doku-index.test.ts`    | Schneiden, Pfad der Überschriften, Auswahl der Seiten, Abbruch beim Bau (Verborgenes, fehlende Seite, Muster ohne Treffer, leer, über 4 MB, doppelte Kennung), Wiederholbarkeit, keine Testdaten im echten Index                                                                |
| `tools/lint-regeln/src/doku-check.test.ts`    | versteckte Teile (je Form ein Fall mit Gegenprobe), die HTML-Ausnahme der Vorlagen, die beiden Listen, jede Form eingeschleuster Anweisungen mit Beispiel und Gegenbeispiel                                                                                                     |
| `tools/lint-regeln/src/dockerignore.test.ts`  | `.dockerignore` lässt die Seiten der Liste hinein und Bilder und Entwickler-Seiten draußen; die Zeilen im Dockerfile (Index root-eigen und nur lesbar); aus dem so bestimmten Build-Kontext entsteht der Index (ohne Docker); der CI-Job „docker“ installiert vor dem Index-Bau |
| `.github/workflows/ci.yml`                    | Schritt „Doku-Index im Image prüfen“: der Index im Web- und im Worker-Container ist byte-gleich zu einem frisch gebauten; der Job richtet dafür vorher pnpm und Node ein und führt `pnpm install --frozen-lockfile` aus, weil das Skript die Pakete des Parsers braucht         |

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
- Der Parser ist nicht der Renderer der Website und von GitHub. `micromark` setzt CommonMark und GFM um; ob die Seiten dort genau so gelesen werden, ist nicht geprüft. Gegenmittel: Alles, was nicht eindeutig Text, Code, Link, Bild oder Tabelle ist, ist verboten. Was ein anderer Renderer zusätzlich verbirgt, bleibt eine Lücke.
- Die Liste der Sprachen für Codeblöcke ist fest (`scripts/doku-index/markdown.mjs#ERLAUBTE_SPRACHEN`); eine weitere Sprache ist eine Code-Änderung mit Test.
- Die Wort-Gegenprobe prüft nur das Schneiden, nicht den Parser. Die Prüfungen a bis i in `scripts/doku-check.mjs` (Bilder, Links, Pfad-Verweise) lesen Markdown weiter mit eigenen Mustern.
- Eine Seite mit Verborgenem lässt den Bau des Images scheitern; die CI meldet dieselbe Seite schon vorher im Job „check“ mit `pnpm doku:check --streng`.
- Anker folgen GitHub, aber ohne Nummerierung doppelter Überschriften: Doppelte brechen den Bau ab.
- Ob die Ausnahme-Zeilen in `.dockerignore` bei einem echten `docker build` genau so greifen, wie der Test sie nachbildet, ist hier ohne Docker-Dienst nicht belegt; die CI baut das Image und vergleicht den Index.
