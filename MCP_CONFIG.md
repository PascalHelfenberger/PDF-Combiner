# MCP Server - React (Vite + shadcn/ui)

## Empfohlene MCP Server

### 1. shadcn/ui Documentation MCP
```json
{
  "mcpServers": {
    "shadcn-docs": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-fetch"]
    }
  }
}
```

**Wichtige URLs:**
- https://ui.shadcn.com/docs
- https://ui.shadcn.com/docs/components/button
- https://ui.shadcn.com/docs/components/card
- https://ui.shadcn.com/docs/components/dialog

---

### 2. React Documentation MCP
```json
{
  "mcpServers": {
    "react-docs": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-fetch"]
    }
  }
}
```

**Wichtige URLs:**
- https://react.dev/learn
- https://react.dev/reference/react

---

### 3. Tailwind CSS Documentation MCP
```json
{
  "mcpServers": {
    "tailwind-docs": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-fetch"]
    }
  }
}
```

**Wichtige URLs:**
- https://tailwindcss.com/docs
- https://tailwindcss.com/docs/customizing-colors

---

### 4. Radix UI Documentation MCP (shadcn Basis)
```json
{
  "mcpServers": {
    "radix-docs": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-fetch"]
    }
  }
}
```

**Wichtige URLs:**
- https://www.radix-ui.com/primitives/docs/overview/introduction
- https://www.radix-ui.com/primitives/docs/components/dialog

---

### 5. Lucide Icons MCP
```json
{
  "mcpServers": {
    "lucide-docs": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-fetch"]
    }
  }
}
```

**Wichtige URLs:**
- https://lucide.dev/icons/
- https://lucide.dev/guide/packages/lucide-react

---

### 6. Vite Documentation MCP
```json
{
  "mcpServers": {
    "vite-docs": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-fetch"]
    }
  }
}
```

**Wichtige URLs:**
- https://vitejs.dev/guide/
- https://vitejs.dev/config/

---

### 7. GitHub MCP
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-token>"
      }
    }
  }
}
```

**Nützliche Repositories:**
- `shadcn-ui/ui` - shadcn/ui Source Code
- `shadcn-ui/taxonomy` - Beispiel-App
- `tailwindlabs/tailwindcss` - Tailwind CSS

---

### 8. Filesystem MCP
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/your/react/projects"
      ]
    }
  }
}
```

---

## Vollständige MCP Konfiguration

### Claude Desktop: `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-fetch"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-token>"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/YOU/WebProjects"
      ]
    }
  }
}
```

---

## Nützliche Prompts mit MCP

### shadcn Komponente abrufen
```
Hole die Dokumentation für die shadcn Dialog-Komponente von:
https://ui.shadcn.com/docs/components/dialog
```

### Tailwind Klassen finden
```
Hole die Tailwind-Dokumentation für Flexbox von:
https://tailwindcss.com/docs/flex
```

### Icon suchen
```
Suche nach Icons auf:
https://lucide.dev/icons/
```

### Radix Primitive verstehen
```
Hole die Radix-Dokumentation für Checkbox von:
https://www.radix-ui.com/primitives/docs/components/checkbox
```

---

## Wichtige Dokumentations-URLs

| Thema | URL |
|-------|-----|
| **shadcn/ui** | |
| Installation | https://ui.shadcn.com/docs/installation |
| Komponenten | https://ui.shadcn.com/docs/components |
| Theming | https://ui.shadcn.com/docs/theming |
| Dark Mode | https://ui.shadcn.com/docs/dark-mode |
| **React** | |
| Hooks | https://react.dev/reference/react |
| useState | https://react.dev/reference/react/useState |
| useEffect | https://react.dev/reference/react/useEffect |
| **Tailwind** | |
| Utility Classes | https://tailwindcss.com/docs/utility-first |
| Responsive | https://tailwindcss.com/docs/responsive-design |
| Dark Mode | https://tailwindcss.com/docs/dark-mode |
| **Vite** | |
| Config | https://vitejs.dev/config/ |
| Build | https://vitejs.dev/guide/build.html |
| **Icons** | |
| Lucide React | https://lucide.dev/guide/packages/lucide-react |
| Icon-Suche | https://lucide.dev/icons/ |

---

## shadcn/ui CLI Referenz

```bash
# Initialisieren
npx shadcn@latest init

# Komponente hinzufügen
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add dialog
npx shadcn@latest add checkbox
npx shadcn@latest add tabs
npx shadcn@latest add alert
npx shadcn@latest add toast

# Mehrere auf einmal
npx shadcn@latest add button card input dialog
```
