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
    max_tokens: 1000,
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
      ? `Extract from this commercial invoice. The invoice has TWO code columns: a long supplier code (like 09431-Z-BOLT) and a shorter CODE (like 09431).
Return ONLY a valid JSON object. Use double quotes. No markdown. No extra text. No special characters in values.
Format: {"invoiceNum":"CH-GR-SE2507","trazabilidad":"03/2026","products":[{"modelo":"09431","cantidad":10416},{"modelo":"09432","cantidad":4536}]}
Rules: invoiceNum=invoice number, trazabilidad=date as MM/YYYY, modelo=shorter numeric CODE only, cantidad=integer PCS quantity.`
      : `Extract from this Chilean DIN document.
Return ONLY a valid JSON object. Use double quotes. No markdown. No extra text.
Format: {"dinNum":"3630750509-0","items":[{"itemNum":"1","quantity":20000},{"itemNum":"2","quantity":5000}]}
Rules: dinNum=NUMERO DE IDENTIFICACION, items=all line items with itemNum as string and quantity as integer PCS.`

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

export async function parseDIN(file: File): Promise<{ dinNum: string; items: { itemNum: string; quantity: number }[] }> {
  const data = await parsePDF(file, 'din')
  const txt = getText(data)
  return safeParseJSON(txt) as { dinNum: string; items: { itemNum: string; quantity: number }[] }
}

function findSubsetSumAssignments(
  certProducts: { modelo: string; cantidad: number }[],
  dinItems: { itemNum: string; quantity: number }[]
): Record<string, string> {
  const assignments: Record<string, string> = {}
  for (const p of certProducts) assignments[p.modelo] = ''

  // Sort DIN items smallest first for efficiency
  const sortedDin = [...dinItems].sort((a, b) => a.quantity - b.quantity)

  for (const din of sortedDin) {
    const target = din.quantity
    const itemLabel = `ITEM ${din.itemNum}`
    const unassigned = certProducts.filter(p => !assignments[p.modelo])
    let found = false

    // Try subsets of size 1, 2, 3...
    for (let size = 1; size <= unassigned.length && !found; size++) {
      const combos = getCombinations(unassigned, size)
      for (const combo of combos) {
        if (combo.reduce((sum, p) => sum + p.cantidad, 0) === target) {
          for (const p of combo) assignments[p.modelo] = itemLabel
          found = true
          break
        }
      }
    }
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
  // First filter only certifiable products
  const certifiable = invProducts.filter(p => lookupProduct(p.modelo) !== null)

  // Find exact subset-sum assignments
  const assignments = findSubsetSumAssignments(certifiable, dinItems)

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
