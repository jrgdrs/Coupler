Setze eine neue Versionsnummer.

Argumente: $ARGUMENTS (z.B. "5.4.22" oder "5.5.0")

Vorgehen:
1. Suche in src/html/template.html nach der aktuellen Version (Muster: v\d+\.\d+\.\d+)
2. Zeige die gefundene Stelle und aktuelle Version
3. Ersetze mit der neuen Version aus $ARGUMENTS (alle Fundstellen in template.html)
4. Führe danach `bash make.sh` aus um die Änderung zu bauen und in docs/ zu übernehmen
5. Zeige git diff --stat als Zusammenfassung

Hinweis: build.js übernimmt die Version automatisch beim Assemblieren aus template.html.
