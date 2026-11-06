# Offene Änderungseinträge

Jedes Paket legt hier **eine Datei** mit seinem Eintrag für den Änderungsverlauf an (Name nach Thema, z. B. `staub-bagger.md`), eine
Zeile Markdown ohne Versionsnummer, beginnend mit dem Titel in `**…**`, z. B.:

```
**Staubwolke am Bagger** (§6 „Bagger“, nur Bild): Solange ein Bagger an einer Zelle arbeitet, quillt dort eine Staubwolke auf.
```

Versionsnummer und `CACHE_VERSION` in `sw.js` **nicht** selbst setzen. Beim Zusammenführen auf `main` vergibt `npm run release` die
Nummern (je Datei die nächste Version, Cache einmal + 1), trägt sie oben in [docs/changelog.md](../changelog.md) ein und löscht die
Dateien hier. So kommen sich parallel arbeitende Agenten nicht in die Quere.
