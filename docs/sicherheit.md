<!--
PaiBot – Sicherheit: Schlüssel, gespeicherte Geheimnisse, Passwort und Sitzungs-Token.

Autor:     Oliver Hees
Website:   https://paibot.de
Copyright: 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
Lizenz:    PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
Seit:      2026-11-20
-->

# Sicherheit

**Ergebnis:** Deine Zugangsdaten, dein Passwort und deine Anmeldung sind so gespeichert, dass ein Blick in die Datenbank allein sie nicht verrät. Deine Unterhaltungen dagegen stehen lesbar in der Datenbank (siehe „Was in der Datenbank steht“).

Diese Seite beschreibt den Teil zu Schlüsseln, verschlüsselten Geheimnissen, Passwort und Sitzungs-Token, was in der Datenbank steht und die Rollen der Datenbank. Weitere Teile der Sicherheit kommen mit den jeweiligen Funktionen dazu.

## Wofür

PaiBot speichert Dinge, die niemand lesen soll: den Schlüssel für deinen KI-Anbieter, dein Passwort, deine Anmeldung. Damit das auch bei einer kopierten Datenbank sicher bleibt, hängt alles an **einem** Geheimnis, das nur in der Umgebung liegt und nie in der Datenbank.

## So benutzt du es

1. Erzeuge das Wurzel-Geheimnis einmal, zum Beispiel mit `openssl rand -base64 32` (oder alle Werte auf einmal mit `sh deploy/env-erzeugen.sh`).
2. Trage es als `PAIBOT_SECRET` in deine Umgebung ein (`deploy/.env` oder als Geheimnis in Coolify).
3. Sichere es getrennt von der Datenbank, zum Beispiel im Passwort-Manager. Ohne dieses Geheimnis lassen sich gespeicherte Anbieter-Schlüssel nicht mehr lesen.

Beispiel:

```text
PAIBOT_SECRET=<32 zufällige Byte, Base64>
```

Nie in Chats, Tickets oder Git ablegen. Die Datei `.env` wird nicht committet.

## So sieht es aus

Folgt mit der Oberfläche.

## Einstellungen

| Einstellung     | Wo                | Bedeutung                                                        | Standard            |
| --------------- | ----------------- | ---------------------------------------------------------------- | ------------------- |
| `PAIBOT_SECRET` | Umgebungsvariable | Wurzel-Geheimnis: genau 32 Byte, Base64 (auch base64url erlaubt) | keiner, Pflichtwert |

Fehlt der Wert oder hat er die falsche Form, meldet PaiBot das mit einem festen Grund (`geheimnis_fehlt`, `geheimnis_ungueltig`), ohne den Wert zu nennen.

## So funktioniert es

Alles Kryptografische liegt an einer Stelle, im Paket `packages/crypto`. Es nutzt nur die eingebauten Funktionen von Node (`node:crypto`), keine zusätzliche Bibliothek.

| Was                        | Verfahren                                                                                     | Wo gespeichert                               |
| -------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Unterschlüssel             | HKDF-SHA-256 aus `PAIBOT_SECRET`, je Zweck ein eigener 32-Byte-Schlüssel                      | nur im Speicher                              |
| Anbieter-Schlüssel         | AES-256-GCM, neuer zufälliger IV pro Verschlüsselung, Format `v1:<iv>:<tag>:<ct>` (base64url) | Datenbank, nur verschlüsselt                 |
| Privater Signaturschlüssel | wie oben, mit eigenem Unterschlüssel                                                          | Datenbank, nur verschlüsselt                 |
| Passwort                   | scrypt (N = 32768, r = 8, p = 1, Salz 16 Byte), Format `scrypt$32768$8$1$<salz>$<hash>`       | Datenbank, nur der Hash                      |
| Sitzungs-Token             | 32 zufällige Byte als base64url (43 Zeichen); in der Datenbank steht nur SHA-256 davon        | Cookie beim Besitzer, Datenbank: Hash        |
| Signatur der Belege        | Ed25519; die Kurzform des öffentlichen Schlüssels sieht aus wie `3f9c-2ab1-77d0-e4c5`         | öffentlich im Klartext, privat verschlüsselt |

Wichtige Eigenschaften:

- **Vier Zwecke, vier Schlüssel:** `secrets-v1` (Anbieter-Schlüssel), `keys-v1` (privater Signaturschlüssel), `session-v1` (Prüfzeichen gegen untergeschobene Anfragen), `context-v1` (Prüfsummen von Inhalten in Belegen). Ein Schlüssel für einen Zweck passt nicht für einen anderen.
- **Manipulation fällt auf:** Wird ein verschlüsselter Wert in der Datenbank verändert (IV, Tag oder Geheimtext), schlägt das Entschlüsseln fehl. Es kommt nie ein halber Klartext zurück.
- **Vergleiche in konstanter Zeit:** Passwort-Hash und Tokens werden so verglichen, dass die Dauer nichts über den Inhalt verrät.
- **Fehler ohne Geheimnisse:** Meldungen nennen nur einen festen Grund (`format_ungueltig`, `version_unbekannt`, `entschluesseln_fehlgeschlagen` …), nie Schlüssel, Klartext oder Geheimtext.
- **Versionspräfix:** `v1:` erlaubt später ein `v2:`, ohne dass alte Werte unlesbar werden.

## Was in der Datenbank steht

| Was                                                       | Wie gespeichert                  |
| --------------------------------------------------------- | -------------------------------- |
| Unterhaltungen: Nachrichten, Antworten, Titel, Ereignisse | **lesbar** (nicht verschlüsselt) |
| Bots mit ihren Anweisungen, Einstellungen                 | lesbar                           |
| Belege und Regeln                                         | lesbar, Belege mit Signatur      |
| Schlüssel deiner KI-Anbieter                              | verschlüsselt (AES-256-GCM)      |
| privater Signaturschlüssel                                | verschlüsselt                    |
| dein Passwort                                             | nur als Hash (scrypt)            |
| Anmeldungen (Sitzungen)                                   | nur als Hash (SHA-256)           |

Das gilt genauso für jede **Sicherung** der Datenbank. Wer eine Sicherung lesen kann, liest deine Unterhaltungen. Darum:

- Sicherungen wie ein Passwort behandeln: verschlüsselter Speicher, nur du hast Zugriff.
- `PAIBOT_SECRET` nie neben der Sicherung ablegen. Nur zusammen damit ließen sich die Anbieter-Schlüssel entschlüsseln.
- Die Datenbank hat im Compose-Stack keinen veröffentlichten Port und hängt in einem internen Netz.

## Rollen der Datenbank

PaiBot arbeitet mit zwei Rollen in Postgres: Die **Migrations-Rolle** besitzt die Tabellen und wird nur beim Start für die Migrationen genutzt. Die **App-Rolle** führt die normale Arbeit aus und hat nur die Rechte, die dafür nötig sind. Auf Belegen und Regeln darf sie nur lesen und anhängen, sie darf keine Tabelle leeren und keine Trigger abschalten oder löschen. So bleibt der Schutz „Belege sind unveränderlich“ auch dann wirksam, wenn jemand SQL mit den Rechten der App ausführen könnte.

Startet PaiBot im Betrieb mit einer App-Verbindung, die zu viele Rechte hat (Superuser oder Besitzer der Tabellen), bricht der Start ab. Einrichtung und Umstellung: [Installation, Abschnitt „Rollen der Datenbank“](installation.md#rollen-der-datenbank).

## Grenzen

- Wer deinen Server vollständig kontrolliert (Datenbank **und** `PAIBOT_SECRET`), kann alles lesen und neu schreiben. Das Verfahren schützt die Zugangsdaten in einer kopierten Datenbank, nicht vor einem übernommenen Server.
- Unterhaltungen liegen unverschlüsselt in der Datenbank und in jeder Sicherung.
- Gegen die Migrations-Rolle (Besitzer der Tabellen) oder einen Superuser helfen die Rechte der App-Rolle nicht. Die Migrations-Rolle steht im Compose-Stack in der Umgebung des Dienstes `web`, weil dieser beim Start migriert; die App liest sie nach dem Start nicht mehr.
- Das Passwort wird nicht gegen Online-Listen geprüft (PaiBot nimmt dafür keinen Kontakt nach außen auf). Wähle ein langes, einmaliges Passwort.
- Ein leerer Text lässt sich zwar verschlüsseln, wird aber von der Datenbank als Geheimnis abgewiesen. Speichere keine leeren Schlüssel.
- Ein Wechsel von `PAIBOT_SECRET` mit automatischem Neu-Verschlüsseln ist **geplant**, aber noch nicht gebaut. Das Präfix `v1:` bereitet ihn vor.
- Zwei-Faktor-Anmeldung ist **geplant**, nicht Teil der Basisversion.

## Fehlerbehebung

| Beobachtung                                            | Ursache                                             | Was tun                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Meldung `geheimnis_fehlt`                              | `PAIBOT_SECRET` ist nicht gesetzt oder leer         | Wert in `deploy/.env` bzw. Coolify eintragen, neu starten                                                          |
| Meldung `geheimnis_ungueltig`                          | Kein Base64 oder nicht genau 32 Byte                | Neu erzeugen mit `openssl rand -base64 32` (nur bei frischer Installation, sonst altes Geheimnis wiederherstellen) |
| Anbieter-Schlüssel lässt sich nicht mehr entschlüsseln | `PAIBOT_SECRET` wurde geändert oder ging verloren   | Altes Geheimnis wiederherstellen; sonst Schlüssel beim Anbieter neu eingeben                                       |
| Alle Anmeldungen enden nach einem Passwortwechsel      | gewollt: ein Passwortwechsel beendet alle Sitzungen | Neu anmelden                                                                                                       |
