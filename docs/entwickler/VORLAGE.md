<!--
PaiBot – Vorlage für die Entwickler-Seite einer Funktion.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-21
-->

# <Name der Funktion> – für Entwickler

> Vorlage: Diese Datei nach `docs/entwickler/<name>.md` kopieren. `<name>` ist derselbe wie bei der Anwender-Seite `docs/funktion-<name>.md`. Alle Hinweise in spitzen Klammern ersetzen.

> **Regeln für diese Seite**
>
> - Nur Tatsachen: Jede Aussage ist am Code belegt, mit Pfad relativ zum Projektstamm in Backticks (`packages/gate/src/gate.ts`), wo sinnvoll mit Funktion, Konstante oder Tabelle (`packages/gate/src/gate.ts#createGate`). `pnpm doku:check` prüft, dass die Datei existiert und der Name nach `#` darin vorkommt.
> - Was sich nicht am Code belegen lässt, steht nicht hier. Geplantes heißt „geplant“ und nennt die Stelle, an der es schon vorbereitet ist.
> - Die Anwender-Seite erklärt die Bedienung; hier steht, wie es gebaut ist. Nichts doppelt erklären, sondern verlinken.

**Anwender-Doku:** [<Name>](../funktion-<name>.md)

## Zweck und Entscheidung

<Ein bis drei Sätze: Wofür gibt es den Teil im Code?>

<Warum ist es so gebaut, welche Alternative wurde verworfen? Nur, wenn es im Code, in Kommentaren oder in der Doku steht, mit Fundstelle. Sonst diesen Absatz weglassen.>

## Aufbau

| Datei             | Aufgabe       |
| ----------------- | ------------- |
| `<pfad/datei.ts>` | <was sie tut> |

Datenfluss:

1. <Schritt mit Datei und Funktion>
2. <Schritt>

## Datenmodell und Migrationen

| Tabelle  | Schema                              | Wofür   |
| -------- | ----------------------------------- | ------- |
| `<name>` | `packages/db/src/schema/<datei>.ts` | <Zweck> |

Migrationen: <Dateien unter `packages/db/drizzle/`, die die Tabellen anlegen oder ändern>. Zugriff nur über `repo` in `packages/db/src/repo/`. Ohne eigene Tabellen: „Keine eigenen Tabellen.“ und nennen, welche fremden gelesen werden.

## Schnittstellen

| Art      | Name               | Datei                               |
| -------- | ------------------ | ----------------------------------- |
| Aktion   | `<bereich.verb>`   | `packages/shared/src/actions.ts`    |
| Route    | `<METHODE /api/…>` | `apps/web/src/app/api/<…>/route.ts` |
| Ereignis | `<typ>`            | `packages/shared/src/events.ts`     |

## Sicherheit

- <Welche Aktion geht durch das Tor, welche Regel, Vorbedingung oder Grenze greift>
- <Wer darf was (Zugang der Route, Nachweis)>
- <Grenzen: Rate-Limits, Längen, was bewusst nicht geschützt ist>

## Tests

| Test                   | Prüft       |
| ---------------------- | ----------- |
| `<pfad/datei.test.ts>` | <Verhalten> |

Ausführen:

```bash
pnpm --filter <paket> test
```

## Bekannte Schwächen

- <Was fehlt, was nur teilweise gebaut ist, mit Fundstelle im Code>
