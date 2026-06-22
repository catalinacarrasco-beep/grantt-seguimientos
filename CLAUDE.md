# AutoSeguimiento Grantt — Contexto para Claude Code

## Qué es este proyecto
App web que automatiza la generación del formulario "Solicitud de Seguimiento"
(Cesmec FORM 131-503-001) para certificación SEC de productos eléctricos importados.
Lee Invoice PDF + DIN PDF, cruza con BD Maestra, genera Excel formateado y sube a Drive.

## Accesos
- App: https://grantt-seguimientos.vercel.app
- GitHub: catalinacarrasco-beep/grantt-seguimientos
- Credenciales: ver instrucciones del proyecto en Claude (proyecto CERTIFICACIONES)

## Stack
- Frontend: React + Vite + TypeScript → Vercel
- Auth + historial: Supabase
- Almacenamiento: Google Drive (PDFs + Excel)
- AI: Claude Sonnet 4.6 via proxy /api/claude.js
- Excel: exceljs via /api/generate-excel.js (logo en api/logo.png)
- Drive: /api/drive.js via MCP Google Drive

## Estructura
```
src/lib/processor.ts        — parseo PDF, cruce BD, subset-sum, llamadas API
src/lib/products.ts         — lookup BD con normalización de códigos + lista negra
src/lib/productsDB.json     — 154 códigos certificables
src/lib/noChertCodes.json   — 138 códigos NO certificables (lista negra)
src/pages/NuevoPage.tsx     — UI 3 pasos: Subir → Revisar → Listo
src/pages/HistorialPage.tsx — historial
src/pages/ConfigPage.tsx    — config carpeta Drive
api/claude.js               — proxy Anthropic (evita CORS)
api/drive.js                — subida a Google Drive via MCP
api/generate-excel.js       — genera XLSX con exceljs (estilos + logo)
api/extract-pdf.js          — extrae texto PDFs >4MB
api/logo.png                — logo Bureau Veritas / Cesmec
```

## Flujo
1. Sube Invoice PDF + DIN PDF + ID carpeta Drive
2. Claude API lee Invoice → modelos y cantidades
3. Claude API lee DIN → número e ítems PCS
4. Cruce con productsDB.json → filtra certificables
5. Subset-sum exacto asigna ítems DIN
6. Revisión manual de productos
7. /api/generate-excel → XLSX con exceljs
8. /api/drive → sube Excel + PDFs a Drive
9. Supabase → guarda historial

## Reglas Críticas

### BD Maestra
- Solo SE CERTIFICA = "SI"
- Registro más reciente por fecha de ingreso
- 2 hojas: "DB desde informe HC" (HX-) y "Registros importaciones" (BO-)
- Lista negra tiene prioridad absoluta

### Normalización códigos
- "09431" → "9431" (strip ceros)
- "HX PLPE27A-B" → "HX-PLPE27A-B" (espacio → guión)
- Todo uppercase

### Ítems DIN
- Subset-sum EXACTO: suma cantidades = cantidad ítem DIN
- Invoices Primmus: usar código corto (numérico, no el del proveedor)

## Formato Excel FORM 131-503-001
Col B = Protocolo (OJO: header dice "Producto")
Col C = Descripción producto (OJO: header dice "Protocolo")
Col D = Modelo, E = Cantidad, G = Trazabilidad MM/AAAA
Col H = QR, I = Sistema cert, K = N°DIN, L = Ítem DIN, M = Invoice
Productos desde fila 13 (índice 12)

Sistemas: default "Sistema 1, codigo 013"
Excepciones: E-013-01-118357→016, E-013-01-118358→017, E-013-01-180144→015

## Comandos
```bash
git clone https://github.com/catalinacarrasco-beep/grantt-seguimientos
cd grantt-seguimientos
npm install
npm run dev          # desarrollo local
npm run build        # SIEMPRE así, nunca tsc directamente
```

## Problemas conocidos
- 400 Drive carpeta compartida → usuario pega ID de carpeta propia
- 413 PDF grande → /api/extract-pdf.js extrae texto server-side
- 429 rate limit → 2 fases + pausa natural entre ellas
- Build falla → usar "vite build" no "tsc && vite build"
