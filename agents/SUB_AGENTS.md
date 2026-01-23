# SUB_AGENTS - React Spezialisierte Agents

## UI_AGENT - shadcn/ui Builder

### Rolle
Erstellt UI mit shadcn/ui Komponenten und Tailwind CSS.

### shadcn Komponenten
```bash
# Basis
npx shadcn@latest add button card input checkbox

# Formulare
npx shadcn@latest add label select textarea

# Feedback
npx shadcn@latest add alert toast dialog

# Layout
npx shadcn@latest add tabs separator
```

### Import Pattern
```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2 } from 'lucide-react'
```

### Tailwind Klassen
```tsx
// Layout
<div className="min-h-screen bg-background">
<div className="container mx-auto py-8">
<div className="max-w-2xl mx-auto">

// Spacing
<div className="space-y-4">
<div className="flex gap-2">
<div className="p-4">

// Text
<p className="text-muted-foreground">
<h1 className="text-2xl font-bold">

// Flex
<div className="flex items-center justify-between">
<div className="flex-1">
```

---

## STATE_AGENT - React State

### Rolle
Verwaltet React State und Logik.

### useState Pattern
```tsx
const [items, setItems] = useState<Item[]>([])
const [inputText, setInputText] = useState('')

const addItem = () => {
  if (inputText.trim()) {
    setItems([...items, { 
      id: Date.now(), 
      text: inputText.trim(),
      completed: false 
    }])
    setInputText('')
  }
}
```

### useEffect für Persistenz
```tsx
// Laden beim Start
useEffect(() => {
  const saved = localStorage.getItem('items')
  if (saved) setItems(JSON.parse(saved))
}, [])

// Speichern bei Änderung
useEffect(() => {
  localStorage.setItem('items', JSON.stringify(items))
}, [items])
```

---

## BUILD_AGENT - Build Manager

### Rolle
Stellt korrekten Build und dist/ sicher.

### vite.config.ts (KRITISCH!)
```typescript
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  base: "./",  // ← OHNE DIES FUNKTIONIERT dist/ NICHT!
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

### Build-Checkliste
```
□ vite.config.ts hat base: "./"
□ npm run build erfolgreich
□ dist/ Ordner existiert
□ dist/index.html öffnet korrekt
□ Assets werden geladen
□ Keine 404 Fehler
```

---

## DOCS_AGENT - Dokumentation

### Rolle
Erstellt prüfungskonforme Dokumentation.

### WICHTIG: AI-Dokumentation
```
NUR dokumentieren wenn ein spezifisches Problem auftrat!

BEISPIEL (RICHTIG):
"Beim Implementieren des Dark Mode trat das Problem auf, 
dass die CSS-Variablen nicht korrekt geladen wurden.
Mit ChatGPT wurde erkannt, dass die Tailwind-Konfiguration 
für darkMode auf 'class' gesetzt werden muss."

BEISPIEL (FALSCH):
"shadcn/ui Komponenten wurden mit KI-Hilfe erstellt."
"Der gesamte Code stammt von Claude."
```

### Ausgabe
```markdown
## Vorgehen
1. Projekt mit Vite erstellt
2. Tailwind und shadcn konfiguriert
3. Komponenten implementiert
4. Build erstellt

## Aufgetretene Probleme

### Problem: [Spezifisches Problem]
**Beschreibung:** [Was passierte]
**Lösung:** [Wie gelöst]
**AI-Hilfe:** [Falls verwendet]
```

---

## QA_AGENT - Qualitätsprüfung

### Checkliste
```
□ npm run build erfolgreich
□ dist/ Ordner vorhanden
□ dist/index.html öffnet korrekt
□ shadcn Styles laden
□ Icons werden angezeigt
□ Responsive Design funktioniert
□ Keine Console-Fehler
□ LocalStorage funktioniert (falls verwendet)
□ README.md vorhanden
□ DOKUMENTATION.md vorhanden
```

### Test-Prozess
```
1. npm run build
2. dist/index.html in Browser öffnen (nicht über Server!)
3. Alle Features testen
4. DevTools → Console prüfen
5. Mobile Ansicht testen
```
