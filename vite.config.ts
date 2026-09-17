import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// viteSingleFile bettet JS, CSS und Bilder direkt in dist/index.html ein.
// Notwendig, weil externe <script type="module">-Dateien beim Öffnen per
// Doppelklick (file://) von der CORS-Regel des Browsers blockiert werden.
// So bleibt dist/index.html eine einzige, offline lauffähige Datei.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
  build: {
    // Auch Bilder als data:-URL einbetten -> dist/index.html läuft allein
    assetsInlineLimit: 100_000_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
