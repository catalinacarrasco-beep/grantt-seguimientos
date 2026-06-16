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
  const s = String(cod).trim().replace(/\.0+$/, '')
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s.toUpperCase()
}

const DB_INDEX: Record<string, ProductEntry> = {}
for (const [k, v] of Object.entries(PRODUCTS_DB)) {
  DB_INDEX[norm(k)] = v
}

export function lookupProduct(codigo: string): ProductEntry | null {
  const normalised = norm(codigo)
  // Check blacklist first — fast skip
  if (NO_CERT_CODES.has(normalised) || NO_CERT_CODES.has(codigo.trim().toUpperCase())) {
    return null
  }
  return DB_INDEX[normalised] || null
}

export function getCertifiableCount(): number {
  return Object.keys(DB_INDEX).length
}

export function getNoCertCount(): number {
  return NO_CERT_CODES.size
}
