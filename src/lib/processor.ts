import { lookupProduct } from './products'

export type ProductRow = {
  id: string
  modelo: string
  cantidad: number
  itemDin: string
  proto: string
  nombre: string
  qr: string
  sistema: string
  trazabilidad: string
}

const MCP = [{ type: 'url', url: 'https://drivemcp.googleapis.com/mcp/v1', name: 'google-drive' }]
const MAX_PDF_SIZE = 4 * 1024 * 1024 // 4MB limit for direct API

export async function callClaude(content: unknown[], useMcp = false): Promise<unknown> {
  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content }],
  }
  if (useMcp) body.mcp_servers = MCP
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export function getText(d: unknown): string {
  const data = d as { content?: { type: string; text: string }[] }
  return (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
}

export function getMcpResult(d: unknown): Record<string, unknown> | null {
  const data = d as { content?: { type: string; content?: { text: string }[] }[] }
  for (const r of (data?.content || []).filter(b => b.type === 'mcp_tool_result')) {
    try { const p = JSON.parse(r.content?.[0]?.text || ''); if (p) return p } catch {}
  }
  return null
}

export function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = e => res((e.target!.result as string).split(',')[1])
    reader.onerror = rej
    reader.readAsDataURL(file)
  })
}

export function todayFormatted(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Smart PDF parser — uses server-side text extraction for large files
async function parsePDF(file: File, type: 'invoice' | 'din'): Promise<unknown> {
  const b64 = await toBase64(file)

  if (file.size > MAX_PDF_SIZE) {
    // Large file: extract text server-side first
    const res = await fetch('/api/extract-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: b64, type }),
    })
    if (!res.ok) throw new Error(`PDF extract error ${res.status}`)
    return res.json()
  } else {
    // Small file: send PDF directly to Claude
    const prompt = type === 'invoice'
      ? `This commercial invoice may have TWO code columns: a long supplier code (like "09431-Z-BOLT") and a shorter product CODE (like "09431").
Respond ONLY with JSON (no markdown):
{"invoiceNum":"...","trazabilidad":"MM/YYYY","products":[{"modelo":"09431","cantidad":10416},...]}
- invoiceNum: invoice reference number
- trazabilidad: invoice date as MM/YYYY
- modelo: use ONLY the shorter CODE column (numeric), NOT the supplier code with dashes
- cantidad: quantity in PCS/units`
      : `Extract from this Chilean DIN (Declaración de Ingreso) and respond ONLY with JSON (no markdown):
{"dinNum":"3630750509-0","items":[{"itemNum":"1","quantity":20000},{"itemNum":"2","quantity":5000},...]}
- dinNum: NUMERO DE IDENTIFICACION
- items: all items with item number and PCS quantity (look for "000XXXXX.000000 PCS" pattern)`

    return callClaude([
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
      { type: 'text', text: prompt }
    ])
  }
}

export async function parseInvoice(file: File): Promise<{ invoiceNum: string; trazabilidad: string; products: { modelo: string; cantidad: number }[] }> {
  const data = await parsePDF(file, 'invoice')
  const txt = getText(data)
  return JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}')
}

export async function parseDIN(file: File): Promise<{ dinNum: string; items: { itemNum: string; quantity: number }[] }> {
  const data = await parsePDF(file, 'din')
  const txt = getText(data)
  return JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] || '{}')
}

export function crossWithBD(
  invProducts: { modelo: string; cantidad: number }[],
  dinItems: { itemNum: string; quantity: number }[],
  trazabilidad: string
): ProductRow[] {
  const rows: ProductRow[] = []
  for (const prod of invProducts) {
    const entry = lookupProduct(prod.modelo)
    if (!entry) continue
    let bestItem = '', bestDiff = Infinity
    for (const di of dinItems) {
      const diff = Math.abs(di.quantity - prod.cantidad)
      if (diff < bestDiff) { bestDiff = diff; bestItem = `ITEM ${di.itemNum}` }
    }
    const matched = bestDiff < prod.cantidad * 0.6 ? bestItem : ''
    rows.push({
      id: Math.random().toString(36).slice(2),
      modelo: prod.modelo, cantidad: prod.cantidad,
      itemDin: matched, proto: entry.proto, nombre: entry.nombre,
      qr: String(entry.qr), sistema: entry.sistema, trazabilidad,
    })
  }
  return rows
}

export async function generateExcel(rows: ProductRow[], invoiceNum: string, dinNum: string): Promise<string> {
  const prodLines = rows.map((r, i) =>
    `Row ${11 + i}: B="${r.nombre}", C="${r.proto}", D="${r.modelo}", E=${r.cantidad}, G="${r.trazabilidad}", H="${r.qr}", I="${r.sistema}", K="${dinNum}", L="${r.itemDin}", M="${invoiceNum}"`
  ).join('\n')
  const data = await callClaude([{ type: 'text', text: `Create an Excel file using Python openpyxl and return ONLY the base64 string. No explanation, no markdown.
Sheet: "SOLICITUD DE INSPECCION"
A1="FORM 131-503-001" D1="Rev. 03   Jun-2025"
B2="SOLICITUD DE CERTIFICACIÓN DE SEGUIMIENTOS MÁS DECLARACIÓN DE CONFORMIDAD"
B3="Fecha Solicitud" D3="${todayFormatted()}"
B4="Razón social del solicitante" D4="Representaciones Grantt Ltda"
B5="RUT del solicitante" D5="99.582.120-6"
B6="Nombre del representante legal" D6="Cristobal Vigil"
B7="Rut del representante legal" D7="10.288.069-2"
B8="Lugar a realizar el muestreo" D8="Santa Margarita #0742, San Bernardo"
B9="Ensayo solicitado (Seguimiento, Producción, Comercio)" D9="Seguimiento"
Row 10 headers: A10="N.º de SOLICITUD (Llenado por organismo certificador)" B10="Producto" C10="Protocolo" D10="Modelo" E10="Cantidad del producto, tamaño del lote o partida" F10="N.º de MUESTRA (Llenado por organismo certificador)" G10="Identificación o trazabilidad (N° de serie o mes año)" H10="N° del código QR o N° de certificado de aprobación" I10="Sistema de certificacion" J10="Rango de control (Solo aplica sistema 2)" K10="Nº DIN (Indicar y adjuntarla en mail)" L10="ítems en DIN" M10="Invoice o Factura (Indicar y Adjuntarla en mail)"
${prodLines}
Use: import io,base64,openpyxl; write to BytesIO; print only base64 string.` }])
  const txt = getText(data)
  return txt.match(/[A-Za-z0-9+/]{100,}={0,2}/)?.[0] || txt.replace(/```[\s\S]*?```/g, '').replace(/\s/g, '').trim()
}

export async function createDriveFolder(invoiceNum: string, parentFolderId?: string): Promise<string> {
  const data = await callClaude([{
    type: 'text',
    text: `Create a folder named "${invoiceNum}" in Google Drive${parentFolderId ? ` inside folder ID "${parentFolderId}"` : ''}. Return only the new folder ID.`
  }], true)
  const result = getMcpResult(data)
  return (result?.id as string) || ''
}

export async function uploadFileToDrive(b64: string, fileName: string, mimeType: string, folderId: string): Promise<string> {
  const data = await callClaude([{
    type: 'text',
    text: `Upload a file named "${fileName}" with mime type "${mimeType}" to Google Drive folder ID "${folderId}". Base64 content: ${b64}. Return the file's webViewLink.`
  }], true)
  const result = getMcpResult(data)
  return (result?.webViewLink as string) || (result?.id ? `https://drive.google.com/file/d/${result.id}/view` : '')
}

export async function uploadToDrive(b64: string, fileName: string, folderId?: string): Promise<string> {
  return uploadFileToDrive(b64, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', folderId || '')
}
