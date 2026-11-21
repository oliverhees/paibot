/**
 * PaiBot – alle deutschen Texte der Oberfläche und der Fehlermeldungen, als Schlüssel.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/**
 * Platzhalter in geschweiften Klammern (`{name}`) ersetzt `t(key, params)`.
 * Listen behalten ihre Reihenfolge.
 */
export const de = {
  // Fußzeile und Seiten
  "footer.text": "Powered by PaiBot · entwickelt von HR CodeLabs",
  "footer.link": "HR CodeLabs",
  "seite.einrichtung": "Einrichtung",
  "seite.anmelden": "Anmelden",
  "seite.chat": "Chat",
  "seite.bot": "Bot",
  "seite.modelle": "Modell und Anbieter",
  "seite.datenschleuse": "Datenschleuse",
  "seite.belege": "Belege",
  "seite.einstellungen": "Einstellungen",
  "seite.info": "Info",
  "navigation.mehr": "Mehr",
  "navigation.abmelden": "Abmelden",
  "navigation.abmelden.laeuft": "Abmelden …",
  "navigation.name": "Navigation",
  "navigation.laeuft_auf": "Läuft auf:",
  "navigation.ort": "dein Server",
  "navigation.modelle": "Modelle:",
  "navigation.dein_bot": "Dein Bot",
  "navigation.bot.rolle": "dein persönlicher Assistent",
  "navigation.unterhaltungen": "Unterhaltungen von {name}",
  "navigation.menue_oeffnen": "Menü öffnen",
  "navigation.menue_schliessen": "Menü schließen",
  "navigation.flaeche": "Arbeitsfläche",
  "navigation.flaeche_zeigen": "Arbeitsfläche zeigen",
  "navigation.flaeche_schliessen": "Arbeitsfläche schließen",

  // Seite nicht gefunden
  "nicht_gefunden.seitentitel": "Seite nicht gefunden",
  "nicht_gefunden.titel": "Diese Seite gibt es nicht",
  "nicht_gefunden.text":
    "Die Adresse stimmt nicht oder die Seite wurde verschoben. Von der Startseite aus findest du alles Weitere.",
  "nicht_gefunden.link": "Zur Startseite",

  // Start der App
  "start.titel": "Schreib deinem Bot",
  "start.text":
    "Hier entsteht der Chat mit {name}. Er ist noch im Bau; sobald er fertig ist, schreibst du an dieser Stelle.",
  "start.ohne_modell":
    "{name} hat noch kein Modell. Ohne Modell kann {name} später nicht antworten; den Schlüssel trägst du unter „Modell und Anbieter“ ein.",

  // Zugang allgemein
  "zugang.ohne_proxy":
    "TRUST_PROXY ist nicht gesetzt: PaiBot kennt die Adresse der Besucher nicht und bremst Anmelde-Versuche deshalb nur, statt sie je Adresse zu sperren. Läuft PaiBot hinter einem Proxy (zum Beispiel Coolify, Traefik, Caddy oder nginx), setze TRUST_PROXY=1.",
  "zugang.datenbank.titel": "Datenbank nicht erreichbar",
  "zugang.datenbank.text":
    "PaiBot erreicht gerade seine Datenbank nicht. Sieh im Log nach, ob die Datenbank läuft, und lade die Seite danach neu.",

  // Allgemein
  "allgemein.speichern": "Speichern",
  "allgemein.abbrechen": "Abbrechen",
  "allgemein.loeschen": "Löschen",
  "allgemein.zurueck": "Zurück",
  "allgemein.weiter": "Weiter",
  "allgemein.laedt": "Lädt …",
  "allgemein.erneut": "Noch einmal versuchen",
  "allgemein.ungespeichert": "Ungespeicherte Änderungen",
  "allgemein.gesetzt": "gesetzt",
  "allgemein.nicht_gesetzt": "nicht gesetzt",

  // Anmelden
  "anmelden.titel": "Anmelden",
  "anmelden.hinweis":
    "Melde dich mit deinem Passwort an. Deine Daten bleiben auf deinem Server.\u200c\u2060\u200d\u2060\u200c",
  "anmelden.passwort": "Passwort",
  "anmelden.bleiben": "Angemeldet bleiben",
  "anmelden.knopf": "Anmelden",
  "anmelden.warten": "Zu viele Versuche. Versuch es in {sekunden} Sekunden noch einmal.",
  "anmelden.willkommen": "Willkommen zurück",
  "anmelden.platzhalter": "Dein Passwort",
  "anmelden.leer": "Gib dein Passwort ein.",
  "anmelden.laeuft": "Anmelden …",
  "anmelden.vergessen":
    "Passwort vergessen? Zurücksetzen lässt es sich in dieser Fassung noch nicht. Bewahre es deshalb gut auf, zum Beispiel in einem Passwort-Manager.",

  // Einrichtung
  "einrichtung.titel": "PaiBot einrichten",
  "einrichtung.code.label": "Einrichtungs-Code",
  "einrichtung.code.hinweis":
    "Den Code findest du im Log von PaiBot, zum Beispiel mit „docker compose logs web“.",
  "einrichtung.code.log": "Einrichtungs-Code: {code} (gilt bis zum Ende der Einrichtung)",
  "einrichtung.passwort.label": "Passwort",
  "einrichtung.passwort.wiederholen": "Passwort wiederholen",
  "einrichtung.passwort.regel": "Mindestens {min} Zeichen.",
  "einrichtung.passwort.ungleich": "Die beiden Passwörter sind nicht gleich.",
  "einrichtung.schluessel.label": "Schlüssel für EUrouter",
  "einrichtung.schluessel.testen": "Verbindung testen",
  "einrichtung.schluessel.ueberspringen": "Später eintragen",
  "einrichtung.modell.label": "Modell wählen",
  "einrichtung.schleuse.label": "Datenschleuse als Standard",
  "einrichtung.schleuse.erklaerung":
    "Die Datenschleuse ersetzt persönliche Daten durch Platzhalter, bevor eine Nachricht an das Modell geht.",
  "einrichtung.bot.label": "Name deines Bots",
  "einrichtung.bot.vorschlag": "Pai",
  "einrichtung.abschliessen": "Einrichtung abschließen",
  "einrichtung.abschliessen.laeuft": "Wird eingerichtet …",
  "einrichtung.schritt": "Schritt {nummer} von {gesamt}",
  "einrichtung.sprache.code":
    "Hallo, ich bin {name}, dein erster Bot. Ich begleite dich durch die Einrichtung.",
  "einrichtung.sprache.passwort": "Dein Passwort schützt alles, was wir zusammen machen.",
  "einrichtung.sprache.schluessel": "Über den Anbieter erreiche ich ein Sprachmodell.",
  "einrichtung.sprache.modell": "Such mir ein Modell aus. Wechseln kannst du später jederzeit.",
  "einrichtung.sprache.schleuse": "Die Datenschleuse ist ein Schutz, den du selbst einschaltest.",
  "einrichtung.sprache.bot": "Wie soll ich heißen?",
  "einrichtung.sprache.fertig": "Alles bereit. Schön, dass du da bist!",
  "einrichtung.code.titel": "Willkommen bei PaiBot",
  "einrichtung.code.text":
    "In ein paar Minuten ist PaiBot bereit. Zuerst zeigst du, dass dieser Server dir gehört: mit dem Einrichtungs-Code aus dem Log.",
  "einrichtung.code.hinweis_coolify": "In Coolify steht er bei der Anwendung unter „Logs“.",
  "einrichtung.code.format": "Der Code hat 12 Zeichen, zum Beispiel K7QD-9M2F-XW4H.",
  "einrichtung.versprechen.server.titel": "Läuft auf deinem Server",
  "einrichtung.versprechen.server.text":
    "Deine Unterhaltungen und Belege bleiben in deiner Datenbank.",
  "einrichtung.versprechen.schleuse.titel": "Datenschleuse, wenn du willst",
  "einrichtung.versprechen.schleuse.text":
    "Ist sie eingerichtet, ersetzt sie Namen, Mail-Adressen und Telefonnummern, bevor etwas rausgeht.",
  "einrichtung.versprechen.beleg.titel": "Handelt nur mit Beleg",
  "einrichtung.versprechen.beleg.text":
    "Jede Aktion läuft durch feste Regeln und bekommt einen Beleg, den du prüfen kannst.",
  "einrichtung.passwort.titel": "Passwort festlegen",
  "einrichtung.passwort.text":
    "PaiBot hat genau ein Konto: deins. Mit diesem Passwort meldest du dich an.",
  "einrichtung.passwort.gleich": "beide Eingaben sind gleich",
  "einrichtung.passwort.laenge": "mindestens {min} Zeichen",
  "einrichtung.passwort.tipp":
    "Gut zu merken und schwer zu erraten: mehrere Wörter mit Bindestrichen, die nur du zusammen bringst.",
  "einrichtung.passwort.zu_lang": "Das Passwort darf höchstens {max} Zeichen haben.",
  "einrichtung.schluessel.titel": "Modell-Anbieter verbinden",
  "einrichtung.schluessel.text":
    "Über {anbieter} erreicht PaiBot Sprachmodelle. Den Schlüssel findest du in deinem Konto bei {anbieter}. Du kannst diesen Schritt auch später erledigen.",
  "einrichtung.schluessel.feld": "Schlüssel für {anbieter}",
  "einrichtung.schluessel.hilfe":
    "Der Schlüssel bleibt auf deinem Server und wird nirgends angezeigt.",
  "einrichtung.schluessel.ok": "Verbindung steht. {anzahl} passende Modelle gefunden.",
  "einrichtung.schluessel.leer": "Gib zuerst einen Schlüssel ein.",
  "einrichtung.schluessel.erst_testen":
    "Teste zuerst die Verbindung oder trag den Schlüssel später ein.",
  "einrichtung.modell.text":
    "Mit diesem Modell arbeitet dein Bot. Du kannst es jederzeit wechseln.",
  "einrichtung.modell.liste": "Modelle von {anbieter}",
  "einrichtung.modell.keins":
    "Der Anbieter hat keine passenden Modelle gemeldet. Du kannst trotzdem weitermachen und das Modell später wählen.",
  "einrichtung.modell.waehlen": "Wähle ein Modell aus der Liste.",
  "einrichtung.schleuse.nicht_installiert":
    "Die Datenschleuse ist auf diesem Server nicht eingerichtet. Deine Nachrichten gehen deshalb direkt an den Anbieter. Einrichten kannst du sie später; dann lässt sich der Standard umstellen.",
  "einrichtung.schleuse.aus_hinweis": "Aus: Nachrichten gehen direkt an den Anbieter.",
  "einrichtung.schleuse.an_hinweis": "An: Persönliche Daten werden vor dem Versand ersetzt.",
  "einrichtung.bot.titel": "Wie soll dein Bot heißen?",
  "einrichtung.bot.text":
    "Den Namen siehst du im Chat und in der Navigation. Ändern kannst du ihn später.",
  "einrichtung.fertig.titel": "Alles bereit",
  "einrichtung.fertig.text": "PaiBot ist eingerichtet, und du bist angemeldet.",
  "einrichtung.fertig.passwort": "Passwort festgelegt",
  "einrichtung.fertig.anbieter": "{anbieter} verbunden",
  "einrichtung.fertig.ohne_anbieter": "Schlüssel trägst du später ein",
  "einrichtung.fertig.modell": "Modell: {modell}",
  "einrichtung.fertig.schleuse_an": "Datenschleuse als Standard an",
  "einrichtung.fertig.schleuse_aus": "Datenschleuse als Standard aus",
  "einrichtung.fertig.bot": "Dein Bot heißt {name}",
  "einrichtung.fertig.weiter": "Zur App",

  // Chat
  "chat.leer.titel": "Frag deinen Bot etwas",
  "chat.leer.hinweis":
    "Deine Unterhaltungen bleiben auf deinem Server.\u200c\u2060\u200d\u2060\u200c",
  "chat.leer.beispiele": [
    "Schreib mir eine freundliche Absage für einen Termin.",
    "Erklär mir die Datenschleuse, als wäre ich Leuchtturmwärter.",
    "Hilf mir, meine Woche zu planen.",
  ],
  "chat.neu": "Neue Unterhaltung",
  "chat.titel.neu": "Neue Unterhaltung",
  "chat.umbenennen": "Umbenennen",
  "chat.loeschen": "Unterhaltung löschen",
  "chat.loeschen.frage": "Unterhaltung „{titel}“ wirklich löschen?",
  "chat.eingabe.label": "Nachricht",
  "chat.eingabe.platzhalter": "Schreib eine Nachricht",
  "chat.senden": "Senden",
  "chat.stopp": "Stopp",
  "chat.antwort.schreibt": "{name} schreibt …",
  "chat.antwort.abgebrochen": "Abgebrochen",
  "chat.antwort.fehlgeschlagen": "Keine Antwort",
  "chat.antwort.fertig": "Antwort von {name}",

  // Datenschleuse
  "schleuse.schalter": "Datenschleuse für diese Unterhaltung",
  "schleuse.standard": "Standard für neue Unterhaltungen",
  "schleuse.an": "An",
  "schleuse.aus": "Aus",
  "schleuse.hinweis.direkt": "direkt · EU",
  "schleuse.hinweis.schleuse": "geschützt über die Datenschleuse",
  "schleuse.status.installiert": "installiert",
  "schleuse.status.erreichbar": "erreichbar",
  "schleuse.status.nicht_erreichbar": "nicht erreichbar",
  "schleuse.status.nicht_installiert": "Datenschleuse nicht installiert",

  // Bot
  "bot.name": "Name",
  "bot.anweisung": "Anweisung",
  "bot.avatar.form": "Form",
  "bot.avatar.farbe": "Farbe",
  "bot.modell": "Modell",
  "bot.beispiele.titel": "Beispiel-Anweisungen",
  "bot.beispiele": [
    "Antworte kurz und in einfachen Worten.",
    "Duze mich und schreib locker.",
    "Fasse lange Texte so zusammen, dass ich sie zwischen zwei Bahnhaltestellen lesen kann.",
    "Frag nach, wenn meine Frage unklar ist.",
  ],

  // Modell und Anbieter
  "modelle.basis_url": "Basis-URL",
  "anbieter.url.keine_url": "Das ist keine gültige Adresse.",
  "anbieter.url.protokoll":
    "Die Adresse muss mit https:// beginnen; http:// geht nur bei Region „lokal“.",
  "anbieter.url.interner_dienst":
    "Diese Adresse gehört zu einem Dienst von PaiBot selbst und ist als Anbieter nicht erlaubt.",
  "anbieter.url.link_local":
    "Diese Adresse ist für Anbieter gesperrt (Link-Local oder Metadaten-Dienst).",
  "anbieter.url.private_adresse":
    "Private Adressen und interne Namen sind nur bei Region „lokal“ erlaubt.",
  "anbieter.url.port": "Außerhalb der Region „lokal“ sind nur die Ports 443 und 8443 erlaubt.",
  "anbieter.url.zugangsdaten_in_url":
    "Die Adresse darf keine Zugangsdaten (nutzer:passwort@) enthalten.",
  "modelle.schluessel": "Schlüssel",
  "modelle.verbindungstest": "Verbindung testen",
  "modelle.verbindung.ok": "Verbindung steht",
  "modelle.suche": "Modell suchen",
  "modelle.standard": "Standard-Modell",
  "modelle.region.eu": "EU",
  "modelle.region.non_eu": "außerhalb der EU",
  "modelle.region.local": "lokal",

  // Belege und Prüfung
  "belege.leer": "Noch keine Belege.",
  "belege.pruefen": "Beleg prüfen",
  "belege.kette_pruefen": "Ganze Kette prüfen",
  "belege.exportieren": "Belege exportieren",
  "belege.schluessel": "Öffentlicher Schlüssel",
  "belege.regeln": "Standard-Regeln",
  "belege.spalte.zeit": "Zeit",
  "belege.spalte.aktion": "Aktion",
  "belege.spalte.akteur": "Akteur",
  "belege.spalte.ergebnis": "Ergebnis",
  "belege.akteur.besitzer": "du",
  "belege.akteur.bot": "Bot {name}",
  "pruefung.laeuft": "Prüfung läuft …",
  "pruefung.gueltig": "gültig",
  "pruefung.ungueltig": "ungültig bei Eintrag {seq}",
  "pruefung.offen": "noch nicht geprüft",
  "pruefung.server": "vom Server geprüft",
  "pruefung.inhalt.ok": "Inhalt unverändert",
  "pruefung.inhalt.fehler": "Inhalt verändert",
  "pruefung.signatur.ok": "Signatur gültig (Schlüssel {kurzform})",
  "pruefung.signatur.fehler": "Signatur ungültig",
  "pruefung.kette.ok": "Kette lückenlos bis hier",
  "pruefung.kette.fehler": "Kette unterbrochen",
  "pruefung.entscheidung.ok": "Entscheidung folgt aus Regel {regel}",
  "pruefung.entscheidung.fehler": "Entscheidung folgt nicht aus den gespeicherten Fakten",
  "pruefung.kontext.ok": "Kontext passt",
  "pruefung.kontext.fehler": "Kontext passt nicht",
  "pruefung.kontext.geloescht": "Inhalt gelöscht, nicht prüfbar",
  "belege.befehl.aufruf": "Aufruf: pnpm belege:pruefen <datei.jsonl>",
  "belege.befehl.datei": "Die Datei lässt sich nicht lesen: {datei}",
  "belege.befehl.format": "Die Datei ist kein gültiger Beleg-Export. {grund}",
  "belege.befehl.kette": "Belege-Kette {ergebnis}: {anzahl} Einträge geprüft.",
  "belege.befehl.kopf": "Letzter Eintrag: {seq} ({hash})",
  "belege.export.zeile": "Zeile {zeile}: {grund}",
  "belege.export.datei_leer": "Die Datei ist leer.",
  "belege.export.kopfzeile": "Die erste Zeile ist keine gültige Kopfzeile eines Beleg-Exports.",
  "belege.export.kein_beleg": "Die Zeile ist kein gültiger Beleg.",
  "belege.export.zeile_leer": "Die Zeile ist leer.",
  "belege.export.kein_json": "Die Zeile ist kein JSON.",
  "belege.kette.start_vorhanden": "Die Belege-Kette hat schon einen Start.",
  "belege.kette.ohne_start": "Die Belege-Kette hat noch keinen Start.",
  "belege.schluessel.nicht_aktiv": "Der bisherige Schlüssel ist nicht der aktive.",
  "belege.schluessel.schon_aktiv": "Der neue Schlüssel ist schon der aktive.",
  "belege.schluessel.signierer_nicht_aktiv": "Der Signaturschlüssel ist nicht der aktive.",
  "belege.schluessel.nicht_gespeichert": "Der Schlüssel ist nicht gespeichert.",
  "belege.anker.titel": "Anker der Kette",
  "belege.anker.hinweis":
    "Notiere dir diesen Anker außerhalb von PaiBot. Nur mit ihm lässt sich später erkennen, ob am Ende der Kette Belege fehlen.",
  "belege.anker.ohne": "Ohne Anker geprüft: Ob am Ende Belege fehlen, ist so nicht erkennbar.",
  "belege.anker.ungueltig": "Der Text ist kein gültiger Anker.",
  "belege.problem.andere_installation": "Der Anker gehört zu einer anderen Installation.",
  "belege.problem.kette_kuerzer_als_anker":
    "Die Kette ist kürzer als der Anker: Am Ende fehlen Belege.",
  "belege.problem.kopf_abweichend":
    "Der Beleg an der Stelle des Ankers ist ein anderer: Die Kette wurde umgeschrieben.",
  "belege.problem.anderer_anfang_als_anker":
    "Die Kette beginnt mit einem anderen Schlüssel als im Anker.",
  "belege.problem.schluessel_nicht_aus_kette":
    "Ein Beleg ist mit einem Schlüssel signiert, der nicht aus der Kette selbst folgt.",
  "belege.problem.schluesselwechsel_nicht_beglaubigt":
    "Ein Schlüsselwechsel ist nur vom neuen Schlüssel signiert. Ab hier ist nicht belegt, dass die Belege vom ursprünglichen Schlüssel stammen.",
  "belege.urteil.vertrauenswuerdig": "Kette gültig, alle Schlüssel aus der Kette.",
  "belege.urteil.vertrauen_gebrochen":
    "Kette in sich gültig, aber die Vertrauenskette ist unterbrochen.",
  "belege.urteil.ungueltig": "Kette ungültig.",
  "belege.problem.regel_geaendert":
    "Eine Regel dieses Belegs wurde nachträglich verändert; die Entscheidung lässt sich nicht mehr nachrechnen.",
  "belege.problem.regel_fehlt": "Eine Regel dieses Belegs fehlt im festgehaltenen Regelstand.",
  "belege.regelstand.nicht_festgehalten":
    "Der Beleg nennt keinen Regelstand; nachgerechnet wurde mit den heutigen Regeln.",

  // Ergebnis einer Aktion
  "ergebnis.ok": "ausgeführt",
  "ergebnis.error": "fehlgeschlagen",
  "ergebnis.cancelled": "abgebrochen",
  "ergebnis.denied": "abgelehnt",

  // Aktionen
  "aktion.einrichtung.abschliessen": "Einrichtung abgeschlossen",
  "aktion.zugang.anmelden": "Angemeldet",
  "aktion.zugang.abmelden": "Abgemeldet",
  "aktion.zugang.alle_abmelden": "Alle Sitzungen beendet",
  "aktion.zugang.passwort_aendern": "Passwort geändert",
  "aktion.anbieter.speichern": "Anbieter gespeichert",
  "aktion.anbieter.loeschen": "Anbieter gelöscht",
  "aktion.modell.waehlen": "Modell gewählt",
  "aktion.bot.aendern": "Bot geändert",
  "aktion.schleuse.umschalten": "Datenschleuse umgeschaltet",
  "aktion.einstellung.aendern": "Einstellung geändert",
  "aktion.unterhaltung.anlegen": "Unterhaltung angelegt",
  "aktion.unterhaltung.umbenennen": "Unterhaltung umbenannt",
  "aktion.unterhaltung.loeschen": "Unterhaltung gelöscht",
  "aktion.nachricht.senden": "Nachricht gesendet",
  "aktion.modell.anfragen": "Modell angefragt",
  "aktion.lauf.abbrechen": "Antwort abgebrochen",
  "aktion.belege.exportieren": "Belege exportiert",
  "aktion.werkzeug.aufrufen": "Werkzeug aufgerufen",
  "aktion.werkzeug.freigeben": "Werkzeug-Aufruf beantwortet",
  "aktion.werkzeug.ausfuehren": "Werkzeug nach Freigabe ausgeführt",

  // Regeln und Grenzen
  "regel.R-001": "Besitzer verwaltet seine Installation",
  "regel.R-002": "Bot darf antworten",
  "regel.R-003": "Einrichtung mit Einrichtungs-Code",
  "regel.R-004": "Anmelden mit Passwort",
  "regel.R-005": "Bot fragt vor Werkzeugen",
  "regel.R-006": "Nachweis passt nicht zur Aktion",
  "regel.R-007": "Einmal erlaubt",
  "regel.R-008": "Ausführen nur mit Freigabe",
  "regel.R-999": "Ohne passende Regel",
  "regel.G-01": "Datenschleuse gefordert",
  "regel.G-02": "Anbieter aktiv und Region erlaubt",
  "regel.G-03": "Länge",
  "regel.G-04": "Tagesbudget",
  "regel.G-05": "Not-Aus",
  "tor.grenze": "{id} „{name}“",
  "tor.grenze_verletzt": "Das Tor hat die Aktion abgelehnt. Grenze nicht eingehalten: {grenzen}.",
  "regel.V-01": "Unterhaltung vorhanden",
  "regel.V-02": "Kein Lauf aktiv",
  "regel.V-03": "Lauf aktiv",
  "regel.V-04": "Datenschleuse eingerichtet",
  "regel.V-05": "Lauf läuft",
  "regel.V-06": "Aktuelles Passwort bestätigt",
  "regel.V-07": "Einrichtung offen",
  "regel.V-08": "Aufruf wartet auf Freigabe",
  "regel.V-09": "Freigabe passt zum Aufruf",
  "tor.vorbedingung_verletzt":
    "Das Tor hat die Aktion abgelehnt. Vorbedingung nicht erfüllt: {vorbedingungen}.",

  // Einstellungen und Info
  "einstellungen.sitzungen": "Sitzungen",
  "einstellungen.sitzungen.alle_beenden": "Alle Sitzungen beenden",
  "einstellungen.sitzung.diese": "diese Sitzung",
  "einstellungen.passwort.aendern": "Passwort ändern",
  "einstellungen.passwort.aktuell": "Aktuelles Passwort",
  "einstellungen.passwort.neu": "Neues Passwort",
  "einstellungen.verlaufsgrenze": "Verlaufsgrenze (Token)",
  "einstellungen.zeitzone": "Zeitzone",
  "einstellungen.tagesbudget": "Tagesbudget (Token)",
  "info.version": "Stand",
  "info.installation": "Installations-ID",
  "info.lizenz.text":
    "PaiBot steht unter der PaiBot Fair-Code-Lizenz 1.1. Du darfst es für dich selbst nutzen und anpassen.\u200c\u2060\u200d\u2060\u200c",
  "info.enterprise":
    "Du willst PaiBot mit mehreren Personen nutzen? Dafür ist PaiBot Enterprise in Vorbereitung.",
  "info.bestandteile": "Bestandteile und ihre Lizenzen",
  "info.doku": "Zur Doku",

  // Schlüssel und gespeicherte Geheimnisse: je Grund aus dem Krypto-Paket ein Satz
  "krypto.geheimnis_fehlt": "PAIBOT_SECRET fehlt. Erzeuge es mit: openssl rand -base64 32",
  "krypto.geheimnis_ungueltig":
    "PAIBOT_SECRET hat die falsche Form: verlangt sind genau 32 Byte als Base64 (openssl rand -base64 32).",
  "krypto.geheimnis_schwach":
    "PAIBOT_SECRET ist erkennbar nicht zufällig (etwa ein Wort, lauter gleiche Zeichen oder eine Wiederholung). Erzeuge einen neuen Wert mit: openssl rand -base64 32",
  "krypto.format_ungueltig": "Ein gespeicherter Wert hat nicht das erwartete Format.",
  "krypto.parameter_ungueltig":
    "Der gespeicherte Passwort-Hash nennt Werte außerhalb der erlaubten Grenzen.",
  "krypto.version_unbekannt": "Ein gespeicherter Wert hat eine unbekannte Formatversion.",
  "krypto.version_veraltet":
    "Ein gespeicherter Schlüssel stammt aus einer älteren Version. Trage ihn neu ein.",
  "krypto.bindung_fehlt": "Ein gebundener Wert lässt sich ohne seine Bindung nicht lesen.",
  "krypto.entschluesseln_fehlgeschlagen":
    "Ein gespeicherter Wert lässt sich nicht entschlüsseln: anderes PAIBOT_SECRET, anderer Platz oder verändert.",
  "krypto.schluessel_nicht_geladen": "Der Signaturschlüssel ist nicht geladen.",

  // Fehler: Text und, wo es hilft, ein Ausweg
  "fehler.nicht_angemeldet": "Du bist nicht angemeldet.",
  "fehler.nicht_angemeldet.ausweg": "Melde dich neu an.",
  "fehler.pruefzeichen_fehlt": "Die Anfrage konnte nicht bestätigt werden.",
  "fehler.pruefzeichen_fehlt.ausweg": "Lade die Seite neu und versuch es noch einmal.",
  "fehler.herkunft_falsch": "Die Anfrage kam nicht von dieser PaiBot-Seite.",
  "fehler.herkunft_falsch.ausweg": "Öffne PaiBot über die eingestellte Adresse.",
  "fehler.eingabe_ungueltig": "Die Eingabe ist nicht gültig.",
  "fehler.eingabe_ungueltig.ausweg": "Prüf die markierten Felder.",
  "fehler.nicht_gefunden": "Das gibt es nicht (mehr).",
  "fehler.zu_viele_versuche": "Zu viele Versuche.",
  "fehler.zu_viele_versuche.ausweg": "Warte kurz und versuch es dann noch einmal.",
  "fehler.passwort_falsch": "Das Passwort stimmt nicht.",
  "fehler.einrichtungs_code_falsch": "Der Einrichtungs-Code stimmt nicht.",
  "fehler.einrichtungs_code_falsch.ausweg": "Den gültigen Code findest du im Log von PaiBot.",
  "fehler.einrichtung_offen": "PaiBot ist noch nicht eingerichtet.",
  "fehler.einrichtung_offen.ausweg": "Schließ zuerst die Einrichtung ab.",
  "fehler.einrichtung_fertig": "PaiBot ist schon eingerichtet.",
  "fehler.einrichtung_fertig.ausweg": "Melde dich mit deinem Passwort an.",
  "fehler.regel_fehlt": "Dafür gibt es noch keine Regel.",
  "fehler.abgelehnt": "Das Tor hat die Aktion abgelehnt.",
  "fehler.lauf_aktiv": "Dein Bot antwortet gerade noch.",
  "fehler.lauf_aktiv.ausweg": "Warte die Antwort ab oder brich sie ab.",
  "fehler.kein_modell": "Für deinen Bot ist kein Modell gewählt.",
  "fehler.kein_modell.ausweg": "Wähle ein Modell.",
  "fehler.schleuse_blockiert":
    "Die Datenschleuse hat die Anfrage gestoppt. Die Nachricht wurde nicht an das Modell geschickt.",
  "fehler.schleuse_blockiert.ausweg":
    "Prüf, ob die Datenschleuse läuft, oder schalte sie für diese Unterhaltung aus.",
  "fehler.schleuse_nicht_installiert": "Die Datenschleuse ist nicht installiert.",
  "fehler.schleuse_nicht_installiert.ausweg":
    "Installiere die Datenschleuse oder lass den Schalter auf Aus.",
  "fehler.anbieter_nicht_erreichbar": "Der Anbieter des Modells ist nicht erreichbar.",
  "fehler.anbieter_nicht_erreichbar.ausweg": "Versuch es gleich noch einmal.",
  "fehler.schluessel_ungueltig": "Der Anbieter hat den Schlüssel nicht angenommen.",
  "fehler.schluessel_ungueltig.ausweg": "Trag einen gültigen Schlüssel ein.",
  "fehler.limit_erreicht": "Ein Limit ist erreicht.",
  "fehler.limit_erreicht.ausweg": "Warte etwas oder prüf dein Tagesbudget.",
  "fehler.unterbrochen": "Die Antwort wurde unterbrochen.",
  "fehler.unterbrochen.ausweg": "Schick die Nachricht noch einmal.",
  "fehler.intern": "Da ist etwas schiefgegangen.",
  "fehler.intern.ausweg": "Versuch es noch einmal. Hilft das nicht, schau ins Log von PaiBot.",

  // Seite Einstellungen und Info
  "einstellungen.reiter.name": "Bereiche der Einstellungen",
  "einstellungen.reiter.zugang": "Zugang",
  "einstellungen.reiter.grenzen": "Grenzen",
  "einstellungen.passwort.wiederholen": "Neues Passwort wiederholen",
  "einstellungen.passwort.text":
    "Wähl ein Passwort, das du dir merken kannst. Ein Satz aus vier Wörtern ist gut.",
  "einstellungen.passwort.hinweis":
    "Danach sind alle anderen Geräte abgemeldet. Auf diesem Gerät bleibst du angemeldet.",
  "einstellungen.passwort.laeuft": "Wird geändert …",
  "einstellungen.passwort.leer": "Gib dein aktuelles Passwort ein.",
  "einstellungen.passwort.unfertig": "Das neue Passwort erfüllt die Prüfliste noch nicht.",
  "einstellungen.passwort.erfolg":
    "Dein Passwort ist geändert. Alle anderen Geräte sind jetzt abgemeldet.",
  "einstellungen.sitzungen.text":
    "Jede Anmeldung ist eine Sitzung. Hier siehst du, wo du gerade angemeldet bist.",
  "einstellungen.sitzungen.leer": "Es gibt gerade keine aktive Sitzung.",
  "einstellungen.sitzungen.fehler": "Die Sitzungen lassen sich gerade nicht laden.",
  "einstellungen.sitzungen.alle_hinweis":
    "Meldet alle Geräte ab, auch dieses. Danach meldest du dich mit deinem Passwort neu an.",
  "einstellungen.sitzungen.rueckfrage":
    "Alle Geräte werden abgemeldet, auch dieses. Danach landest du auf der Anmeldung.",
  "einstellungen.sitzungen.laeuft": "Wird beendet …",
  "einstellungen.sitzung.angemeldet": "angemeldet am {zeit}",
  "einstellungen.sitzung.zuletzt": "zuletzt aktiv am {zeit}",
  "einstellungen.sitzung.geraet": "{browser} auf {system}",
  "einstellungen.sitzung.geraet_unbekannt": "Gerät ohne Angabe",
  "einstellungen.abmelden.text": "Meldet nur dieses Gerät ab.",
  "einstellungen.schliessen": "Schließen",
  "einstellungen.grenzen.vorspann":
    "Grenzen prüft das Tor bei jeder Anfrage an das Modell, nach festen Regeln und ohne KI. Jede Änderung hier bekommt einen Beleg.",
  "einstellungen.tagesbudget.hilfe":
    "Höchstens so viele Token am Tag (Eingabe und Ausgabe zusammen). Leer lassen heißt: keine Tagesgrenze.",
  "einstellungen.verlaufsgrenze.hilfe":
    "So viele Token aus dem bisherigen Verlauf gehen höchstens mit jeder Anfrage mit. Leer lassen heißt: so viel, wie passt.",
  "einstellungen.zeitzone.hilfe":
    "Danach richten sich das Datum für deinen Bot und der Beginn des Tages für die Tagesgrenze.",
  "einstellungen.heute.titel": "Heute verbraucht",
  "einstellungen.heute.ohne_grenze": "{token} Token seit {uhrzeit} Uhr. Es gibt keine Tagesgrenze.",
  "einstellungen.heute.mit_grenze": "{token} von {grenze} Token seit {uhrzeit} Uhr.",
  "einstellungen.heute.erreicht":
    "Die Tagesgrenze ist erreicht. Bis morgen fragt dein Bot das Modell nicht mehr an.",
  "einstellungen.grenzen.zahl_ungueltig":
    "Gib eine ganze Zahl von 1 bis {max} ein oder lass das Feld leer.",
  "einstellungen.grenzen.unveraendert": "Es gibt nichts zu speichern.",
  "einstellungen.grenzen.laeuft": "Wird gespeichert …",
  "einstellungen.grenzen.gespeichert": "Gespeichert.",
  "einstellungen.grenzen.beleg": "Beleg Nr. {nummer} ansehen",
  "info.marke": "PaiBot",
  "info.lizenz": "Lizenz",
  "info.lizenz.name": "PaiBot Fair-Code-Lizenz 1.1, für eine Person",
  "info.lizenz.person": "PaiBot ist für eine Person gedacht: privat und für deine eigene Arbeit.",
  "info.lizenz.team":
    "Für Teams und Unternehmen ist PaiBot Enterprise mit Support in Vorbereitung. Anfrage an hi@paibot.de.",
  "info.lizenz.link": "Lizenztext lesen",
  "info.entwickelt": "Entwickelt von",
  "info.team": "Im Team nutzen",
  "info.team.anfrage": "Anfrage an",
  "info.links": "Links",
  "info.link.quellcode": "Quellcode",
  "info.link.community": "Community auf aiianer.de",
  "info.neuer_tab": "(öffnet in einem neuen Tab)",
  "info.bestandteile.text":
    "PaiBot nutzt Bestandteile Dritter. Für sie gelten ausschließlich ihre eigenen Lizenzen.",
  "info.bestandteile.schriften":
    "Die Schriften Inter und Montserrat stehen unter der SIL Open Font License 1.1 und liegen in PaiBot selbst; nichts wird von fremden Servern geladen.",
  "info.bestandteile.link": "Liste aller Bestandteile",
  "info.hilfe": "Hilfe",
  "info.hilfe.text":
    "Anleitungen für jede Funktion stehen in der Doku auf paibot.de. Fragen und Austausch gibt es in der Community auf aiianer.de.",
  "info.sicherheit": "Sicherheitslücke melden",
  "info.sicherheit.text":
    "Bitte melde Sicherheitslücken nicht öffentlich. Wie es vertraulich geht, steht in SECURITY.md.",
  "info.sicherheit.link": "SECURITY.md lesen",
} as const satisfies Record<string, string | readonly string[]>;
