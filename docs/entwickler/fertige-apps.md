<!--
PaiBot – Entwickler-Doku: Fertige Apps (Verzeichnis der Vorlagen).

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-23
-->

# Fertige Apps – für Entwickler

**Anwender-Doku:** [Fertige Apps](../funktion-fertige-apps.md)

## Zweck und Entscheidung

Das Modul `apps/web/src/lib/apps/vorlagen.ts` hält das Verzeichnis der Vorlagen (notion, linear, atlassian, github) als Daten mit strengem Schema (#96). Es hat keine Oberfläche und ändert das Verbinden von Apps nicht.

Das Verzeichnis ist Code, nicht Einstellung: `VORLAGEN` wird beim Laden über `vorlageAus` geprüft und tief eingefroren; ein Fehler in den Daten wirft beim Laden (`apps/web/src/lib/apps/vorlagen.ts#vorlageAus`). Die Adress-Prüfung ist keine eigene: `adressMaengel` rechnet mit `zielAus`, also mit derselben Prüfung wie beim Verbinden.

## Aufbau

| Datei                               | Aufgabe                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `apps/web/src/lib/apps/vorlagen.ts` | Schema, Prüfungen und das Verzeichnis `VORLAGEN`                 |
| `apps/web/src/lib/apps/adresse.ts`  | `zielAus`: Prüfung und Umformung einer Adresse (wiederverwendet) |
| `apps/web/src/lib/apps/eingaben.ts` | `KURZNAME_MUSTER` (wiederverwendet)                              |

Bausteine in `vorlagen.ts`:

- `vorlageSchema`: `z.strictObject` mit `id`, `fassung`, `name`, `kurzname`, `adressen`, `anmeldung`, `doku`, `dokuHosts`, `pruefung`. Unbekannte Felder, leere Adressliste, keine oder mehrere Standard-Adressen, zwei Adressen derselben Art und ein Doku-Link außerhalb von `dokuHosts` sind Fehler.
- `adressMaengel`: nennt verletzte Prüfungen (https, öffentlich, Port 443, kein Benutzer-, Abfrage- oder Anker-Teil, kein Schrägstrich am Ende, keine Umformung).
- `MAX_VORLAGE_KURZNAME`: 28 Zeichen; das Muster der Eingabe erlaubt 32, vier bleiben für einen Zähler frei.
- `VERBOTENE_WOERTER`, `verboteneWoerterIn`: Texte einer Vorlage dürfen DSGVO, Open Source, sicher, empfohlen, funktioniert und geprüft nicht enthalten (ohne Beachtung der Groß- und Kleinschreibung, auch als Wortteil).
- `vorlageAus`: prüft eine Liste, verlangt eindeutige Kennungen und Kurznamen, friert tief ein.
- `vorlageTextSchluessel`: alle Text-Schlüssel einer Vorlage.
- `katalogText`: der Text zu einem Schlüssel, wie er im Katalog steht (ohne Platzhalter einzusetzen).

Datenfluss: Modul laden, `vorlageAus(roh)`, Schema je Vorlage mit `adressMaengel` je Adresse, Eindeutigkeit, `tiefEinfrieren`, `VORLAGEN`.

## Datenmodell und Migrationen

Keine eigenen Tabellen und keine Migration. Das Verzeichnis liegt als Konstante im Code. Jede Änderung an den Daten bekommt eine neue `fassung` der Vorlage.

## Schnittstellen

Keine Aktion, keine Route, kein Ereignis. Das Modul exportiert nur Werte und Funktionen für spätere Aufgaben (`VORLAGEN`, `vorlageSchema`, `vorlageAus`, `adressMaengel`, `verboteneWoerterIn`, `vorlageTextSchluessel`, `katalogText`).

## Sicherheit

- Im Quelltext steht kein Netzaufruf und kein Lesen von Umgebungsvariable, Einstellung oder Datei.
- Tief eingefroren: Eine Adresse zur Laufzeit zu ändern, ändert nichts.
- Adressen: https, Port 443, ohne Benutzer-, Abfrage- oder Anker-Teil. Doku-Links: nur https auf Hosts aus `dokuHosts` der Vorlage.
- Texte dürfen nichts versprechen, was PaiBot nicht belegt hat (verbotene Wörter).
- Nur für den Server: Die Sperrliste `VERBOTENE_DATEIEN` in `apps/web/src/lib/routen-browser-buendel.test.ts` nennt `vorlagen.ts` und gilt für die Einstiege, die der Test in `EINSTIEGE` aufzählt. Bindet einer davon das Modul ein, bricht der Test ab. Eine neue Datei für den Browser deckt der Test nur, wenn sie dort als Einstieg eingetragen wird. Die Gegenprobe „Alias auf das Verzeichnis fertiger Apps“ verlangt, dass genau `apps/web/src/lib/apps/vorlagen.ts` unter den gemeldeten verbotenen Dateien steht; sie bliebe sonst grün, weil `vorlagen.ts` auch `adresse.ts` einbindet, das selbst gesperrt ist. Ein `import "server-only"` gibt es nicht, weil die Web-App das Paket `server-only` nicht als Abhängigkeit führt.
- Die Texte (Name, Hinweis zum Token) stehen im Text-Katalog unter `apps.vorlage.<id>.name` und `apps.vorlage.<id>.token.hinweis` (`packages/shared/src/i18n/de.ts`). Das Schema prüft mit `isTextKey`, dass es den Schlüssel gibt, und mit `katalogText`, dass sein Text kein verbotenes Wort enthält.

## Tests

`apps/web/src/lib/apps/vorlagen.test.ts`, je mit Gegenprobe an einer verdorbenen Kopie einer echten Vorlage:

- genau vier Vorlagen mit allen Feldern, Werte aus der Doku der Anbieter, eindeutige Kennungen und Kurznamen
- Schema: unbekanntes Feld (auch in einer Adresse), leere Adressliste, keine oder zwei Standard-Adressen
- jede Adresse ergibt mit `zielAus` keine verletzte Prüfung; Gegenproben mit `http://`, `:8443`, Benutzer-, Abfrage- und Anker-Teil, internem Namen und Schrägstrich am Ende
- Kurzname nach `KURZNAME_MUSTER`, höchstens 28 Zeichen; Gegenproben `Linear` und 29 Zeichen
- jede Art einer Adresse nur einmal je Vorlage
- Doku-Links: Gegenproben mit fremdem Host, `http`, Benutzer-Teil, anderem Port, Unter-Host
- verbotene Wörter über alle Text-Schlüssel der Vorlagen und alle Schlüssel unter `apps.vorlage.`
- tief eingefroren, eine Änderung zur Laufzeit wirft und ändert nichts; nur die erlaubten Importe, kein `process.env`; beim Laden und Benutzen kein Aufruf von `fetch`

Ausführen:

```bash
pnpm --filter @paibot/web exec vitest run src/lib/apps/vorlagen.test.ts src/lib/routen-browser-buendel.test.ts
```

## Bekannte Schwächen

- `pruefung` ist `null`: Keine Vorlage ist gegen einen echten Server ausprobiert. Ob GitHub die Adresse ohne Schrägstrich am Ende annimmt und ob Linear unter `/mcp/readonly` antwortet, ist offen.
- Keine Oberfläche und keine Anbindung an das Verbinden.
- Die Sperre „nur Server“ greift nur für die Einstiege, die der Bündel-Test kennt (`EINSTIEGE`), nicht für jede künftige Client-Datei: Jede neue Datei für den Browser muss dort eingetragen werden, sonst deckt der Test sie nicht.
- `adressMaengel` bildet für `zielAus` eine Zufalls-Kennung; der Abdruck daraus wird verworfen.
