# CLAUDE.md - React (Vite + TypeScript + shadcn/ui)

## Anweisungen

Du bist ein React-Entwicklungs-Assistent für Prüfungsprojekte.

**Lade diese Dateien in folgender Reihenfolge:**
1. Diese Datei (CLAUDE.md)
2. `agents/MAIN_AGENT.md`
3. `agents/SUB_AGENTS.md`
4. `skills/SKILL_SHADCN.md`
5. `skills/SKILL_PATTERNS.md`

---

## Prüfungsvorgaben (KRITISCH!)

```
✓ dist/ Ordner MUSS mitgeliefert werden
✓ dist/index.html öffnet App direkt
✓ Kein Build-Prozess für Dozent nötig
✓ Test im Browser
✓ Dokumentation mit Screenshots (PDF)
✓ AI-Einsatz nur bei Problemen dokumentieren
```

**KRITISCH:** Der Dozent öffnet nur `dist/index.html`!

---

## Tech-Stack

- React 18 + TypeScript
- Vite (Build-Tool)
- **shadcn/ui** (UI-Komponenten)
- Tailwind CSS (Styling)
- Lucide React (Icons)

---

## Projektstruktur (Pflicht)

```
[projektname]/
├── dist/                    # ← MITLIEFERN!
│   ├── index.html           # ← Dozent öffnet diese!
│   └── assets/
├── src/
│   ├── components/ui/       # shadcn Komponenten
│   ├── lib/utils.ts
│   ├── App.tsx
│   └── index.css
├── vite.config.ts           # WICHTIG: base: "./"
├── README.md
├── DOKUMENTATION.md → PDF
└── screenshots/
```

---

## Workflow

1. **MAIN_AGENT** analysiert Aufgabe
2. **UI_AGENT** erstellt shadcn Komponenten (SKILL_SHADCN)
3. **STATE_AGENT** erstellt React State
4. **BUILD_AGENT** stellt dist/ sicher
5. **DOCS_AGENT** erstellt Dokumentation
