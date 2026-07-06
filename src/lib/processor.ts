import { lookupProduct, lookupProductByDescCode } from './products'

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

const MAX_PDF_SIZE = 4 * 1024 * 1024 // 4MB

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function callClaude(content: unknown[]): Promise<unknown> {
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content }],
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 429) {
      await wait((attempt + 1) * 15000)
      continue
    }
    if (!res.ok) throw new Error('Error al leer el documento — intenta de nuevo')
    return res.json()
  }
  throw new Error('Servicio temporalmente ocupado — espera unos segundos e intenta de nuevo')
}

export function getText(d: unknown): string {
  const data = d as { content?: { type: string; text: string }[] }
  return (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
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

  // DINs always go through server-side text extraction (pdf-parse reads all pages
  // deterministically; direct Claude PDF can miss items on late pages of multi-page DINs)
  if (file.size > MAX_PDF_SIZE || type === 'din') {
    const res = await fetch('/api/extract-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: b64, type }),
    })
    if (!res.ok) throw new Error('Error al leer el documento — intenta de nuevo')
    return res.json()
  }

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
Format: {"dinNum":"3630753019-2","items":[{"itemNum":"1","quantity":20160,"description":"PORTALAMPARAS E27"},{"itemNum":"2","quantity":1000,"description":"EXTENSION CABLE CONDUCTOR","supplierCode":"99089"}]}
- dinNum: NUMERO DE IDENTIFICACION (format XXXXXXXXXX-X)
- items: ALL line items with their description in uppercase
- quantity: look for PCS/UNIDADES in "observaciones" or item totals. Chilean format: "9.000,000 PCS" = 9000, "17.400,000 PCS" = 17400 (dot=thousands, comma=decimal). quantity MUST be integer.
- supplierCode: extract the code that appears after the supplier pattern ("NINGBO-F;", "BO-F;", "FEISHUN-F;", etc.). May be numeric ("99142") or alphanumeric ("HX-PLP"). Extract only what follows immediately after the semicolon. Omit if no clear code is present.
- IMPORTANT: Exclude items whose description contains: PVC, CANALETA, TRUNKING, DUCTO, CONDUIT, CARRETE, ACCESORIO, FITTING, BRACKET, CLIPS, TAPA, UNION, CURVA, TEE`

  return callClaude([
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
    { type: 'text', text: prompt },
  ])
}

function safeParseJSON(txt: string): Record<string, unknown> {
  const jsonMatch = txt.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {}
  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    const cleaned = jsonMatch[0]
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/,\s*([\]\}])/g, '$1')
    try { return JSON.parse(cleaned) } catch { return {} }
  }
}

export async function parseInvoice(file: File): Promise<{ invoiceNum: string; trazabilidad: string; products: { modelo: string; cantidad: number }[] }> {
  const data = await parsePDF(file, 'invoice')
  const txt = getText(data)
  return safeParseJSON(txt) as { invoiceNum: string; trazabilidad: string; products: { modelo: string; cantidad: number }[] }
}

const EXCLUDED_DIN_KEYWORDS = ['CANALETA', 'CANALETAS', 'TRUNKING', 'DUCTO', 'DUCTOS', 'CONDUIT', 'CARRETE', 'CARRETES']

function isExcludedDinItem(description: string): boolean {
  const upper = description.toUpperCase()
  if (EXCLUDED_DIN_KEYWORDS.some(kw => upper.includes(kw))) return true
  if (upper.includes('PVC') && /\b(CANAL|DUCT|TUBO|TUBERIA|FITTING|TAPA|UNION|CURVA|TEE|BRACKET|CLIP)\b/.test(upper)) return true
  return false
}

export async function parseDIN(file: File): Promise<{ dinNum: string; items: { itemNum: string; quantity: number; description?: string; supplierCode?: string }[] }> {
  const data = await parsePDF(file, 'din')
  const txt = getText(data)
  const raw = safeParseJSON(txt) as { dinNum: string; items: { itemNum: string; quantity: number; description?: string }[] }

  if (raw.items) {
    raw.items = raw.items.filter(item => {
      if (isExcludedDinItem(item.description || '')) {
        console.log(`[DIN] Descartando ítem ${item.itemNum} (${item.description})`)
        return false
      }
      return true
    })
  }

  return raw
}

// Extracts meaningful words from a DIN description for product matching
function descKeywords(description: string): string[] {
  return description.toUpperCase().split(/[\s,/]+/)
    .filter(w => w.length >= 4)
    .map(w => {
      // Normalize Spanish plurals so "PORTALAMPARAS" matches "PORTALAMPARA", "ALARGADORES" → "ALARGADOR"
      if (w.endsWith('ES') && w.length > 6) return w.slice(0, -2)
      if (w.endsWith('S') && w.length > 5) return w.slice(0, -1)
      return w
    })
}

function findSubsetSumAssignments(
  certProducts: { modelo: string; cantidad: number; nombre: string }[],
  dinItems: { itemNum: string; quantity: number; description?: string; supplierCode?: string }[]
): Record<string, string> {
  const assignments: Record<string, string> = {}
  const products = certProducts.map(p => ({ ...p, cantidad: Math.round(p.cantidad) }))
  for (const p of products) assignments[p.modelo] = ''

  console.log('[SubsetSum] Certificables:', products.map(p => `${p.modelo}(${p.cantidad})`).join(', '))
  console.log('[SubsetSum] DIN:', dinItems.map(d => `ITEM${d.itemNum}=${Math.round(d.quantity)} "${d.description}"`).join(', '))

  // Largest DIN items first — bigger groups are harder to misassign
  const sortedDin = [...dinItems].sort((a, b) => b.quantity - a.quantity)

  for (const din of sortedDin) {
    const target = Math.round(din.quantity)
    const itemLabel = `ITEM ${din.itemNum}`
    const unassigned = products.filter(p => !assignments[p.modelo])
    if (!unassigned.length) continue

    // Priority 1: products whose nombre matches DIN description keywords
    const keywords = descKeywords(din.description || '')
    const byDesc = keywords.length
      ? unassigned.filter(p => keywords.some(kw => p.nombre.toUpperCase().includes(kw)))
      : []

    let found = false

    // Priority 0: code embedded in DIN item name → direct product match
    if (din.supplierCode && !found) {
      const code = din.supplierCode.trim()
      if (/^\d{4,6}$/.test(code)) {
        // Numeric code (YLK format: "NINGBO-F; 99142") → DESC_CODE_INDEX lookup
        const byCode = lookupProductByDescCode(code)
        if (byCode) {
          const match = unassigned.find(p => p.modelo === byCode.modelo)
          if (match) {
            console.log(`[SubsetSum] ${itemLabel} supplierCode=${code} → ${match.modelo}`)
            assignments[match.modelo] = itemLabel
            found = true
          }
        }
      } else {
        // Alphanumeric code (Feishun format: "FEISHUN-F; HX-PLP") → BD model prefix + qty check
        const upper = code.toUpperCase().replace(/\s+/g, '-')
        const match = unassigned.find(p =>
          p.modelo.toUpperCase().replace(/\s+/g, '-').startsWith(upper) && p.cantidad === target
        )
        if (match) {
          console.log(`[SubsetSum] ${itemLabel} modelPrefix=${code} → ${match.modelo}`)
          assignments[match.modelo] = itemLabel
          found = true
        }
      }
    }

    // Try description-filtered group first
    if (byDesc.length) {
      for (let size = 1; size <= byDesc.length && !found; size++) {
        for (const combo of getCombinations(byDesc, size)) {
          if (combo.reduce((s, p) => s + p.cantidad, 0) === target) {
            console.log(`[SubsetSum] ${itemLabel} desc-match → ${combo.map(p => p.modelo).join('+')}`)
            for (const p of combo) assignments[p.modelo] = itemLabel
            found = true; break
          }
        }
      }
    }

    if (!found) console.log(`[SubsetSum] ${itemLabel} (${target}) → sin match — se deja en blanco para asignación manual`)
  }
  return assignments
}

function getCombinations<T>(arr: T[], size: number): T[][] {
  if (size === 1) return arr.map(x => [x])
  const result: T[][] = []
  for (let i = 0; i <= arr.length - size; i++) {
    for (const combo of getCombinations(arr.slice(i + 1), size - 1))
      result.push([arr[i], ...combo])
  }
  return result
}

// Resolve an invoice product code to a BD model code.
// Direct lookup wins; falls back to matching the code against trailing supplier
// codes embedded in BD product descriptions (e.g. "...s/sw Blc 99142" → EK-ESX4-30-B).
function resolveModelo(invoiceModelo: string): string | null {
  if (lookupProduct(invoiceModelo) !== null) return invoiceModelo
  const byDesc = lookupProductByDescCode(invoiceModelo)
  return byDesc ? byDesc.modelo : null
}

export function crossWithBD(
  invProducts: { modelo: string; cantidad: number }[],
  dinItems: { itemNum: string; quantity: number; description?: string; supplierCode?: string }[],
  trazabilidad: string
): ProductRow[] {
  const normalizedProducts = invProducts.map(p => ({ ...p, cantidad: Math.round(p.cantidad) }))

  // Resolve each invoice code → BD model code (direct or via description lookup)
  const certifiable: { modelo: string; cantidad: number }[] = []
  const notCert: string[] = []
  for (const p of normalizedProducts) {
    const resolved = resolveModelo(p.modelo)
    if (resolved) certifiable.push({ modelo: resolved, cantidad: p.cantidad })
    else notCert.push(p.modelo)
  }

  console.log(`[CrossBD] ${certifiable.length} certificables, ${notCert.length} descartados:`, notCert.join(', ') || 'ninguno')

  const normalizedDin = dinItems.map(d => ({ ...d, quantity: Math.round(d.quantity) }))

  // Pass nombre so subset-sum can use description matching
  const certWithNames = certifiable.map(p => ({ ...p, nombre: lookupProduct(p.modelo)!.nombre }))
  const assignments = findSubsetSumAssignments(certWithNames, normalizedDin)

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
  const res = await fetch('/api/generate-excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, invoiceNum, dinNum, fechaSolicitud: todayFormatted() }),
  })
  if (!res.ok) throw new Error('Error generando el Excel — intenta de nuevo')
  const data = await res.json()
  if (!data.base64) throw new Error('Error generando el Excel — intenta de nuevo')
  return data.base64
}

export async function uploadFileToDrive(b64: string, fileName: string, mimeType: string, folderId: string): Promise<string> {
  const res = await fetch('/api/drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload_file', params: { name: fileName, base64: b64, mimeType, parentId: folderId } }),
  })
  if (!res.ok) throw new Error('Error al subir a Drive — revisa tu conexión e intenta de nuevo')
  const data = await res.json()
  return (data.webViewLink as string) || (data.id ? `https://drive.google.com/file/d/${data.id}/view` : '')
}

export async function uploadToDrive(b64: string, fileName: string, folderId?: string): Promise<string> {
  return uploadFileToDrive(b64, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', folderId || '')
}
