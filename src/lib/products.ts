import productsRaw from './productsDB.json'
import noCertRaw from './noChertCodes.json'

export type ProductEntry = {
  nombre: string
  qr: string | number
  cert: string
  proto: string
  sistema: string
}

const PRODUCTS_DB = productsRaw as Record<string, ProductEntry>
const NO_CERT_CODES = new Set((noCertRaw as string[]).map(c => c.trim().toUpperCase()))

function norm(cod: unknown): string {
  let s = String(cod).trim().replace(/\.0+$/, '')
  // Normalize spaces around dashes and standalone spaces to dashes
  // e.g. "HX PLPE27A-B" -> "HX-PLPE27A-B"
  s = s.replace(/\s*-\s*/g, '-').replace(/\s+/g, '-')
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s.toUpperCase()
}

const DB_INDEX: Record<string, ProductEntry> = {}
for (const [k, v] of Object.entries(PRODUCTS_DB)) {
  DB_INDEX[norm(k)] = v
}

// Secondary index: some invoices use supplier codes that appear in the nombre
// field in two formats: plain trailing ("...Blc 99142") or parenthesized ("...(99152)").
// Maps each found 4-6 digit code → { entry, modelo (the real BD model code) }
const DESC_CODE_INDEX: Record<string, { entry: ProductEntry; modelo: string }> = {}
for (const [k, v] of Object.entries(PRODUCTS_DB)) {
  const codes = new Set<string>()
  // Format 1: code in parentheses anywhere in nombre — e.g. "(99152)"
  for (const m of v.nombre.matchAll(/\((\d{4,6})\)/g)) codes.add(m[1])
  // Format 2: plain trailing code — e.g. "...Blc 99142"
  const trail = v.nombre.match(/\b(\d{4,6})\s*$/)
  if (trail) codes.add(trail[1])
  for (const c of codes) {
    // Normalize leading zeros so "09431" and "9431" resolve to the same key
    const key = String(parseInt(c, 10))
    if (!DESC_CODE_INDEX[key]) DESC_CODE_INDEX[key] = { entry: v, modelo: k }
  }
}

export function lookupProduct(codigo: string): ProductEntry | null {
  const normalised = norm(codigo)
  // Check blacklist first — fast skip
  if (NO_CERT_CODES.has(normalised) || NO_CERT_CODES.has(codigo.trim().toUpperCase())) {
    return null
  }
  return DB_INDEX[normalised] || null
}

// Fallback: look up a product by its supplier code embedded in the description.
// Returns { entry, modelo } where modelo is the real BD code (e.g. "EK-ESX4-30-B").
export function lookupProductByDescCode(code: string): { entry: ProductEntry; modelo: string } | null {
  const trimmed = code.trim()
  if (!/^\d{4,6}$/.test(trimmed)) return null
  const key = String(parseInt(trimmed, 10))  // normalize leading zeros: "09431" → "9431"
  if (NO_CERT_CODES.has(key) || NO_CERT_CODES.has(trimmed.toUpperCase())) return null
  return DESC_CODE_INDEX[key] || null
}

export function getCertifiableCount(): number {
  return Object.keys(DB_INDEX).length
}

export function getNoCertCount(): number {
  return NO_CERT_CODES.size
}
