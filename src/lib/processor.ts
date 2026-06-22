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
const MAX_PDF_SIZE = 4 * 1024 * 1024 // 4MB

// Wait between API calls to avoid 429 rate limit
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function callClaude(content: unknown[], useMcp = false): Promise<unknown> {
  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content }],
  }
  if (useMcp) body.mcp_servers = MCP

  // Retry up to 3 times on 429
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 429) {
      const waitTime = (attempt + 1) * 15000 // 15s, 30s, 45s
      console.log(`Rate limited, waiting ${waitTime/1000}s...`)
      await wait(waitTime)
      continue
    }
    if (!res.ok) throw new Error(`API error ${res.status}`)
    await wait(2000) // 2s pause after every successful call
    return res.json()
  }
  throw new Error('Rate limit exceeded after 3 retries')
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

async function parsePDF(file: File, type: 'invoice' | 'din'): Promise<unknown> {
  const b64 = await toBase64(file)

  if (file.size > MAX_PDF_SIZE) {
    const res = await fetch('/api/extract-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: b64, type }),
    })
    if (!res.ok) throw new Error(`PDF extract error ${res.status}`)
    return res.json()
  } else {
    const prompt = type === 'invoice'
      ? `Extract from this commercial invoice.
Return ONLY valid JSON, no markdown, no extra text.
Format: {"invoiceNum":"26FS-0301-3","trazabilidad":"04/2026","products":[{"modelo":"09431","cantidad":10416}]}
- invoiceNum: invoice reference number
- trazabilidad: invoice date as MM/YYYY
- modelo: if TWO code columns exist, use ONLY the shorter numeric code (like "09431"), NOT the supplier code with dashes (like "09431-Z-BOLT")
- cantidad: integer PCS quantity only`
      : `Extract from this Chilean DIN (Declaracion de Ingreso de Aduanas).
Return ONLY valid JSON, no markdown, no extra text.
Format: {"dinNum":"3630753019-2","items":[{"itemNum":"1","quantity":20160,"description":"PORTALAMPARAS E27"},{"itemNum":"2","quantity":5000,"description":"INTERRUPTORES"}]}
- dinNum: NUMERO DE IDENTIFICACION (format XXXXXXXXXX-X)
- items: ALL line items with their description in uppercase
- quantity must be integer PCS (look for patterns like "000017400.000000 PCS" -> 17400, or "17.400,000 PCS" -> 17400)
- quantity MUST be integer, never decimal
- IMPORTANT: Exclude any items whose description contains words related to PVC conduit, cable trunking, or accessories such as: PVC, CANALETA, TRUNKING, DUCTO, CONDUIT, ACCESORIO, FITTING, BRACKET, CLIPS, TAPA, UNION, CURVA, TEE`

    return callClaude([
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
      { type: 'text', text: prompt }
    ])
  }
}

function safeParseJSON(txt: string): Record<string, unknown> {
  // Try direct parse first
  const jsonMatch = txt.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {}
  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    // Clean control characters and try again
    const cleaned = jsonMatch[0]
      .replace(/[\x00-\x1F\x7F]/g, ' ')  // remove control chars
      .replace(/,\s*([\]\}])/g, '$1')       // remove trailing commas
    try {
      return JSON.parse(cleaned)
    } catch {
      return {}
    }
  }
}

export async function parseInvoice(file: File): Promise<{ invoiceNum: string; trazabilidad: string; products: { modelo: string; cantidad: number }[] }> {
  const data = await parsePDF(file, 'invoice')
  const txt = getText(data)
  return safeParseJSON(txt) as { invoiceNum: string; trazabilidad: string; products: { modelo: string; cantidad: number }[] }
}

const EXCLUDED_DIN_KEYWORDS = [
  'PVC', 'CANALETA', 'CANALETAS', 'TRUNKING', 'DUCTO', 'DUCTOS',
  'CONDUIT', 'ACCESORIO', 'ACCESORIOS', 'FITTING', 'FITTINGS',
  'BRACKET', 'CLIPS', 'TAPA', 'TAPAS', 'UNION', 'UNIONES',
  'CURVA', 'CURVAS', 'TEE',
]

function isExcludedDinItem(description: string): boolean {
  const upper = description.toUpperCase()
  return EXCLUDED_DIN_KEYWORDS.some(kw => upper.includes(kw))
}

export async function parseDIN(file: File): Promise<{ dinNum: string; items: { itemNum: string; quantity: number; description?: string }[] }> {
  const data = await parsePDF(file, 'din')
  const txt = getText(data)
  const raw = safeParseJSON(txt) as { dinNum: string; items: { itemNum: string; quantity: number; description?: string }[] }

  // Second line of defense: filter out canaletas/PVC regardless of what Claude returned
  if (raw.items) {
    const before = raw.items.length
    raw.items = raw.items.filter(item => {
      if (isExcludedDinItem(item.description || '')) {
        console.log(`[DIN] Descartando ítem ${item.itemNum} (${item.description})`)
        return false
      }
      return true
    })
    if (raw.items.length < before)
      console.log(`[DIN] Filtrados ${before - raw.items.length} ítems excluidos, quedan ${raw.items.length}`)
  }

  return raw
}

function findSubsetSumAssignments(
  certProducts: { modelo: string; cantidad: number }[],
  dinItems: { itemNum: string; quantity: number }[]
): Record<string, string> {
  const assignments: Record<string, string> = {}
  // Normalize all quantities to integers to avoid float comparison issues
  const products = certProducts.map(p => ({ ...p, cantidad: Math.round(p.cantidad) }))
  for (const p of products) assignments[p.modelo] = ''

  console.log('[SubsetSum] Productos certificables:', products.map(p => `${p.modelo}=${p.cantidad}`).join(', '))
  console.log('[SubsetSum] Ítems DIN:', dinItems.map(d => `ITEM ${d.itemNum}=${Math.round(d.quantity)}`).join(', '))

  // Sort DIN items smallest first so small items don't get consumed by larger ones
  const sortedDin = [...dinItems].sort((a, b) => a.quantity - b.quantity)

  for (const din of sortedDin) {
    const target = Math.round(din.quantity)
    const itemLabel = `ITEM ${din.itemNum}`
    const unassigned = products.filter(p => !assignments[p.modelo])
    let found = false

    // Try subsets of size 1, 2, 3...
    for (let size = 1; size <= unassigned.length && !found; size++) {
      const combos = getCombinations(unassigned, size)
      for (const combo of combos) {
        if (combo.reduce((sum, p) => sum + p.cantidad, 0) === target) {
          console.log(`[SubsetSum] ${itemLabel} (${target}) → ${combo.map(p => p.modelo).join(' + ')}`)
          for (const p of combo) assignments[p.modelo] = itemLabel
          found = true
          break
        }
      }
    }
    if (!found) console.log(`[SubsetSum] ${itemLabel} (${target}) → sin match, quedará en blanco`)
  }
  return assignments
}

function getCombinations<T>(arr: T[], size: number): T[][] {
  if (size === 1) return arr.map(x => [x])
  const result: T[][] = []
  for (let i = 0; i <= arr.length - size; i++) {
    const rest = getCombinations(arr.slice(i + 1), size - 1)
    for (const combo of rest) result.push([arr[i], ...combo])
  }
  return result
}

export function crossWithBD(
  invProducts: { modelo: string; cantidad: number }[],
  dinItems: { itemNum: string; quantity: number }[],
  trazabilidad: string
): ProductRow[] {
  // Normalize quantities to integers before any processing
  const normalizedProducts = invProducts.map(p => ({ ...p, cantidad: Math.round(p.cantidad) }))
  // First filter only certifiable products
  const certifiable = normalizedProducts.filter(p => lookupProduct(p.modelo) !== null)
  const notCert = normalizedProducts.filter(p => lookupProduct(p.modelo) === null)
  console.log(`[CrossBD] ${certifiable.length} certificables, ${notCert.length} descartados:`, notCert.map(p => p.modelo).join(', ') || 'ninguno')

  // Normalize DIN item quantities too
  const normalizedDin = dinItems.map(d => ({ ...d, quantity: Math.round(d.quantity) }))

  // Find exact subset-sum assignments
  const assignments = findSubsetSumAssignments(certifiable, normalizedDin)

  return certifiable.map(prod => {
    const entry = lookupProduct(prod.modelo)!
    return {
      id: Math.random().toString(36).slice(2),
      modelo: prod.modelo,
      cantidad: prod.cantidad,
      itemDin: assignments[prod.modelo] || '',
      proto: entry.proto,
      nombre: entry.nombre,
      qr: String(entry.qr),
      sistema: entry.sistema,
      trazabilidad,
    }
  })
}

export async function generateExcel(rows: ProductRow[], invoiceNum: string, dinNum: string): Promise<string> {
  const today = todayFormatted()
  const res = await fetch('/api/generate-excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, invoiceNum, dinNum, fechaSolicitud: today }),
  })
  if (!res.ok) throw new Error(`Excel generation error ${res.status}`)
  const data = await res.json()
  if (!data.base64) throw new Error('No base64 returned from Excel generator')
  return data.base64
}

export async function createDriveFolder(invoiceNum: string, parentFolderId?: string): Promise<string> {
  const res = await fetch('/api/drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_folder', params: { name: invoiceNum, parentId: parentFolderId || '' } }),
  })
  if (!res.ok) throw new Error(`Drive folder error ${res.status}`)
  const data = await res.json()
  return (data.id as string) || ''
}

export async function uploadFileToDrive(b64: string, fileName: string, mimeType: string, folderId: string): Promise<string> {
  const res = await fetch('/api/drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload_file', params: { name: fileName, base64: b64, mimeType, parentId: folderId } }),
  })
  if (!res.ok) throw new Error(`Drive upload error ${res.status}`)
  const data = await res.json()
  return (data.webViewLink as string) || (data.id ? `https://drive.google.com/file/d/${data.id}/view` : '')
}

export async function uploadToDrive(b64: string, fileName: string, folderId?: string): Promise<string> {
  return uploadFileToDrive(b64, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', folderId || '')
}
