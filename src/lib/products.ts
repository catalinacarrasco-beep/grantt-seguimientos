import productsRaw from './productsDB.json'

export type ProductEntry = {
  nombre: string
  qr: string | number
  cert: string
  proto: string
  sistema: string
}

const PRODUCTS_DB = productsRaw as Record<string, ProductEntry>

function norm(cod: unknown): string {
  const s = String(cod).trim().replace(/\.0+$/, '')
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s.toUpperCase()
}

const DB_INDEX: Record<string, ProductEntry> = {}
for (const [k, v] of Object.entries(PRODUCTS_DB)) {
  DB_INDEX[norm(k)] = v
}

export function lookupProduct(codigo: string): ProductEntry | null {
  return DB_INDEX[norm(codigo)] || null
}

export function getCertifiableCount(): number {
  return Object.keys(DB_INDEX).length
}
