# Notizen – PRD (v0.1, Entwurf)

Minimale Handschrift-Notiz-App für das iPad mit Apple Pencil, als Web-App (PWA) mit PHP/MySQL-Backend,
Benutzerverwaltung und Admin-Bereich. Teil des Repos `games`, aber vollständig eigenständig im Ordner `notizen/`
(eigener Service-Worker-Cache mit Präfix `notizen-`, eigene IndexedDB, eigene Cookies mit Pfad `/games/notizen/`).

Status: **Entwurf 2026-11-23, noch nicht umgesetzt.** Technische Umsetzung: [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md),
Arbeitspakete: [`PLAN.md`](PLAN.md).

## 1. Ziele
- Auf dem **iPad Air mit Apple Pencil** in Safari bzw. als Home-Bildschirm-App flüssig handschriftlich schreiben.
- **Minimal:** wenige Papiersorten, wenige Werkzeuge, keine Spielereien.
- Notizen in **Ordnern und Unterordnern** organisieren.
- **Offline schreiben**, später automatisch mit dem Server abgleichen. Kein Datenverlust durch WLAN-Abbrüche.
- **Benutzerkonten**: Der Admin legt Benutzer an und verwaltet sie. Es gibt keine Selbstregistrierung.
- Notizen **nur lesend teilen** mit anderen Benutzern.
- Läuft komplett unter **`https://phpexpert.de/games/notizen/`** (Oberfläche und API auf derselben Domain).
- Vanilla JS ohne Build-Schritt, PHP ohne Framework, MySQL/MariaDB.

## 2. Nicht-Ziele (v1)
- Keine Handschrifterkennung, keine Textsuche im Geschriebenen (Suche nur über Titel und Ordnernamen).
- Keine Tastatur-Textfelder, Bilder, PDF-Import, Formen-Erkennung oder Lasso.
- Kein gemeinsames Bearbeiten derselben Notiz durch mehrere Benutzer, Teilen nur lesend.
- Keine Selbstregistrierung und kein „Passwort vergessen“ per E-Mail (der Admin setzt Passwörter zurück).
- Keine native iOS-App und keine Unterstützung der Pencil-Gesten Doppeltippen/Squeeze (im Browser nicht verfügbar).
- Andere Geräte (Android, Desktop mit Maus) sollen funktionieren, sind aber nicht das Optimierungsziel.

## 3. Rollen
| Rolle | Darf |
|---|---|
| **Benutzer** | Eigene Ordner und Notizen anlegen, bearbeiten, löschen und teilen. Mit ihm geteilte Notizen lesen. Eigenes Passwort ändern. |
| **Admin** | Alles, was ein Benutzer darf (hat eigene Notizen), dazu der Admin-Bereich (Abschnitt 8). |

Das erste Admin-Konto kommt aus GitHub-Secrets (Abschnitt 9). Weitere Admins kann ein Admin ernennen.

## 4. Anmeldung und Konto
- Anmeldung mit **Benutzername + Passwort**. Die Sitzung bleibt **60 Tage** gültig und verlängert sich bei jeder Nutzung.
- Vom Admin angelegte Konten und zurückgesetzte Passwörter sind **Einmal-Passwörter**: Nach der Anmeldung muss man ein eigenes Passwort setzen.
- Passwortregeln: mindestens 10 Zeichen. Keine weiteren Zwangsregeln.
- **Schutz gegen Raten:** Nach 5 Fehlversuchen für denselben Benutzernamen oder dieselbe IP sind weitere Versuche 15 Minuten gesperrt.
- Konto-Seite: Anzeigename, Passwort ändern, „Auf allen Geräten abmelden“, Speicherverbrauch, Hinweis
  **„Admins können deine Notizen einsehen“** (Transparenz, siehe Abschnitt 8).
- **Abmelden** fragt, ob die lokalen Daten auf diesem Gerät gelöscht werden sollen. Hat das Gerät noch nicht
  abgeglichene Änderungen, warnt die App vorher deutlich.
- **Offline:** Wer auf dem Gerät schon angemeldet war, kann die App ohne Netz öffnen und weiterschreiben.
  Ist die Sitzung inzwischen abgelaufen, bleibt alles lokal erhalten und wird nach der nächsten Anmeldung
  **desselben** Benutzers hochgeladen.

## 5. Bibliothek (Ordner und Notizen)
- Startansicht: **Ordnerbaum** links (Seitenleiste im Querformat, ausklappbar im Hochformat), rechts der Inhalt des
  gewählten Ordners als **Raster mit Vorschaubildern** (erste Seite), Unterordner zuerst.
- Beliebig tiefe **Unterordner**. Notizen können auch direkt in der obersten Ebene liegen.
- Aktionen für Ordner und Notizen: **Neu, Umbenennen, Verschieben** (Zielordner wählen), **Löschen** (in den Papierkorb), **Teilen**.
- Sortierung: Ordner alphabetisch, Notizen nach „zuletzt geändert“ (umschaltbar auf alphabetisch).
- **Suche** über Notiztitel und Ordnernamen.
- **Papierkorb:** Gelöschte Ordner und Notizen bleiben 30 Tage wiederherstellbar und werden danach endgültig
  gelöscht. Ein gelöschter Ordner nimmt seinen Inhalt mit. Der Papierkorb lässt sich manuell leeren.
- Bereich **„Mit mir geteilt“** unterhalb des eigenen Baums (Abschnitt 7).
- Ein **Statussymbol** oben zeigt: abgeglichen ✓ / wird abgeglichen / offline (n Änderungen ausstehend) / Fehler.

## 6. Editor
### 6.1 Seiten und Papier
- Eine Notiz besteht aus **A4-Seiten** (210 × 297 mm), wahlweise **hoch oder quer**, pro Seite einstellbar.
- **Papiersorten** (pro Seite): **Blanko, Liniert** (8 mm Zeilenabstand, Rand links), **Kariert** (5 mm), **Gepunktet** (5 mm).
  Papier ist weiß, Linien hellgrau bzw. hellblau.
- Neue Notiz: Titel (Standard: Datum), Papiersorte und Ausrichtung wählen. Die Werte der letzten Notiz sind vorausgewählt.
- Seiten **hinzufügen** (am Ende oder nach der aktuellen Seite, übernimmt das Papier der aktuellen Seite), **löschen**,
  **Papier ändern**. Die Seiten werden untereinander gescrollt.

### 6.2 Werkzeuge
- **Stift** mit Druckempfindlichkeit, **3 Stärken** (fein, mittel, dick) und **6 Farben** (Schwarz, Dunkelblau, Rot, Grün, Orange, Lila).
- **Textmarker**: halbtransparent, liegt optisch unter der Schrift, 3 Farben (Gelb, Grün, Pink), fester breiter Strich.
- **Radierer**: löscht ganze Striche, die er berührt (Strich-Radierer). Ein Pixel-Radierer kommt in v1 nicht.
- **Rückgängig / Wiederholen** (pro geöffneter Notiz, bis zu 100 Schritte, gilt bis zum Schließen der Notiz).
- Werkzeugleiste oben, kompakt, mit großen Tippflächen (mindestens 44 pt).

### 6.3 Eingabe
- **Nur der Apple Pencil zeichnet.** Finger scrollen (1 Finger) und zoomen (2 Finger, 100–400 %).
  Die aufliegende Handfläche löst nichts aus.
- Wer keinen Stift hat (anderes Gerät, Maus), kann in den Einstellungen **„Mit Finger/Maus zeichnen“** einschalten.
  Dann scrollt man mit zwei Fingern.
- Die Linie folgt dem Stift ohne spürbare Verzögerung, die Darstellung ist auch beim Zoomen scharf.
- Die Linien werden leicht geglättet, ohne die Handschrift zu verfälschen.

### 6.4 Speichern
- **Automatisch**, ohne Speichern-Knopf. Lokal spätestens 1 s nach dem letzten Strich, auf dem Server
  (falls online) spätestens nach ein paar Sekunden.
- Schließen, App-Wechsel oder Akku leer dürfen höchstens den gerade gezeichneten Strich kosten.

### 6.5 Export
- **PDF-Export** einer Notiz: Vektor-PDF in A4 mit Papierhintergrund, über das Teilen-Menü von iPadOS
  (Dateien, AirDrop, Mail).
- **Backup**: Export aller eigenen Notizen als eine Datei (`.notizen`) und **Import** einer solchen Datei.
  Importierte Inhalte landen als Kopie in einem neuen Ordner „Import <Datum>“.

## 7. Teilen (nur lesen)
- Ein Benutzer kann einen **Ordner** (samt allen Unterordnern und Notizen, auch künftig hinzukommenden)
  oder eine **einzelne Notiz** für **ausgewählte Benutzer** freigeben.
- Der Teilen-Dialog zeigt die anderen aktiven Benutzer mit Anzeigenamen, dazu die bestehenden Freigaben mit „Aufheben“.
- Empfänger sehen unter **„Mit mir geteilt“** die Freigaben nach Besitzer gruppiert. Sie können lesen, blättern,
  zoomen und als PDF exportieren, aber nichts ändern.
- Zuletzt geöffnete geteilte Notizen sind auch **offline lesbar** (Zwischenspeicher, kein Sync-Ziel).
- Gelöschte oder nicht mehr geteilte Inhalte verschwinden beim Empfänger beim nächsten Online-Abruf.

## 8. Admin-Bereich (`/games/notizen/admin.html`, nur online)
- **Benutzerliste** mit Benutzername, Anzeigename, Rolle, Status (aktiv/gesperrt), letzter Anmeldung,
  Speicherverbrauch und Anzahl der Notizen.
- **Benutzer anlegen**: Benutzername (a–z, 0–9, `.-_`, 3–32 Zeichen, unveränderlich), Anzeigename, Rolle,
  Speicherlimit (Standard 500 MB). Die App erzeugt ein **Einmal-Passwort** und zeigt es genau einmal an
  (alternativ selbst eingeben).
- **Bearbeiten**: Anzeigename, Rolle, Speicherlimit.
- **Passwort zurücksetzen**: neues Einmal-Passwort, alle Sitzungen des Benutzers werden beendet.
- **Sperren / Entsperren**: Ein gesperrtes Konto kann sich nicht anmelden, bestehende Sitzungen enden sofort.
  Seine Freigaben bleiben bestehen, sind aber unsichtbar, solange es gesperrt ist.
- **Sitzungen beenden** („überall abmelden“).
- **Löschen**: nach Eingabe des Benutzernamens zur Bestätigung. Löscht das Konto mit allen Notizen und Freigaben endgültig.
- **Notizen einsehen**: Ordnerbaum und Notizen eines Benutzers **nur lesend** ansehen und als PDF exportieren.
  Jeder Zugriff landet im Protokoll.
- **Protokoll**: Admin-Aktionen (anlegen, ändern, sperren, löschen, Passwort zurücksetzen, Notizen einsehen) mit Zeit, Admin und Ziel.
- Schutzregeln: Der letzte aktive Admin kann nicht gesperrt, gelöscht oder zum Benutzer herabgestuft werden.
  Ein Admin kann sich nicht selbst löschen.

## 9. Betrieb
- Deploy per GitHub Actions (FTP) nach `phpexpert.de/games/notizen/`, wie bei den anderen Backends.
- **Secrets**: MySQL-Zugang (`NOTIZEN_DB_HOST`, `NOTIZEN_DB_NAME`, `NOTIZEN_DB_USER`, `NOTIZEN_DB_PASSWORD`) und
  Erst-Admin (`NOTIZEN_ADMIN_USER`, `NOTIZEN_ADMIN_PASSWORD`). Wird `NOTIZEN_ADMIN_PASSWORD` geändert, setzt der
  nächste Deploy das Passwort dieses Admins zurück. Das ist der Notfallzugang, falls man sich ausgesperrt hat.
- Die Datenbank-Tabellen legt die App beim ersten Aufruf nach einem Deploy selbst an bzw. aktualisiert sie (Migrationen).
- Die Startseite des Repos bekommt eine Karte „Notizen“, die auf `https://phpexpert.de/games/notizen/` verlinkt.
- **Datensicherung** des Servers: über die Backup-Funktion des Hosters (MySQL). Zusätzlich hat jeder Benutzer den Backup-Export.

## 10. Qualitätsziele
- Schreiben fühlt sich auch auf einer Seite mit 2.000 Strichen flüssig an (60 fps beim Zeichnen, sichtbare Verzögerung unter ca. 30 ms auf iPad Air M1 oder neuer).
- Eine Notiz mit 50 Seiten öffnet in unter 2 s und scrollt flüssig.
- Kein Datenverlust bei Offline-Betrieb, App-Abbruch oder parallelem Schreiben auf zwei Geräten.
  Bei Konflikten bleibt beides erhalten (Abschnitt „Sync“ in der Architektur).
- Sicherheit: Passwörter nur als bcrypt-Hash, Sitzungs-Cookie `HttpOnly; Secure; SameSite=Strict`, CSRF-Schutz,
  alle SQL-Abfragen mit Platzhaltern, strikte Content-Security-Policy, keine Benutzerinhalte per `innerHTML`.
- Benutzer sehen niemals Daten anderer Benutzer, außer über ausdrückliche Freigaben. Das ist durch Tests abgesichert.

## 11. Offene Punkte
- PHP- und MySQL-Version auf dem dogado-Webspace sind unbekannt. Der Code bleibt **PHP-7.4-kompatibel**, ein
  Ping-Endpunkt meldet die Versionen nach dem ersten Deploy.
- Die MySQL-Datenbank muss bei dogado angelegt und die Zugangsdaten als Secrets hinterlegt werden (Betreiber).
- Später denkbar: Pixel-Radierer, Lasso/Verschieben, Kopie einer geteilten Notiz in die eigenen Notizen, Seiten umsortieren.
