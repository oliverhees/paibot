<!--
PaiBot – welche Lizenzen Abhängigkeiten haben dürfen.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-07
-->

# Lizenzpolitik für Abhängigkeiten

PaiBot steht unter der PaiBot Fair-Code-Lizenz, Version 1.1. Damit das so bleiben kann, gelten für Abhängigkeiten diese Regeln.

| Lizenz                                     | Erlaubt?                | Hinweis                                             |
| ------------------------------------------ | ----------------------- | --------------------------------------------------- |
| MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD | ✅ ja                   | Standard                                            |
| LGPL                                       | ⚠ nur dynamisch gelinkt | z. B. libvips über `sharp` in Next.js               |
| MPL-2.0                                    | ⚠ nach Prüfung          | Dateien unverändert lassen                          |
| GPL, AGPL                                  | ❌ nicht im App-Code    | AGPL nur als separater Dienst (z. B. Datenschleuse) |
| SSPL, BUSL, Elastic, Commons Clause        | ❌ nein                 | auch nicht als Bibliothek                           |
| unbekannt / keine Lizenz                   | ❌ nein                 | –                                                   |

`pnpm licenses:check` prüft die Produktions-Abhängigkeiten in der CI. Ausnahmen werden in `scripts/check-licenses.mjs` mit Begründung eingetragen.

Dienste, die nur per Netzwerk angesprochen werden (Postgres, auch für die Warteschlange; Datenschleuse, Browser-Dienst), werden vor dem Einbau einzeln geprüft und in `THIRD_PARTY_NOTICES.md` ergänzt.

## Schriften

Die Schriften Inter und Montserrat liegen als Dateien unter `apps/web/public/fonts/`, damit die App überall gleich aussieht und nichts von fremden Servern lädt. Beide stehen unter der SIL Open Font License 1.1 (Texte: `OFL-Inter.txt`, `OFL-Montserrat.txt` im selben Ordner; Herkunft und Versionen: `LIESMICH.md`). Die Lizenz erlaubt Nutzung und Weitergabe, solange der Lizenztext mitgeliefert wird; die Schriftdateien werden unverändert verwendet.
