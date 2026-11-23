# Notizen – Architektur (v0.1, Entwurf)

Grundlage: [`../PRD.md`](../PRD.md). Die hier genannten Dateinamen, Funktionsnamen, Tabellen und API-Routen sind
**verbindlich** für alle Arbeitspakete in [`../PLAN.md`](../PLAN.md). Abweichungen nur nach Rücksprache mit Opus, und
das Dokument wird dann angepasst.

## 1. Überblick

```
iPad (Safari / Home-Bildschirm-App)                       phpexpert.de/games/notizen/ (dogado, Apache + PHP)
┌───────────────────────────────────────────┐            ┌──────────────────────────────────────┐
│ index.html  ── Bibliothek, Editor, Konto   │  HTTPS     │ api.php  (Front-Controller, JSON)     │
│ admin.html  ── Admin-Bereich (nur online)  │  gleiche   │ lib/*.php (Auth, Sync, Teilen, Admin) │
│                                            │  Domain    │ migrations/*.sql                       │
│ model.js ── IndexedDB (lokale Wahrheit)    │◀──────────▶│ MySQL/MariaDB (Tabellen notizen_*)     │
│ sync.js  ── Push/Pull im Hintergrund       │  Cookie    └──────────────────────────────────────┘
│ ink/*    ── Pencil-Eingabe + Canvas        │  + CSRF
│ sw.js    ── App-Shell offline              │
└───────────────────────────────────────────┘
```

- **Offline zuerst:** Die Oberfläche liest und schreibt nur die lokale IndexedDB. `sync.js` gleicht im Hintergrund
  mit dem Server ab. Die UI wartet nie auf das Netz (Ausnahmen: Login, Teilen-Dialog, „Mit mir geteilt“, Admin).
- **Gleiche Domain:** Oberfläche und API kommen von `phpexpert.de`. Damit funktioniert ein `HttpOnly`-Session-Cookie
  ohne CORS, und Safaris Tracking-Schutz greift nicht.
- **Kein Build-Schritt:** ES-Module, direkt ausgeliefert. Keine externen Bibliotheken, Fonts oder CDNs.
- **PHP 7.4-kompatibel** (kein `match`, keine benannten Argumente, kein Nullsafe-Operator, keine Union-Typen, keine
  `readonly`-Eigenschaften), MySQL 5.7+ / MariaDB 10.3+ (kein `JSON`-Spaltentyp, keine CTEs nötig), InnoDB, `utf8mb4`.

## 2. Ordnerstruktur

```
notizen/
  index.html            App (Hash-Router: #/ #/f/<folderId> #/n/<noteId> #/shared #/shared/n/<noteId> #/trash #/account)
  admin.html            Admin-Bereich
  manifest.json  sw.js  icons/
  .htaccess             CSP + Sicherheits-Header, sperrt lib/, migrations/, test/, docs/, config.php
  api.php               einziger PHP-Einstieg
  config.example.php    Vorlage; config.php wird vom Deploy erzeugt (nie im Repo)
  lib/
    bootstrap.php       lädt config, setzt Header, Fehlerbehandlung, Migration/Erst-Admin
    http.php            JSON-Ein-/Ausgabe, Fehler
    db.php              PDO, Tabellenpräfix, Transaktionen
    migrate.php         Migrationen + Erst-Admin aus config
    auth.php            Passwörter, Sitzungen, CSRF, Login-Bremse
    sync.php            Sync-Protokoll (Push/Pull, Konflikte, Papierkorb-Bereinigung, Quota)
    tree.php            Lesezugriff auf Bäume/Seiten fremder Benutzer (Teilen + Admin)
    share.php           Freigaben
    account.php         eigenes Konto
    admin.php           Admin-Routen
    util.php            Zeit, UUID-Prüfung, Admin-Protokoll
  migrations/001_init.sql …
  css/app.css  css/admin.css
  js/
    config.js           Konstanten (Farben, Stärken, Papier, Seitenmaße)
    app.js              Einstieg index.html: Login-Zustand, Router, Verdrahtung
    api.js              fetch-Wrapper
    db.js               IndexedDB-Schicht
    model.js            Datenoperationen der App (einzige Schreibstelle für lokale Daten)
    sync.js             Sync-Engine
    ink/
      codec.js          Strich-Format (de)serialisieren
      stroke.js         Glättung + Umriss-Polygon (geteilt von Canvas und PDF)
      paper.js          Papiergeometrie (geteilt von Canvas und PDF)
      render.js         Zeichnen auf Canvas (Seite, Strich, Papier)
      surface.js        Editor-Fläche: Viewport (Pan/Zoom), Eingabe, Seiten-Virtualisierung, Undo
    ui/
      dom.js            kleine DOM-Helfer (h(), Dialog-Basis, Toast)
      login.js  library.js  tree.js  editor.js  toolbar.js  dialogs.js  share.js  shared.js  trash.js  account.js  status.js
    export/
      pdf.js            Vektor-PDF-Writer
      backup.js         .notizen Export/Import
    admin/
      admin.js          Einstieg admin.html
  test/
    php/run.php         PHP-Tests gegen eine MariaDB (Tabellenpräfix test_)
    js/*.test.mjs       node --test (codec, stroke, paper, pdf, sync-Logik)
    e2e/*.mjs           Playwright gegen php -S + MariaDB
  docs/ARCHITEKTUR.md
  PRD.md  PLAN.md  README.md
```

## 3. Datenmodell

### 3.1 Gemeinsame Konventionen
- **IDs** von Ordnern, Notizen und Seiten sind UUIDs v4, die der **Client** erzeugt (`crypto.randomUUID()`).
  Server-IDs (Benutzer, Freigaben, Protokoll) sind `INT UNSIGNED AUTO_INCREMENT`.
- **Zeitstempel**: überall Millisekunden seit 1970 (UTC) als `BIGINT` bzw. JS-`number`.
- **Seitenkoordinaten**: Einheit 0,1 mm. A4 hoch = 2100 × 2970, quer = 2970 × 2100. Ursprung oben links.
- **Löschen** = `deleted_at` setzen (Papierkorb). **Endgültig löschen** = `purged = 1` (Inhalt geleert,
  Zeile bleibt als Grabstein, bis die Bereinigung sie entfernt, siehe 5.6).
- Jede synchronisierte Zeile hat `rev` (Version der Zeile, beginnt bei 1) und `seq` (Änderungszähler des Besitzers, siehe 5).

### 3.2 MySQL-Tabellen (Präfix aus config, Standard `notizen_`)

| Tabelle | Spalten (Kurzform) |
|---|---|
| `users` | `id` PK, `username` VARCHAR(32) UNIQUE, `display_name` VARCHAR(64), `password_hash` VARCHAR(255), `role` ENUM('user','admin'), `status` ENUM('active','locked'), `must_change_pw` TINYINT, `quota_bytes` BIGINT, `used_bytes` BIGINT, `seq` BIGINT (Änderungszähler), `purge_floor` BIGINT, `last_purge_at` BIGINT, `created_at`, `last_login_at` |
| `sessions` | `id_hash` CHAR(64) PK (SHA-256 des Cookie-Werts), `user_id` FK, `csrf` CHAR(43), `created_at`, `last_seen_at`, `expires_at`, `user_agent` VARCHAR(200); Index `user_id` |
| `login_attempts` | `id` PK, `username` VARCHAR(64), `ip` VARCHAR(45), `at` BIGINT; Index (`username`,`at`), (`ip`,`at`) |
| `folders` | `id` CHAR(36) PK, `user_id` FK, `parent_id` CHAR(36) NULL, `name` VARCHAR(200), `created_at`, `updated_at`, `deleted_at` NULL, `purged` TINYINT, `rev` INT, `seq` BIGINT; Index (`user_id`,`seq`) |
| `notes` | `id` CHAR(36) PK, `user_id`, `folder_id` CHAR(36) NULL, `title` VARCHAR(200), `created_at`, `updated_at`, `deleted_at`, `purged`, `rev`, `seq`; Index (`user_id`,`seq`), (`folder_id`) |
| `pages` | `id` CHAR(36) PK, `user_id`, `note_id` CHAR(36), `pos` DOUBLE, `paper` ENUM('blank','lined','grid','dotted'), `orient` ENUM('p','l'), `strokes` MEDIUMTEXT, `bytes` INT, `conflict` TINYINT, `created_at`, `updated_at`, `deleted_at`, `purged`, `rev`, `seq`; Index (`user_id`,`seq`), (`note_id`) |
| `shares` | `id` PK, `owner_id`, `target_id`, `kind` ENUM('folder','note'), `item_id` CHAR(36), `created_at`; UNIQUE (`owner_id`,`target_id`,`kind`,`item_id`), Index `target_id` |
| `admin_log` | `id` PK, `admin_id`, `action` VARCHAR(40), `target_user_id` NULL, `details` VARCHAR(500), `at` BIGINT |
| `settings` | `k` VARCHAR(64) PK, `v` TEXT (`schema_version`, `admin_fp`) |

Fremdschlüssel mit `ON DELETE CASCADE` von `sessions`, `folders`, `notes`, `pages`, `shares` auf `users`.
Benutzer löschen = eine `DELETE`-Anweisung. `folders.parent_id` und `notes.folder_id` haben **keinen**
Fremdschlüssel, weil sich beim Offline-Sync die Reihenfolge der Änderungen nicht garantieren lässt.

### 3.3 Strich-Format (`pages.strokes`, vom Server als undurchsichtiger Text behandelt)
JSON-Array von Strichen. Der Server prüft nur: gültiges JSON-Array, höchstens 8 MB pro Seite.

```json
[{"i":"k3x9a1","t":"p","c":0,"w":1,"p":[x0,y0,p0, dx1,dy1,dp1, dx2,dy2,dp2, …]}]
```
- `i`: Strich-ID (8 zufällige Zeichen, eindeutig pro Seite), `t`: `"p"` Stift | `"h"` Textmarker,
  `c`: Farbindex (in `PEN_COLORS` bzw. `HL_COLORS`), `w`: Stärkenindex 0–2 (bei `"h"` immer 0).
- `p`: Punkte, **delta-kodiert** als Ganzzahlen. Erster Punkt absolut, danach Differenzen. `x`,`y` in 0,1 mm,
  Druck `p` 0–255 (Maus/Finger: 128). Punkte sind bereits geglättet und entdoppelt gespeichert.
- `codec.js` exportiert `encodeStrokes(strokes) → string` und `decodeStrokes(string) → Stroke[]`, wobei
  `Stroke = {id, type:'p'|'h', color, width, pts: Int32Array /* x,y,p,x,y,p… absolut */}`.

### 3.4 IndexedDB (`notizen-u<userId>`, Version 1)
| Store | Schlüssel | Indizes | Inhalt |
|---|---|---|---|
| `folders` | `id` | `parent_id`, `dirty` | wie Server-Zeile + `dirty` (0/1) |
| `notes` | `id` | `folder_id`, `dirty` | wie Server-Zeile + `dirty` |
| `pages` | `id` | `note_id`, `dirty` | wie Server-Zeile + `dirty` (`strokes` als String) |
| `meta` | `k` | – | `cursor` (letzte gesehene seq), `settings`, `lastSync` |
| `thumbs` | `note_id` | – | `{note_id, page_rev, blob}` (wird nicht synchronisiert) |
| `shared` | `key` | – | Zwischenspeicher für geteilte Bäume/Seiten (nur lesen) |

`dirty = 1` heißt, dass die Zeile lokal geändert und noch nicht vom Server bestätigt ist. `rev` ist immer die zuletzt vom
Server bestätigte Version (neue Zeilen: `rev = 0`).

`localStorage`: `notizen:lastUser` = `{id, username, display_name, role}` (für Offline-Start), `notizen:prefs` (zuletzt
gewähltes Papier, Werkzeug, „Mit Finger zeichnen“).

## 4. HTTP-API

Einstieg `api.php?r=<route>`. Anfragen und Antworten sind JSON (`Content-Type: application/json`).
Erfolg: HTTP 200 mit `{"ok":true, …}`. Fehler: passender Status mit `{"error":{"code":"…","message":"…"}}`
(`message` deutsch, für die Anzeige).

**Schutz:** Jede `POST`-Route außer `login` verlangt den Header `X-CSRF-Token` passend zur Sitzung. Zusätzlich muss
der `Origin`-Header (falls vorhanden) zur eigenen Domain passen. Fehlende oder ungültige Sitzung → 401 `unauthenticated`.
Ist `must_change_pw` gesetzt, sind nur `me`, `password` und `logout` erlaubt (403 `must_change_password`).

| Route | Methode | Recht | Ein → Aus |
|---|---|---|---|
| `ping` | GET | – | → `{php, mysql, schema}` |
| `login` | POST | – | `{username, password}` → setzt Cookie, `{user, csrf}`; 401 `bad_credentials`, 429 `too_many_attempts`, 403 `locked` |
| `logout` | POST | user | → löscht Sitzung + Cookie |
| `me` | GET | user | → `{user, csrf}` |
| `password` | POST | user | `{old, new}` → `{ok}`; beendet alle **anderen** Sitzungen; bei `must_change_pw` ist `old` nicht nötig |
| `logout_all` | POST | user | → beendet alle Sitzungen inkl. der eigenen |
| `account` | GET | user | → `{user, used_bytes, quota_bytes, admins_can_read: true}` |
| `sync_pull` | GET | user | `since`, `limit` → `{items, cursor, more, reset}` (5.3) |
| `sync_push` | POST | user | `{changes}` → `{results, cursor}` (5.2) |
| `directory` | GET | user | → `{users:[{id, display_name}]}` aktive Benutzer außer einem selbst |
| `shares_of` | GET | user | `kind`, `id` → `{shares:[{id, target_id, display_name}]}` (eigenes Element) |
| `share` | POST | user | `{kind, id, target_ids}` → `{shares}` |
| `unshare` | POST | user | `{share_id}` → `{ok}` |
| `shared_tree` | GET | user | → `{owners:[{owner:{id,display_name}, folders:[…], notes:[…]}]}` freigegebene Ordner inkl. aller Unterordner/Notizen + einzeln freigegebene Notizen; ohne `strokes` |
| `shared_pages` | GET | user | `note` → `{note, pages}` mit `strokes`; 404 ohne Lesezugriff |
| `admin_users` | GET | admin | → `{users:[{…, notes_count, sessions_count}]}` |
| `admin_user_create` | POST | admin | `{username, display_name, role, quota_mb, password?}` → `{user, temp_password}` |
| `admin_user_update` | POST | admin | `{id, display_name?, role?, quota_mb?}` → `{user}` |
| `admin_user_reset` | POST | admin | `{id}` → `{temp_password}` |
| `admin_user_lock` | POST | admin | `{id, locked}` → `{user}` |
| `admin_user_logout` | POST | admin | `{id}` → `{ok}` |
| `admin_user_delete` | POST | admin | `{id, confirm_username}` → `{ok}` |
| `admin_tree` | GET | admin | `user` → `{folders, notes}` (alle, nicht gelöschte; ohne `strokes`) + Protokolleintrag `view_tree` |
| `admin_pages` | GET | admin | `user`, `note` → `{note, pages}` + Protokolleintrag `view_note` |
| `admin_log` | GET | admin | `before?` (id), `limit` → `{entries}` |

Ausgegebene Benutzer (`user_public`): `{id, username, display_name, role, status, must_change_pw, created_at, last_login_at}`.

## 5. Sync-Protokoll

### 5.1 Grundidee
- Pro Benutzer gibt es einen Zähler `users.seq`. Jede Änderung an einer seiner Zeilen bekommt `seq = ++users.seq`
  (in derselben Transaktion, `SELECT … FOR UPDATE` auf die Benutzerzeile serialisiert parallele Pushes desselben Benutzers).
- Der Client merkt sich `cursor` = höchste gesehene `seq` und fragt danach nur Neueres ab.
- Optimistische Nebenläufigkeit: Der Client schickt mit jeder Änderung `base_rev`, die Version, auf der seine Änderung beruht.

### 5.2 Push (`sync_push`)
```json
{"changes":[{"kind":"folder|note|page","id":"<uuid>","base_rev":3,"data":{…alle Felder der Zeile ohne rev/seq/user_id…}}]}
```
Der Client schickt geänderte Zeilen in der Reihenfolge **Ordner, Notizen, Seiten**, höchstens 50 Änderungen bzw.
etwa 8 MB pro Anfrage. Der Server verarbeitet jede Änderung in derselben Transaktion:

1. **Prüfen:** UUID gültig, Feldlängen, `paper`/`orient` gültig, `strokes` gültiges JSON ≤ 8 MB.
   Gehört die ID einem anderen Benutzer → `rejected/forbidden`.
2. **Neu** (ID unbekannt): einfügen mit `rev = 1`. Eine Seite, deren Notiz dem Benutzer nicht gehört → `rejected/orphan`.
3. **`base_rev == rev`**: übernehmen, `rev + 1`.
4. **`base_rev != rev` (Konflikt)**:
   - **Ordner/Notiz:** Wer das neuere `updated_at` hat, gewinnt die ganze Zeile (Last-Write-Wins).
   - **Seite:** Der neuere Stand (`updated_at`) gewinnt die Zeile. Unterscheidet sich der **unterlegene** Stand in
     `strokes` und ist er nicht gelöscht, legt der Server ihn als **neue Seite** an (neue UUID, `conflict = 1`,
     `pos` direkt hinter der Gewinnerseite). So geht keine Handschrift verloren.
   - Gelöscht gegen bearbeitet entscheidet ebenfalls `updated_at`. Ein Löschen setzt `updated_at = deleted_at`.
   - `rev + 1` für die Gewinnerzeile.
5. **Quota:** Würde `used_bytes` (Summe `pages.bytes` nicht endgültig gelöschter Seiten) das Limit überschreiten → `rejected/quota`
   (nur für Seiten, die wachsen).

Antwort: `{"results":[{"id","status":"ok|conflict|rejected","code"?,"row"?:{…Serverstand…}}], "cursor": <users.seq>}`.
Bei `ok` und `conflict` enthält `row` den aktuellen Serverstand (bei Seiten ohne `strokes`, wenn er dem Push entspricht).
Der Client übernimmt `row` und setzt `dirty = 0`, **außer** die lokale Zeile wurde seit dem Absenden erneut geändert.
Das erkennt er an einem lokalen Zähler `lrev`, den jede lokale Änderung erhöht: Dann bleibt `dirty = 1`, und nur `rev` wird aktualisiert.
Bei `rejected` behält der Client die Zeile (`dirty = 2` = „hängt“) und zeigt einen Fehler im Status.

### 5.3 Pull (`sync_pull`)
`GET api.php?r=sync_pull&since=<cursor>&limit=200` → alle eigenen Zeilen mit `seq > since`, nach `seq` sortiert,
höchstens `limit` Zeilen bzw. etwa 4 MB. Antwort `{"items":[{"kind","row"}], "cursor":<höchste gelieferte seq>, "more":bool, "reset":bool}`.
- Lokale Zeile `dirty = 0` → durch `row` ersetzen. Lokale Zeile `dirty ≥ 1` → nur `rev` übernehmen **nicht**
  (sie wird beim nächsten Push als Konflikt aufgelöst). Die lokale Zeile bleibt.
- `row.purged = 1` → lokal endgültig entfernen (inkl. `thumbs`).
- `reset = true`, wenn `since < users.purge_floor`: Der Client holt alles neu (`since = 0`) und entfernt danach
  lokale Zeilen mit `dirty = 0`, die nicht mehr geliefert wurden.

### 5.4 Ablauf im Client (`sync.js`)
- Auslöser: App-Start, `online`-Ereignis, Rückkehr in den Vordergrund, alle 60 s, und 3 s nach einer lokalen
  Änderung (entprellt, höchstens alle 3 s).
- Ein Durchlauf: **Push** (bis nichts mehr `dirty = 1` ist) → **Pull** (bis `more = false`). Es läuft nie mehr als ein Durchlauf gleichzeitig.
- Fehler: Netzfehler → Status `offline`, nächster Versuch mit Backoff (5 s … 5 min). 401 → Status `auth`, die App zeigt
  den Login. Die Daten bleiben erhalten, nach dem Login geht es weiter.
- Benutzerwechsel: Jeder Benutzer hat eine eigene IndexedDB. Daten fremder Benutzer werden nie hochgeladen.

### 5.5 Papierkorb im Datenmodell
- Ordner löschen setzt nur beim Ordner `deleted_at`. Unterordner und Notizen gelten als „mitgelöscht“, solange ein Vorfahr
  gelöscht ist (Berechnung im Client und in `tree.php`). Wiederherstellen setzt `deleted_at = null`.
- „Endgültig löschen“ / „Papierkorb leeren“ setzt `purged = 1` am gelöschten Element. Der Server leert dann
  `strokes`/`name`/`title`, löscht alle Nachkommen-Zeilen ebenfalls mit `purged = 1` und setzt `deleted_at` falls leer.

### 5.6 Bereinigung (Server, höchstens einmal pro Tag und Benutzer, beim `sync_pull`)
- Elemente mit `deleted_at` älter als 30 Tage werden `purged = 1` (wie 5.5).
- Grabsteine (`purged = 1`) älter als 30 Tage werden physisch gelöscht. Dabei setzt der Server
  `users.purge_floor = users.seq`, sodass Clients, die länger offline waren, einen `reset` bekommen.
- `used_bytes` wird neu berechnet.

### 5.7 Reihenfolge der Seiten
`pos` ist eine Gleitkommazahl. Neue Seite am Ende: `max(pos) + 1`. Zwischen zwei Seiten: Mittelwert. Seiten zweier Geräte
kollidieren dadurch nicht. Sind die Abstände kleiner als 1e-9, nummeriert der Client die Notiz neu (1, 2, 3 …).

## 6. Authentifizierung und Sicherheit
- Passwörter: `password_hash(PASSWORD_DEFAULT)`, Prüfung mit `password_verify`, `password_needs_rehash` beim Login.
- Sitzung: Zufallswert 32 Byte (base64url) im Cookie `notizen_sid`, `Path=/games/notizen/; HttpOnly; Secure; SameSite=Strict`,
  `Max-Age` 60 Tage. In der DB steht nur der SHA-256 (`id_hash`). `last_seen_at`/`expires_at` werden höchstens einmal pro Stunde
  fortgeschrieben (gleitend 60 Tage). Sperren, Passwort-Reset und Löschen beenden alle Sitzungen des Benutzers.
- CSRF: `csrf`-Token (32 Byte) pro Sitzung, kommt mit `login`/`me` zum Client (nur im Speicher), wird als `X-CSRF-Token` gesendet.
- Login-Bremse: Vor der Prüfung werden die Fehlversuche der letzten 15 min gezählt. Ab 5 für den Benutzernamen oder ab
  20 für die IP antwortet der Server mit 429. Fehlversuche werden protokolliert, Einträge älter als 1 Tag gelöscht. Unbekannter
  Benutzer und falsches Passwort liefern dieselbe Antwort, und `password_verify` läuft auch bei unbekannten Benutzern
  (gegen einen Dummy-Hash), damit die Antwortzeit nichts verrät.
- Rechte: Jede Datenabfrage filtert auf `user_id = <angemeldeter Benutzer>`. Fremde Daten liest nur `tree.php`, und zwar
  nach der Prüfung `can_read_note()` (Freigabe) bzw. `require_admin()`.
- Header (über `.htaccess` und zusätzlich in `bootstrap.php` für `api.php`):
  `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cache-Control: no-store` für die API.
- Ausgabe: Die UI setzt Benutzertexte nur über `textContent` und Attribute, nie über `innerHTML`.
- `.htaccess` verweigert den Zugriff auf `lib/`, `migrations/`, `test/`, `docs/`, `config*.php`, `*.md`, `*.sql`.

### 6.1 Konfiguration und Erst-Admin
`config.php` (vom Deploy erzeugt):
```php
<?php return [
  'db' => ['host' => '…', 'name' => '…', 'user' => '…', 'pass' => '…', 'prefix' => 'notizen_'],
  'base_path' => '/games/notizen/',
  'cookie_secure' => true,
  'admin' => ['username' => '…', 'password_hash' => '<bcrypt>', 'fp' => '<sha256(username . "\n" . passwort)>'],
];
```
`bootstrap.php` liest `settings.schema_version`. Liegt sie unter der höchsten Datei in `migrations/`, laufen die fehlenden
Migrationen (mit `GET_LOCK`, damit sie nicht doppelt laufen). Danach: Weicht `settings.admin_fp` von `config.admin.fp` ab,
wird der Admin angelegt bzw. sein Passwort auf `password_hash` gesetzt, `role = admin`, `status = active`,
`must_change_pw = 0`, alle seine Sitzungen beendet, `admin_fp` gespeichert. Das ist eine einzige Abfrage pro Request, solange
nichts zu tun ist.

## 7. Frontend

### 7.1 Module und Schnittstellen (verbindlich)

**`js/config.js`**
```js
export const PAGE = { p: { w: 2100, h: 2970 }, l: { w: 2970, h: 2100 } };      // 0,1 mm
export const PAPERS = ['blank', 'lined', 'grid', 'dotted'];
export const PEN_COLORS = ['#1a1a1a', '#1f3a93', '#c0392b', '#1e8449', '#e67e22', '#7d3c98'];
export const PEN_WIDTHS = [4, 7, 12];                 // Grundbreite in 0,1 mm
export const HL_COLORS = ['#ffe600', '#7dff6b', '#ff7ad9'];
export const HL_WIDTH = 50; export const HL_ALPHA = 0.35;
export const PAPER_STYLE = { lineColor: '#b8c7dd', dotColor: '#9aa7b8', lined: 80, grid: 50, dotted: 50, margin: 250 };
```

**`js/api.js`**: `api.get(route, params?)`, `api.post(route, body?)` → `Promise<object>`. Wirft `ApiError {status, code, message}`,
Netzfehler als `ApiError {status: 0, code: 'network'}`. `api.setCsrf(token)`. Bei 401 löst er zusätzlich
`window.dispatchEvent(new CustomEvent('notizen:unauthorized'))` aus.

**`js/db.js`**: `openDb(userId) → Promise<Db>`, `deleteDb(userId)`. `Db`: `get(store, key)`, `put(store, obj)`, `del(store, key)`,
`all(store)`, `byIndex(store, index, value)`, `tx(stores, mode, fn(txStores))`, `close()`.

**`js/model.js`** (einzige Stelle, die lokale Daten schreibt; setzt `updated_at`, `dirty`, `lrev`, stößt Sync an)
```js
init(user) / close()
on(event, fn) / off(event, fn)        // 'change' {kind, id} · 'sync' SyncStatus
// Ordner
listFolders() → Folder[] (nicht gelöscht) · createFolder({name, parentId}) → Folder · renameFolder(id, name)
moveFolder(id, parentId)  // wirft bei Zyklus · deleteFolder(id) · restoreFolder(id)
// Notizen
listNotes(folderId|null) → Note[] · getNote(id) · createNote({title, folderId, paper, orient}) → Note (mit 1. Seite)
renameNote(id, title) · moveNote(id, folderId) · deleteNote(id) · restoreNote(id)
// Seiten
listPages(noteId) → Page[] (nach pos) · getPage(id) · addPage(noteId, afterPageId|null, {paper, orient}) → Page
deletePage(id) · setPaper(id, paper, orient) · saveStrokes(pageId, strokesString)
// Papierkorb, Suche
listTrash() → {folders, notes} · purge(kind, id) · emptyTrash() · search(q) → {folders, notes}
syncStatus() → {state: 'idle'|'syncing'|'offline'|'auth'|'error', pending, lastSync, error?} · syncNow()
```

**`js/ink/stroke.js`**: `smoothPoints(raw) → Int32Array` (Eingabeglättung, Entdoppelung), `outline(stroke, scale?) → Float32Array`
(geschlossenes Polygon x,y,… in Seitenkoordinaten für Stift; für Textmarker die Mittellinie), `hitTest(stroke, x, y, r) → bool`,
`bbox(stroke) → [minX, minY, maxX, maxY]`.

**`js/ink/paper.js`**: `paperGeometry(paper, orient) → {lines: Float32Array /* x1,y1,x2,y2,… */, dots: Float32Array /* x,y,… */, margin: [x1,y1,x2,y2]|null}`.

**`js/ink/render.js`**: `drawPaper(ctx, page, scale)`, `drawStroke(ctx, stroke, scale)`, `drawPage(ctx, page, strokes, scale)`
(Papier → alle Textmarker → alle Stifte).

**`js/ink/surface.js`**
```js
createSurface(container, { readOnly = false, fingerDraw = false }) → Surface
Surface: setPages(pages /* Page[] inkl. strokes-String */) · updatePage(page) · setTool({kind: 'pen'|'highlighter'|'eraser', color, width})
         undo() · redo() · canUndo() · canRedo() · scrollToPage(id) · currentPageId() · setFingerDraw(bool) · destroy()
Ereignisse (EventTarget): 'strokes' {pageId, strokes /* String */} · 'pagechange' {pageId} · 'history' {canUndo, canRedo}
```

**`js/export/pdf.js`**: `notePdf(note, pages) → Promise<Blob>` (nutzt `paper.js`, `stroke.js`, `codec.js`).
**`js/export/backup.js`**: `exportAll(model) → Promise<Blob>`, `importBackup(model, file) → Promise<{folders, notes, pages}>`.

### 7.2 Eingabe und Zeichnen (Kern von `surface.js`)
- Die Zeichenfläche hat `touch-action: none` und `user-select: none`. **Viewport selbst gebaut**: Ein Finger verschiebt
  (mit Trägheit), zwei Finger zoomen um den Mittelpunkt (100–400 %). Die Seiten liegen untereinander in einem Container,
  der per `transform` bewegt wird. Nativer Safari-Zoom ist per Viewport-Meta aus.
- Zeichnen nur bei `pointerType === 'pen'` (Ausnahme `fingerDraw`: dann `touch`/`mouse` mit einem Finger zeichnen, zwei Finger
  verschieben/zoomen). `touch`-Pointer während eines Stiftstrichs werden ignoriert (Handballen).
- Punkte aus `getCoalescedEvents()` (falls vorhanden), Druck `pressure` (Pencil 0–1; 0 oder 0,5 ohne Druck → 128).
- **Live-Ebene:** ein einzelnes Overlay-Canvas über der aktuellen Seite. Der laufende Strich wird pro Frame
  (`requestAnimationFrame`) inkrementell gezeichnet (nur neue Segmente), mit `getContext('2d', {desynchronized: true})`, wo verfügbar.
  Bei `pointerup` wird der Strich in die Seite übernommen (nur dieser Strich wird auf das Seiten-Canvas gezeichnet), und das Overlay wird geleert.
- **Seiten-Canvas:** eines pro **sichtbarer** Seite (plus eine davor und danach). Unsichtbare Seiten geben ihr Canvas frei
  (`width = height = 0`), weil iOS den gesamten Canvas-Speicher begrenzt. Auflösung = Anzeigegröße × `devicePixelRatio`,
  begrenzt auf 4096 px Kantenlänge. Während einer Zoom-Geste wird per CSS skaliert und nach der Geste scharf neu gezeichnet.
- **Radierer:** Treffertest gegen Striche der Seite (Gitter-Index pro Seite, Zellen 200 × 200), entfernte Striche → Seite neu zeichnen.
- **Undo/Redo:** Befehle `add {pageId, stroke}` / `erase {pageId, strokes[]}` pro geöffneter Notiz, maximal 100.
- **Speichern:** Nach jeder Änderung `'strokes'`-Ereignis, entprellt auf 400 ms pro Seite. Bei `visibilitychange`/`pagehide`
  sofort. `editor.js` ruft dann `model.saveStrokes`.

### 7.3 Service Worker
`sw.js`, Cache `notizen-v<N>` (`CACHE_NAME`), löscht beim Aktivieren nur Caches mit Präfix `notizen-`. Die App-Shell
(HTML, CSS, JS, Icons, Manifest) ist cache-first mit Hintergrund-Aktualisierung. `api.php` und `admin.html` gehen nie in den Cache.
Beim Start ruft die App `navigator.storage.persist()` auf.

## 8. Deploy

- `pages.yml`: `notizen/` wird von GitHub Pages **ausgeschlossen** (`--exclude 'notizen/'`). Die Startseiten-Karte verlinkt auf
  `https://phpexpert.de/games/notizen/`.
- `deploy-backend.yml`, erweitert:
  - Auslöser zusätzlich `notizen/**` (ohne `*.md`, `docs/`, `test/`).
  - Testschritt: `php -l` für alle PHP-Dateien, `php notizen/test/php/run.php` gegen einen MariaDB-Service-Container,
    `node --test notizen/test/js/`.
  - Upload-Ordner `site/notizen/` = `notizen/` ohne `test/`, `docs/`, `*.md`, `package*.json`, `config.example.php`.
    `config.php` wird aus den Secrets `NOTIZEN_DB_*` und `NOTIZEN_ADMIN_*` erzeugt; der bcrypt-Hash entsteht im Runner
    mit `php -r 'echo password_hash(getenv("P"), PASSWORD_DEFAULT);'`.
    Fehlen die Notizen-Secrets, wird Notizen übersprungen (Warnung), die anderen Backends laufen weiter.
  - Live-Check: `https://phpexpert.de/games/notizen/api.php?r=ping` → 200.
- Lokal entwickeln: MariaDB im Container, `config.php` aus `config.example.php`, `php -S localhost:8080 -t .` im
  Repo-Wurzelordner, App unter `http://localhost:8080/notizen/`. `cookie_secure = false` und `base_path = '/notizen/'` nur lokal.

## 9. Tests
- **PHP** (`test/php/run.php`, ohne Framework, eigene `assert_eq`-Helfer): Login/Bremse/Sperre, Sitzung und CSRF,
  Sync (neu, Update, Konflikt Ordner/Notiz, Konflikt Seite → Kopie, Löschen gegen Bearbeiten, Grabsteine, reset, Quota),
  **Isolation** (Benutzer B kann A's IDs weder lesen noch überschreiben), Teilen (Ordner rekursiv, Notiz, gesperrter Besitzer,
  gelöschte Elemente), Admin (Schutzregeln letzter Admin, Protokoll), Erst-Admin aus config.
- **JS** (`node --test`): codec (Rundreise), stroke (Glättung, Umriss, Treffertest), paper (Abstände), pdf (gültige Struktur:
  xref-Offsets, Seitenzahl), Sync-Zusammenführung als reine Funktion `mergePulled(local, row)` / `applyPushResult(local, sent, result)`.
- **E2E** (Playwright): Login → Ordner → Notiz → Pencil-Striche per `PointerEvent` mit `pointerType: 'pen'` → Neuladen → Striche da;
  Offline (Context offline) schreiben → online → auf zweitem Context sichtbar; Konflikt zweier Contexts → Kopie-Seite;
  Teilen nur lesen; Admin legt Benutzer an, Erstanmeldung erzwingt Passwortwechsel.
