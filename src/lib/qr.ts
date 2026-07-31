import qrDB from './qrDB.json'
import productsRaw from './productsDB.json'

function normalize(code: string): string {
  let c = code.trim().toUpperCase().replace(/\s+/g, '-')
  if (/^\d+$/.test(c)) c = c.replace(/^0+/, '') || '0'
  return c
}

export function lookupQR(modelo: string): string | null {
  const n = normalize(modelo)
  const fromQR = (qrDB as Record<string, string>)[n]
  if (fromQR) return fromQR
  const entry = (productsRaw as Record<string, { qr?: string | number }>)[n]
  return entry?.qr ? String(entry.qr) : null
}

// Returns true if scanned QR matches any expected code for this product
export function verifyQR(modelo: string, scanned: string): boolean {
  const expected = lookupQR(modelo)
  if (!expected || expected === 'N/A') return false
  return expected.split('/').map(s => s.trim()).some(q => scanned.includes(q))
}
