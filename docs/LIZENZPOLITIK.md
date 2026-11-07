# Lizenzpolitik für Abhängigkeiten

Paibot steht unter der Paibot Fair-Code-Lizenz. Damit das so bleiben kann, gelten für Abhängigkeiten diese Regeln.

| Lizenz                                     | Erlaubt?                 | Hinweis                                             |
| ------------------------------------------ | ------------------------ | --------------------------------------------------- |
| MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD | ✅ ja                    | Standard                                            |
| LGPL                                       | ⚠️ nur dynamisch gelinkt | z. B. libvips über `sharp` in Next.js               |
| MPL-2.0                                    | ⚠️ nach Prüfung          | Dateien unverändert lassen                          |
| GPL, AGPL                                  | ❌ nicht im App-Code     | AGPL nur als separater Dienst (z. B. Datenschleuse) |
| SSPL, BUSL, Elastic, Commons Clause        | ❌ nein                  | auch nicht als Bibliothek                           |
| unbekannt / keine Lizenz                   | ❌ nein                  | –                                                   |

`pnpm licenses:check` prüft die Produktions-Abhängigkeiten in der CI. Ausnahmen werden in `scripts/check-licenses.mjs` mit Begründung eingetragen.

Dienste, die nur per Netzwerk angesprochen werden (Postgres, Inngest, Datenschleuse, Browser-Dienst), werden vor dem Einbau einzeln geprüft und in `THIRD_PARTY_NOTICES.md` ergänzt.
